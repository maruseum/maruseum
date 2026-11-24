"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession, getSessionUser } from "@/lib/auth/session";
import { FormError, handleForm, required, type ActionState } from "@/lib/form";

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  return handleForm(async () => {
    const email = required(fd, "email", "이메일").toLowerCase();
    const password = required(fd, "password", "비밀번호");

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const ok = user && user.active && (await verifyPassword(password, user.passwordHash));
    if (!ok) {
      await audit({ userId: user?.id ?? null, action: "login_failed", entityType: "user", detail: { email } });
      throw new FormError("이메일 또는 비밀번호가 맞지 않습니다.");
    }

    await createSession(user.id);
    await audit({ userId: user.id, action: "login", entityType: "user", entityId: user.id });
    redirect("/");
  });
}

export async function logout(): Promise<void> {
  const user = await getSessionUser();
  await deleteSession();
  if (user) await audit({ userId: user.id, action: "logout", entityType: "user", entityId: user.id });
  redirect("/login");
}
