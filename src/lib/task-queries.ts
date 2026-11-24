import "server-only";
import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { customers, properties, tasks, users } from "@/db/schema";
import type { Actor } from "./authz";
import type { TaskRow } from "@/components/task-list";

/** 할 일 열람 범위: 직원은 본인 담당·본인 생성, 팀장은 팀원 것까지, 관리자는 전체 */
export function taskScope(actor: Actor, onlyMine: boolean): SQL | undefined {
  if (onlyMine) return eq(tasks.assigneeId, actor.id);
  if (actor.role === "admin") return undefined;
  if (actor.role === "manager") {
    return or(
      eq(tasks.assigneeId, actor.id),
      eq(tasks.createdBy, actor.id),
      sql`${tasks.assigneeId} in (select ${users.id} from ${users} where ${users.teamId} = ${actor.teamId ?? -1})`,
    );
  }
  return or(eq(tasks.assigneeId, actor.id), eq(tasks.createdBy, actor.id));
}

export async function listTasks(where: SQL | undefined, limit = 200): Promise<TaskRow[]> {
  const assignee = alias(users, "assignee");
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      dueAt: tasks.dueAt,
      status: tasks.status,
      assigneeName: assignee.name,
      customerId: tasks.customerId,
      customerName: customers.name,
      propertyId: tasks.propertyId,
      propertyTitle: properties.title,
    })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(customers, eq(customers.id, tasks.customerId))
    .leftJoin(properties, eq(properties.id, tasks.propertyId))
    .where(where)
    .orderBy(sql`${tasks.dueAt} asc nulls last`, tasks.createdAt)
    .limit(limit);
}

/** 내 미완료 할 일 수와 그중 마감이 지난 수 */
export async function countMyOpenTasks(actor: Actor) {
  const [row] = await db
    .select({
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.dueAt} < now())::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, actor.id), eq(tasks.status, "open")));
  return row ?? { open: 0, overdue: 0 };
}
