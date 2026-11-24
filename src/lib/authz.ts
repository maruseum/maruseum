import { eq, or, sql, type SQL } from "drizzle-orm";
import { customers, users } from "@/db/schema";

export type Role = "admin" | "manager" | "agent";

export interface Actor {
  id: string;
  role: Role;
  teamId: number | null;
}

export interface AssigneeRef {
  id: string | null;
  teamId: number | null;
}

/**
 * 고객 열람 권한
 * - 관리자: 전체
 * - 팀장: 본인 담당 + 같은 팀원이 담당하는 고객 + 담당자 미지정 고객
 * - 직원: 본인 담당 고객만
 */
export function canViewCustomer(actor: Actor, assignee: AssigneeRef): boolean {
  if (actor.role === "admin") return true;
  if (assignee.id === actor.id) return true;
  if (actor.role === "manager") {
    if (assignee.id === null) return true;
    return actor.teamId !== null && assignee.teamId === actor.teamId;
  }
  return false;
}

/** 고객 담당자 변경은 관리자·팀장만 가능합니다. */
export function canReassign(actor: Actor): boolean {
  return actor.role === "admin" || actor.role === "manager";
}

/** 물건 수정: 관리자·팀장, 담당자, 등록자 (물건 열람은 전 직원 공유) */
export function canEditProperty(actor: Actor, p: { assigneeId: string | null; createdBy: string | null }): boolean {
  return actor.role !== "agent" || p.assigneeId === actor.id || p.createdBy === actor.id;
}

/** 목록 쿼리에 붙일 고객 열람 조건 (canViewCustomer 와 같은 규칙) */
export function customerScope(actor: Actor): SQL | undefined {
  if (actor.role === "admin") return undefined;
  if (actor.role === "manager") {
    return or(
      eq(customers.assigneeId, actor.id),
      sql`${customers.assigneeId} is null`,
      sql`${customers.assigneeId} in (select ${users.id} from ${users} where ${users.teamId} = ${actor.teamId ?? -1})`,
    );
  }
  return eq(customers.assigneeId, actor.id);
}
