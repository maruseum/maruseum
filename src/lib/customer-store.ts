import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, interactions } from "@/db/schema";
import { audit } from "./audit";
import { CUSTOMER_STAGE_LABEL } from "./labels";

export type Stage = keyof typeof CUSTOMER_STAGE_LABEL;
export const STAGES = Object.keys(CUSTOMER_STAGE_LABEL) as Stage[];

/**
 * 고객 진행 단계를 바꾸고 메모·감사 로그를 남깁니다. 같은 단계면 아무것도 하지 않습니다.
 * 권한 확인은 호출하는 쪽에서 먼저 해야 합니다.
 */
export async function changeStage(userId: string, customer: { id: string; stage: Stage }, stage: Stage, note?: string) {
  if (customer.stage === stage) return false;
  await db.update(customers).set({ stage, updatedAt: new Date() }).where(eq(customers.id, customer.id));
  await db.insert(interactions).values({
    customerId: customer.id,
    userId,
    kind: "memo",
    title: `진행 단계 변경: ${CUSTOMER_STAGE_LABEL[customer.stage]} → ${CUSTOMER_STAGE_LABEL[stage]}`,
    content: note ?? null,
  });
  await audit({
    userId,
    action: "stage_change",
    entityType: "customer",
    entityId: customer.id,
    detail: { from: customer.stage, to: stage },
  });
  return true;
}
