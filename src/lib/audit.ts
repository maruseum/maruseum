import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(entry: {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: unknown;
}): Promise<void> {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  } catch {
    // 요청 밖(스크립트 등)에서 호출된 경우
  }
  await db.insert(auditLogs).values({
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    detail: entry.detail ?? null,
    ip,
  });
}
