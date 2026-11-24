import "server-only";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerNeeds, customers, interactions, recordings, tasks } from "@/db/schema";
import { toSnapshot } from "../needs";
import { dueDateToDate } from "./prompt";
import { absolutePath } from "./storage";
import { summarizeCall, SummaryError } from "./summarize";
import { CallSummarySchema, INTENT_LABEL, type CallSummary } from "./summary-schema";
import { SttError, transcribe } from "./stt";

/** 이 시간 넘게 처리 중이면 서버가 재시작된 것으로 보고 재처리를 허용합니다. */
export const STALE_MS = 20 * 60 * 1000;
const MAX_CONCURRENT = 2;

// ─── 간단한 처리 대기열 (서버 프로세스 하나 기준) ───────────────

const queue: string[] = [];
let running = 0;

export function enqueueRecording(id: string): void {
  if (!queue.includes(id)) queue.push(id);
  drain();
}

function drain() {
  while (running < MAX_CONCURRENT && queue.length) {
    const id = queue.shift()!;
    running++;
    processRecording(id)
      .catch((e) => console.error("[recordings] 처리 실패", id, e))
      .finally(() => {
        running--;
        drain();
      });
  }
}

/** 처리 시작 권한을 잡습니다. 이미 다른 곳에서 처리 중이면 false */
async function claim(id: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const rows = await db
    .update(recordings)
    .set({ status: "transcribing", error: null, updatedAt: new Date() })
    .where(
      and(
        eq(recordings.id, id),
        or(
          inArray(recordings.status, ["uploaded", "failed"]),
          and(inArray(recordings.status, ["transcribing", "summarizing"]), lt(recordings.updatedAt, staleBefore)),
        ),
      ),
    )
    .returning({ id: recordings.id });
  return rows.length > 0;
}

export async function processRecording(id: string): Promise<void> {
  if (!(await claim(id))) return;
  const [rec] = await db.select().from(recordings).where(eq(recordings.id, id));
  try {
    let transcript = rec.transcript;
    if (!transcript) {
      if (!rec.storageKey) throw new SttError("음성 파일이 삭제돼 다시 인식할 수 없습니다.");
      const t = await transcribe(absolutePath(rec.storageKey));
      transcript = t.text;
      await db
        .update(recordings)
        .set({ transcript, durationSec: t.durationSec, status: "summarizing", updatedAt: new Date() })
        .where(eq(recordings.id, id));
    } else {
      await db.update(recordings).set({ status: "summarizing", updatedAt: new Date() }).where(eq(recordings.id, id));
    }

    const ctx = await summaryContext(rec.customerId, rec.recordedAt ?? rec.createdAt);
    const summary = await summarizeCall(transcript, ctx);
    await db
      .update(recordings)
      .set({ summary, status: "done", updatedAt: new Date() })
      .where(eq(recordings.id, id));

    if (rec.customerId) await applyToCustomer(id);
  } catch (e) {
    const known = e instanceof SttError || e instanceof SummaryError;
    if (!known) console.error("[recordings] 예기치 않은 오류", id, e);
    await db
      .update(recordings)
      .set({ status: "failed", error: known ? (e as Error).message : "처리 중 오류가 났습니다. 재처리해 주세요.", updatedAt: new Date() })
      .where(eq(recordings.id, id));
  }
}

async function summaryContext(customerId: string | null, recordedAt: Date) {
  if (!customerId) return { recordedAt, customerName: null, companyName: null, currentNeeds: null };
  const [c] = await db
    .select({ name: customers.name, companyName: customers.companyName })
    .from(customers)
    .where(eq(customers.id, customerId));
  const [n] = await db
    .select()
    .from(customerNeeds)
    .where(eq(customerNeeds.customerId, customerId))
    .orderBy(desc(customerNeeds.version))
    .limit(1);
  return {
    recordedAt,
    customerName: c?.name ?? null,
    companyName: c?.companyName ?? null,
    currentNeeds: n ? toSnapshot(n) : null,
  };
}

export function readSummary(raw: unknown): CallSummary | null {
  const r = CallSummarySchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** 요약 → 상담 기록 내용 */
export function interactionContent(s: CallSummary, recordingId: string): string {
  const lines = s.summary.map((b) => `• ${b}`);
  lines.push(`매입 의지: ${INTENT_LABEL[s.customerIntent]}`);
  if (s.nextContact) lines.push(`다음 연락: ${s.nextContact}`);
  const customerTodo = s.actionItems.filter((a) => a.owner === "customer");
  if (customerTodo.length) lines.push(`고객이 하기로 한 일: ${customerTodo.map((a) => a.title).join(", ")}`);
  lines.push(`(통화 녹음 요약 · /calls/${recordingId})`);
  return lines.join("\n");
}

/**
 * 요약을 고객 기록에 반영합니다: 상담 기록(통화) 1건 + 직원 할 일 + 최근 연락일.
 * 녹음 1건당 한 번만 반영됩니다 (행 잠금). 니즈 변경은 직원이 확인 후 따로 반영합니다.
 */
export async function applyToCustomer(recordingId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [rec] = await tx.select().from(recordings).where(eq(recordings.id, recordingId)).for("update");
    if (!rec || !rec.customerId || rec.interactionId || rec.status !== "done") return false;
    const summary = readSummary(rec.summary);
    if (!summary) return false;

    const [c] = await tx.select({ assigneeId: customers.assigneeId }).from(customers).where(eq(customers.id, rec.customerId));
    const occurredAt = rec.recordedAt ?? rec.createdAt;
    const [it] = await tx
      .insert(interactions)
      .values({
        customerId: rec.customerId,
        userId: rec.uploadedBy,
        kind: "call",
        occurredAt,
        title: summary.headline,
        content: interactionContent(summary, rec.id),
      })
      .returning({ id: interactions.id });

    const agentTodo = summary.actionItems.filter((a) => a.owner === "agent");
    if (agentTodo.length) {
      await tx.insert(tasks).values(
        agentTodo.map((a) => ({
          title: a.title,
          description: "통화 요약에서 자동 생성",
          dueAt: dueDateToDate(a.dueDate),
          assigneeId: c?.assigneeId ?? rec.uploadedBy,
          customerId: rec.customerId,
          createdBy: rec.uploadedBy,
        })),
      );
    }
    await tx
      .update(customers)
      .set({ lastContactedAt: sql`greatest(coalesce(${customers.lastContactedAt}, ${occurredAt}), ${occurredAt})` })
      .where(eq(customers.id, rec.customerId));
    await tx.update(recordings).set({ interactionId: it.id, updatedAt: new Date() }).where(eq(recordings.id, rec.id));
    return true;
  });
}

/** 보관 기간이 지난 음성 파일을 지웁니다 (녹취록·요약은 남김). RECORDING_AUDIO_RETENTION_DAYS, 기본 180일 */
export async function purgeOldAudio(deleteFile: (key: string) => Promise<void>): Promise<number> {
  const days = Number(process.env.RECORDING_AUDIO_RETENTION_DAYS ?? 180);
  if (!Number.isFinite(days) || days <= 0) return 0;
  const before = new Date(Date.now() - days * 86_400_000);
  const old = await db
    .select({ id: recordings.id, key: recordings.storageKey })
    .from(recordings)
    .where(and(lt(recordings.createdAt, before), sql`${recordings.storageKey} is not null`, eq(recordings.status, "done")))
    .limit(200);
  for (const r of old) {
    await deleteFile(r.key!);
    await db.update(recordings).set({ storageKey: null, updatedAt: new Date() }).where(eq(recordings.id, r.id));
  }
  return old.length;
}
