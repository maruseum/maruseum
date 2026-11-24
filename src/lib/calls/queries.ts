import "server-only";
import { and, desc, eq, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { customers, recordings, users } from "@/db/schema";
import { canViewRecording, customerScope, type Actor } from "../authz";
import { phoneDigits } from "../import/values";
import type { ParsedCallFile } from "./filename";

/**
 * 파일명의 상대(번호·이름)로 고객을 찾습니다. 내가 볼 수 있는 고객 중 정확히 한 명일 때만 연결합니다.
 */
export async function findCustomerForCall(actor: Actor, parsed: ParsedCallFile): Promise<string | null> {
  const scope = customerScope(actor);
  const digits = phoneDigits(parsed.phone);
  if (digits.length >= 9) {
    const rows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(scope, sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') = ${digits}`))
      .limit(2);
    if (rows.length === 1) return rows[0].id;
  }
  if (parsed.name) {
    const name = parsed.name.replace(/\s/g, "");
    const rows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(scope, sql`replace(${customers.name}, ' ', '') = ${name}`))
      .limit(2);
    if (rows.length === 1) return rows[0].id;
  }
  return null;
}

const assignee = alias(users, "c_assignee");
const uploader = alias(users, "uploader");

const listCols = {
  id: recordings.id,
  fileName: recordings.fileName,
  status: recordings.status,
  error: recordings.error,
  contactLabel: recordings.contactLabel,
  recordedAt: recordings.recordedAt,
  createdAt: recordings.createdAt,
  updatedAt: recordings.updatedAt,
  durationSec: recordings.durationSec,
  summary: recordings.summary,
  customerId: recordings.customerId,
  customerName: customers.name,
  uploaderName: uploader.name,
  interactionId: recordings.interactionId,
};

/** 내가 볼 수 있는 녹음: 내가 올린 것 + 볼 수 있는 고객에 연결된 것 (관리자는 전체) */
function recordingScope(actor: Actor): SQL | undefined {
  if (actor.role === "admin") return undefined;
  return or(eq(recordings.uploadedBy, actor.id), and(isNotNull(recordings.customerId), customerScope(actor)));
}

export async function listRecordings(actor: Actor, opts: { customerId?: string; onlyMine?: boolean; limit?: number } = {}) {
  return db
    .select(listCols)
    .from(recordings)
    .leftJoin(customers, eq(customers.id, recordings.customerId))
    .leftJoin(uploader, eq(uploader.id, recordings.uploadedBy))
    .where(
      and(
        recordingScope(actor),
        opts.customerId ? eq(recordings.customerId, opts.customerId) : undefined,
        opts.onlyMine ? eq(recordings.uploadedBy, actor.id) : undefined,
      ),
    )
    .orderBy(sql`coalesce(${recordings.recordedAt}, ${recordings.createdAt}) desc`)
    .limit(opts.limit ?? 100);
}

export type RecordingListRow = Awaited<ReturnType<typeof listRecordings>>[number];

/** 권한 확인을 거친 녹음 1건 */
export async function getRecordingFor(actor: Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({
      rec: recordings,
      customerName: customers.name,
      customerCompany: customers.companyName,
      customerAssigneeId: customers.assigneeId,
      customerAssigneeTeamId: assignee.teamId,
      uploaderName: uploader.name,
    })
    .from(recordings)
    .leftJoin(customers, eq(customers.id, recordings.customerId))
    .leftJoin(assignee, eq(assignee.id, customers.assigneeId))
    .leftJoin(uploader, eq(uploader.id, recordings.uploadedBy))
    .where(eq(recordings.id, id))
    .limit(1);
  if (!row) return null;
  const linked = row.rec.customerId ? { id: row.customerAssigneeId, teamId: row.customerAssigneeTeamId } : null;
  if (!canViewRecording(actor, row.rec, linked)) return null;
  return row;
}

/** 고객 연결용 선택지: 내가 볼 수 있는 진행 중 고객 */
export async function customerOptions(actor: Actor) {
  return db
    .select({ id: customers.id, name: customers.name, companyName: customers.companyName, phone: customers.phone })
    .from(customers)
    .where(customerScope(actor))
    .orderBy(desc(customers.lastContactedAt))
    .limit(500);
}
