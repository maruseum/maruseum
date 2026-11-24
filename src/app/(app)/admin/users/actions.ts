"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { sessions, teams, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import { FormError, handleForm, oneOf, required, str, type ActionState } from "@/lib/form";

const ROLES = ["admin", "manager", "agent"] as const;

function parseTeamId(fd: FormData): number | null {
  const raw = str(fd, "teamId");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new FormError("팀 값이 올바르지 않습니다.");
  return n;
}

export async function createUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  return handleForm(async () => {
    const email = required(fd, "email", "이메일").toLowerCase();
    const password = required(fd, "password", "임시 비밀번호");
    if (password.length < 8) throw new FormError("비밀번호는 8자 이상이어야 합니다.");
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (dup) throw new FormError("이미 등록된 이메일입니다.");

    const [u] = await db
      .insert(users)
      .values({
        email,
        name: required(fd, "name", "이름"),
        phone: str(fd, "phone"),
        role: oneOf(str(fd, "role"), ROLES, "권한"),
        teamId: parseTeamId(fd),
        passwordHash: await hashPassword(password),
      })
      .returning({ id: users.id });
    await audit({ userId: admin.id, action: "create", entityType: "user", entityId: u.id, detail: { email } });
    revalidatePath("/admin/users");
    return { ok: "직원을 추가했습니다.", at: Date.now() };
  });
}

export async function updateUser(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  return handleForm(async () => {
    const role = oneOf(str(fd, "role"), ROLES, "권한");
    const active = fd.get("active") === "on";
    if (id === admin.id && (role !== "admin" || !active)) {
      throw new FormError("본인의 관리자 권한은 해제할 수 없습니다.");
    }
    const patch: Partial<typeof users.$inferInsert> = { role, active, teamId: parseTeamId(fd) };
    const newPassword = str(fd, "password");
    if (newPassword) {
      if (newPassword.length < 8) throw new FormError("비밀번호는 8자 이상이어야 합니다.");
      patch.passwordHash = await hashPassword(newPassword);
    }
    await db.update(users).set(patch).where(eq(users.id, id));
    // 비활성화·비밀번호 변경 시 기존 로그인 세션을 끊습니다.
    if (!active || newPassword) await db.delete(sessions).where(eq(sessions.userId, id));
    await audit({
      userId: admin.id,
      action: "update",
      entityType: "user",
      entityId: id,
      detail: { role, active, teamId: patch.teamId, passwordReset: Boolean(newPassword) },
    });
    revalidatePath("/admin/users");
    return { ok: "저장했습니다.", at: Date.now() };
  });
}

export async function createTeam(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  return handleForm(async () => {
    const name = required(fd, "name", "팀 이름");
    const [dup] = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, name));
    if (dup) throw new FormError("같은 이름의 팀이 있습니다.");
    const [t] = await db.insert(teams).values({ name }).returning({ id: teams.id });
    await audit({ userId: admin.id, action: "create", entityType: "team", entityId: String(t.id), detail: { name } });
    revalidatePath("/admin/users");
    return { ok: "팀을 추가했습니다.", at: Date.now() };
  });
}
