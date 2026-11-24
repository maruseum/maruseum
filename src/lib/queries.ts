import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { customerNeeds, customers, users } from "@/db/schema";
import { canViewCustomer, type Actor } from "./authz";

const assignee = alias(users, "assignee");

/** 권한 확인을 거친 고객 1건. 볼 수 없으면 null */
export async function getCustomerFor(actor: Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({
      customer: customers,
      assigneeName: assignee.name,
      assigneeTeamId: assignee.teamId,
    })
    .from(customers)
    .leftJoin(assignee, eq(assignee.id, customers.assigneeId))
    .where(eq(customers.id, id))
    .limit(1);
  if (!row) return null;
  if (!canViewCustomer(actor, { id: row.customer.assigneeId, teamId: row.assigneeTeamId })) return null;
  return row;
}

export async function getNeedsHistory(customerId: string) {
  return db
    .select({ needs: customerNeeds, changedByName: users.name })
    .from(customerNeeds)
    .leftJoin(users, eq(users.id, customerNeeds.changedBy))
    .where(eq(customerNeeds.customerId, customerId))
    .orderBy(desc(customerNeeds.version));
}

export async function listStaff() {
  return db
    .select({ id: users.id, name: users.name, teamId: users.teamId })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));
}

export function staffOptions(staff: { id: string; name: string }[]): [string, string][] {
  return staff.map((s) => [s.id, s.name]);
}
