import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerNeeds, customers } from "@/db/schema";
import { diffNeeds, toSnapshot, type NeedsSnapshot } from "./needs";

/**
 * 니즈 변경을 새 버전으로 저장합니다. 바뀐 항목이 없으면 저장하지 않습니다.
 * 권한 확인은 호출하는 쪽에서 먼저 해야 합니다. (통화 요약 연동 시에도 재사용)
 */
export async function saveNeedsVersion(
  userId: string,
  customerId: string,
  next: NeedsSnapshot,
  reason: string | null,
  source: "manual" | "call_summary" | "import" = "manual",
) {
  return db.transaction(async (tx) => {
    // 같은 고객에 대한 동시 저장으로 버전 번호가 겹치지 않도록 고객 행을 잠급니다.
    await tx.execute(sql`select 1 from ${customers} where ${customers.id} = ${customerId} for update`);
    const [latest] = await tx
      .select()
      .from(customerNeeds)
      .where(eq(customerNeeds.customerId, customerId))
      .orderBy(desc(customerNeeds.version))
      .limit(1);
    const changes = diffNeeds(latest ? toSnapshot(latest) : null, next);
    if (changes.length === 0) return { version: latest?.version ?? 0, changes };
    const version = (latest?.version ?? 0) + 1;
    await tx.insert(customerNeeds).values({ customerId, version, ...next, reason, source, changedBy: userId });
    await tx.update(customers).set({ updatedAt: new Date() }).where(eq(customers.id, customerId));
    return { version, changes };
  });
}
