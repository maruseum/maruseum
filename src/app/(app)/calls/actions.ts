"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { customerNeeds, recordings } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { applyToCustomer, enqueueRecording, readSummary, STALE_MS } from "@/lib/calls/process";
import { mergeNeedsChange } from "@/lib/calls/prompt";
import { getRecordingFor } from "@/lib/calls/queries";
import { deleteStored } from "@/lib/calls/storage";
import { formatDate } from "@/lib/format";
import { FormError, handleForm, type ActionState } from "@/lib/form";
import { toSnapshot } from "@/lib/needs";
import { saveNeedsVersion } from "@/lib/needs-store";
import { getCustomerFor } from "@/lib/queries";

function refresh(recordingId: string, customerId?: string | null) {
  revalidatePath("/calls");
  revalidatePath(`/calls/${recordingId}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

/** 고객이 자동으로 연결되지 않은 녹음을 고객에 연결합니다. 요약이 끝났으면 바로 고객 기록에 반영합니다. */
export async function linkRecordingCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return handleForm(async () => {
    const row = await getRecordingFor(user, String(fd.get("recordingId") ?? ""));
    if (!row) throw new FormError("녹음을 찾을 수 없거나 권한이 없습니다.");
    if (row.rec.interactionId) throw new FormError("이미 고객 기록에 반영된 녹음입니다.");
    const customerId = String(fd.get("customerId") ?? "");
    if (!(await getCustomerFor(user, customerId))) throw new FormError("고객을 선택해 주세요.");

    await db.update(recordings).set({ customerId, updatedAt: new Date() }).where(eq(recordings.id, row.rec.id));
    if (row.rec.status === "done") await applyToCustomer(row.rec.id);
    await audit({
      userId: user.id,
      action: "link_customer",
      entityType: "recording",
      entityId: row.rec.id,
      detail: { customerId },
    });
    refresh(row.rec.id, customerId);
    return { ok: "고객에 연결했습니다.", at: Date.now() };
  });
}

/** 실패했거나 오래 멈춘 녹음을 다시 처리합니다. */
export async function reprocessRecording(fd: FormData): Promise<void> {
  const user = await requireUser();
  const row = await getRecordingFor(user, String(fd.get("recordingId") ?? ""));
  if (!row) return;
  const stale = Date.now() - row.rec.updatedAt.getTime() > STALE_MS;
  if (row.rec.status !== "failed" && !(stale && row.rec.status !== "done")) return;
  await audit({ userId: user.id, action: "reprocess", entityType: "recording", entityId: row.rec.id });
  after(() => enqueueRecording(row.rec.id));
  refresh(row.rec.id, row.rec.customerId);
}

/** 통화 요약의 니즈 변경 제안을 고객 니즈 새 버전으로 반영합니다. */
export async function applyNeedsFromCall(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return handleForm(async () => {
    const row = await getRecordingFor(user, String(fd.get("recordingId") ?? ""));
    if (!row || !row.rec.customerId) throw new FormError("고객이 연결된 녹음이 아닙니다.");
    if (!(await getCustomerFor(user, row.rec.customerId))) throw new FormError("이 고객의 니즈를 바꿀 권한이 없습니다.");
    if (row.rec.needsAppliedAt) throw new FormError("이미 반영했습니다.");
    const change = readSummary(row.rec.summary)?.needsChange;
    if (!change) throw new FormError("이 통화에는 니즈 변경 제안이 없습니다.");

    const [latest] = await db
      .select()
      .from(customerNeeds)
      .where(eq(customerNeeds.customerId, row.rec.customerId))
      .orderBy(desc(customerNeeds.version))
      .limit(1);
    const next = mergeNeedsChange(latest ? toSnapshot(latest) : null, change);
    const when = formatDate(row.rec.recordedAt ?? row.rec.createdAt);
    const { version, changes } = await saveNeedsVersion(
      user.id,
      row.rec.customerId,
      next,
      `${when} 통화: ${change.evidence}`.slice(0, 500),
      "call_summary",
    );
    await db
      .update(recordings)
      .set({ needsAppliedAt: new Date(), updatedAt: new Date() })
      .where(eq(recordings.id, row.rec.id));
    await audit({
      userId: user.id,
      action: "needs_update",
      entityType: "customer",
      entityId: row.rec.customerId,
      detail: { version, fields: changes.map((c) => c.field), recordingId: row.rec.id },
    });
    refresh(row.rec.id, row.rec.customerId);
    return changes.length
      ? { ok: `니즈 v${version}으로 반영했습니다 (${changes.length}개 항목).`, at: Date.now() }
      : { ok: "현재 니즈와 같아서 바뀐 것은 없습니다.", at: Date.now() };
  });
}

/** 음성 파일만 지웁니다 (녹취록·요약은 남김). 올린 본인 또는 관리자. */
export async function deleteRecordingAudio(fd: FormData): Promise<void> {
  const user = await requireUser();
  const row = await getRecordingFor(user, String(fd.get("recordingId") ?? ""));
  if (!row || !row.rec.storageKey) return;
  if (user.role !== "admin" && row.rec.uploadedBy !== user.id) return;
  if (row.rec.status === "transcribing" || row.rec.status === "uploaded") return;
  await deleteStored(row.rec.storageKey);
  await db.update(recordings).set({ storageKey: null, updatedAt: new Date() }).where(eq(recordings.id, row.rec.id));
  await audit({ userId: user.id, action: "delete_audio", entityType: "recording", entityId: row.rec.id });
  refresh(row.rec.id, row.rec.customerId);
}
