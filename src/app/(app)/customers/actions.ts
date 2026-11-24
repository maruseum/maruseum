"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { customers, interactions, properties } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser, type CurrentUser } from "@/lib/auth/dal";
import { canReassign } from "@/lib/authz";
import { parseSeoulDateTime } from "@/lib/format";
import { FormError, handleForm, oneOf, required, str, type ActionState } from "@/lib/form";
import { changeStage, STAGES } from "@/lib/customer-store";
import { CUSTOMER_TYPE_LABEL, INTERACTION_KIND_LABEL } from "@/lib/labels";
import { isEmptyNeeds, parseNeedsForm } from "@/lib/needs";
import { saveNeedsVersion } from "@/lib/needs-store";
import { getCustomerFor } from "@/lib/queries";

const TYPES = Object.keys(CUSTOMER_TYPE_LABEL) as (keyof typeof CUSTOMER_TYPE_LABEL)[];
const KINDS = Object.keys(INTERACTION_KIND_LABEL) as (keyof typeof INTERACTION_KIND_LABEL)[];

async function loadOrFail(user: CurrentUser, id: string) {
  const row = await getCustomerFor(user, id);
  if (!row) throw new FormError("고객을 찾을 수 없거나 권한이 없습니다.");
  return row;
}

function readBasics(fd: FormData) {
  return {
    name: required(fd, "name", "고객 이름"),
    customerType: oneOf(str(fd, "customerType") ?? "individual", TYPES, "고객 구분"),
    companyName: str(fd, "companyName"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    source: str(fd, "source"),
    memo: str(fd, "memo"),
  };
}

/** 담당자 지정은 관리자·팀장만. 직원은 기존 값(신규면 본인)을 유지합니다. */
function resolveAssignee(user: CurrentUser, fd: FormData, fallback: string | null): string | null {
  if (!canReassign(user)) return fallback;
  return str(fd, "assigneeId");
}

export async function createCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let newId = "";
  const res = await handleForm(async () => {
    const basics = readBasics(fd);
    const needs = parseNeedsForm(fd);
    const assigneeId = resolveAssignee(user, fd, user.id);

    const [c] = await db.insert(customers).values({ ...basics, assigneeId }).returning({ id: customers.id });
    newId = c.id;
    if (!isEmptyNeeds(needs)) await saveNeedsVersion(user.id, newId, needs, "최초 등록");
    await audit({ userId: user.id, action: "create", entityType: "customer", entityId: newId });
  });
  if (res?.error) return res;
  redirect(`/customers/${newId}`);
}

export async function updateCustomer(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await handleForm(async () => {
    const { customer } = await loadOrFail(user, id);
    const basics = readBasics(fd);
    const assigneeId = resolveAssignee(user, fd, customer.assigneeId);
    await db
      .update(customers)
      .set({ ...basics, assigneeId, updatedAt: new Date() })
      .where(eq(customers.id, id));
    await audit({
      userId: user.id,
      action: "update",
      entityType: "customer",
      entityId: id,
      detail: assigneeId !== customer.assigneeId ? { assignee: { from: customer.assigneeId, to: assigneeId } } : null,
    });
  });
  if (res?.error) return res;
  redirect(`/customers/${id}`);
}

export async function updateStage(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return handleForm(async () => {
    const { customer } = await loadOrFail(user, id);
    const stage = oneOf(str(fd, "stage"), STAGES, "진행 단계");
    if (!(await changeStage(user.id, customer, stage))) return { ok: "변경 없음", at: Date.now() };
    revalidatePath(`/customers/${id}`);
    return { ok: "단계를 변경했습니다.", at: Date.now() };
  });
}

/** 칸반 보드에서 카드를 옮길 때. 성공하면 null, 실패하면 오류 문구 */
export async function moveStage(id: string, stage: string): Promise<string | null> {
  const user = await requireUser();
  const row = await getCustomerFor(user, id);
  if (!row) return "고객을 찾을 수 없거나 권한이 없습니다.";
  if (!(STAGES as string[]).includes(stage)) return "진행 단계 값이 올바르지 않습니다.";
  await changeStage(user.id, row.customer, stage as (typeof STAGES)[number]);
  revalidatePath("/customers/board");
  revalidatePath(`/customers/${id}`);
  return null;
}

export async function updateNeeds(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return handleForm(async () => {
    await loadOrFail(user, id);
    const next = parseNeedsForm(fd);
    const { version, changes } = await saveNeedsVersion(user.id, id, next, str(fd, "reason"));
    if (changes.length === 0) throw new FormError("바뀐 내용이 없습니다.");
    await audit({
      userId: user.id,
      action: "needs_update",
      entityType: "customer",
      entityId: id,
      detail: { version, fields: changes.map((c) => c.field) },
    });
    revalidatePath(`/customers/${id}`);
    return { ok: `니즈 v${version} 저장 (${changes.length}개 항목 변경)`, at: Date.now() };
  });
}

export async function addInteraction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return handleForm(async () => {
    await loadOrFail(user, id);
    const kind = oneOf(str(fd, "kind"), KINDS, "기록 종류");
    const occurredAt = parseSeoulDateTime(fd.get("occurredAt")) ?? new Date();
    const propertyId = str(fd, "propertyId");
    if (propertyId) {
      const [p] = await db.select({ id: properties.id }).from(properties).where(eq(properties.id, propertyId));
      if (!p) throw new FormError("연결할 물건을 찾을 수 없습니다.");
    }
    await db.insert(interactions).values({
      customerId: id,
      propertyId,
      userId: user.id,
      kind,
      occurredAt,
      title: required(fd, "title", "제목"),
      content: str(fd, "content"),
    });
    // 메모는 고객과의 접촉이 아니므로 최근 연락일을 바꾸지 않습니다.
    if (kind !== "memo") {
      await db
        .update(customers)
        .set({
          lastContactedAt: sql`greatest(coalesce(${customers.lastContactedAt}, ${occurredAt}), ${occurredAt})`,
        })
        .where(eq(customers.id, id));
    }
    revalidatePath(`/customers/${id}`);
    return { ok: "기록했습니다.", at: Date.now() };
  });
}
