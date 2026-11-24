import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/lib/authz";
import { getSessionUser } from "./session";

/** 한 요청 안에서는 세션 조회를 한 번만 합니다. */
export const getCurrentUser = cache(getSessionUser);

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/?denied=1");
  return user;
}
