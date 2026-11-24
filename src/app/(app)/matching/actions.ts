"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { customers, interactions, properties, proposals } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { changeStage } from "@/lib/customer-store";
import { getCustomerFor } from "@/lib/queries";

const UUID = /^[0-9a-f-]{36}$/i;
const STATUS_LABEL = { proposed: "제안함", interested: "관심", rejected: "거절" } as const;
type Status = keyof typeof STATUS_LABEL;

function refresh(customerId: string, propertyId: string) {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/matching");
}

async function load(fd: FormData) {
  const user = await requireUser();
  const customerId = String(fd.get("customerId") ?? "");
  const propertyId = String(fd.get("propertyId") ?? "");
  if (!UUID.test(customerId) || !UUID.test(propertyId)) return null;
  const row = await getCustomerFor(user, customerId);
  if (!row) return null;
  const [property] = await db
    .select({ id: properties.id, title: properties.title })
    .from(properties)
    .where(eq(properties.id, propertyId));
  if (!property) return null;
  return { user, customer: row.customer, property };
}

/** 매칭된 물건을 고객에게 제안했다고 기록합니다. 신규·상담 단계 고객은 "물건 제안" 단계로 올립니다. */
export async function proposeProperty(fd: FormData): Promise<void> {
  const ctx = await load(fd);
  if (!ctx) return;
  const { user, customer, property } = ctx;

  const inserted = await db
    .insert(proposals)
    .values({ customerId: customer.id, propertyId: property.id, createdBy: user.id })
    .onConflictDoNothing()
    .returning({ id: proposals.id });
  if (inserted.length === 0) return refresh(customer.id, property.id);

  const now = new Date();
  await db.insert(interactions).values({
    customerId: customer.id,
    propertyId: property.id,
    userId: user.id,
    kind: "message",
    occurredAt: now,
    title: `물건 제안: ${property.title}`,
  });
  await db
    .update(customers)
    .set({ lastContactedAt: sql`greatest(coalesce(${customers.lastContactedAt}, ${now}), ${now})` })
    .where(eq(customers.id, customer.id));
  if (customer.stage === "new" || customer.stage === "consulting") {
    await changeStage(user.id, customer, "proposing", `물건 제안으로 자동 변경 (${property.title})`);
  }
  await audit({
    userId: user.id,
    action: "propose",
    entityType: "customer",
    entityId: customer.id,
    detail: { propertyId: property.id },
  });
  refresh(customer.id, property.id);
}

/** 제안에 대한 고객 반응 (관심 / 거절 / 다시 제안함) */
export async function setProposalStatus(fd: FormData): Promise<void> {
  const ctx = await load(fd);
  if (!ctx) return;
  const status = String(fd.get("status") ?? "") as Status;
  if (!(status in STATUS_LABEL)) return;
  const { user, customer, property } = ctx;

  const updated = await db
    .update(proposals)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(proposals.customerId, customer.id), eq(proposals.propertyId, property.id)))
    .returning({ id: proposals.id });
  if (updated.length === 0) return;

  await db.insert(interactions).values({
    customerId: customer.id,
    propertyId: property.id,
    userId: user.id,
    kind: "memo",
    title: `제안 반응: ${property.title} → ${STATUS_LABEL[status]}`,
  });
  await audit({
    userId: user.id,
    action: "proposal_status",
    entityType: "customer",
    entityId: customer.id,
    detail: { propertyId: property.id, status },
  });
  refresh(customer.id, property.id);
}
