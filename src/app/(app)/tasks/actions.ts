"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { properties, tasks, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser, type CurrentUser } from "@/lib/auth/dal";
import { parseSeoulDateTime } from "@/lib/format";
import { FormError, handleForm, required, str, type ActionState } from "@/lib/form";
import { getCustomerFor } from "@/lib/queries";

export interface TaskContext {
  customerId?: string;
  propertyId?: string;
}

function refresh(ctx: TaskContext) {
  revalidatePath("/tasks");
  revalidatePath("/");
  if (ctx.customerId) revalidatePath(`/customers/${ctx.customerId}`);
  if (ctx.propertyId) revalidatePath(`/properties/${ctx.propertyId}`);
}

export async function createTask(ctx: TaskContext, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return handleForm(async () => {
    if (ctx.customerId && !(await getCustomerFor(user, ctx.customerId))) {
      throw new FormError("고객을 찾을 수 없거나 권한이 없습니다.");
    }
    if (ctx.propertyId) {
      const [p] = await db.select({ id: properties.id }).from(properties).where(eq(properties.id, ctx.propertyId));
      if (!p) throw new FormError("물건을 찾을 수 없습니다.");
    }
    const assigneeId = str(fd, "assigneeId") ?? user.id;
    const [a] = await db.select({ id: users.id }).from(users).where(eq(users.id, assigneeId));
    if (!a) throw new FormError("담당자를 찾을 수 없습니다.");

    const [t] = await db
      .insert(tasks)
      .values({
        title: required(fd, "title", "할 일"),
        description: str(fd, "description"),
        dueAt: parseSeoulDateTime(fd.get("dueAt")),
        assigneeId,
        customerId: ctx.customerId ?? null,
        propertyId: ctx.propertyId ?? null,
        createdBy: user.id,
      })
      .returning({ id: tasks.id });
    await audit({ userId: user.id, action: "create", entityType: "task", entityId: t.id });
    refresh(ctx);
    return { ok: "할 일을 추가했습니다.", at: Date.now() };
  });
}

async function canEditTask(user: CurrentUser, task: typeof tasks.$inferSelect): Promise<boolean> {
  if (user.role === "admin" || user.role === "manager") return true;
  if (task.assigneeId === user.id || task.createdBy === user.id) return true;
  if (task.customerId) return (await getCustomerFor(user, task.customerId)) !== null;
  return false;
}

/** 목록의 체크 버튼용: <form action={setTaskStatus}> + hidden id, status */
export async function setTaskStatus(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!["open", "done", "canceled"].includes(status) || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task || !(await canEditTask(user, task))) return;

  await db
    .update(tasks)
    .set({ status: status as "open" | "done" | "canceled", completedAt: status === "done" ? new Date() : null })
    .where(eq(tasks.id, id));
  await audit({ userId: user.id, action: `task_${status}`, entityType: "task", entityId: id });
  refresh({ customerId: task.customerId ?? undefined, propertyId: task.propertyId ?? undefined });
}
