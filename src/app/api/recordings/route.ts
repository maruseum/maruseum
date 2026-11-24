import { after } from "next/server";
import path from "node:path";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/dal";
import { parseCallFileName } from "@/lib/calls/filename";
import { enqueueRecording, purgeOldAudio } from "@/lib/calls/process";
import { findCustomerForCall } from "@/lib/calls/queries";
import { deleteStored, saveUpload } from "@/lib/calls/storage";
import { getCustomerFor } from "@/lib/queries";

// 갤럭시 기본은 .m4a, 예전 기종은 .amr / .3gp
const AUDIO_EXT = new Set([".m4a", ".mp3", ".wav", ".amr", ".3gp", ".aac", ".ogg", ".webm", ".mp4", ".flac"]);
const MAX_BYTES = 200 * 1024 * 1024;

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** 통화 녹음 업로드 (한 요청에 파일 하나). 이 경로는 proxy 를 거치지 않으므로 여기서 로그인을 확인합니다. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return json({ error: "업로드 형식이 올바르지 않습니다." }, 400);
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return json({ error: "파일이 비어 있습니다." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "파일이 200MB를 넘습니다." }, 413);
  const ext = path.extname(file.name).toLowerCase();
  if (!AUDIO_EXT.has(ext)) {
    return json({ error: `${ext || "확장자 없는"} 파일은 올릴 수 없습니다. 통화 녹음(.m4a 등)만 올려 주세요.` }, 415);
  }

  const parsed = parseCallFileName(file.name);
  let customerId: string | null = null;
  const requested = fd.get("customerId");
  if (typeof requested === "string" && requested) {
    if (!(await getCustomerFor(user, requested))) return json({ error: "고객을 찾을 수 없거나 권한이 없습니다." }, 403);
    customerId = requested;
  } else {
    customerId = await findCustomerForCall(user, parsed);
  }

  const stored = await saveUpload(file);
  const [rec] = await db
    .insert(recordings)
    .values({
      uploadedBy: user.id,
      customerId,
      fileName: file.name.slice(0, 300),
      storageKey: stored.key,
      mimeType: file.type || null,
      sizeBytes: stored.size,
      contactLabel: parsed.contact,
      contactPhone: parsed.phone,
      recordedAt: parsed.recordedAt,
    })
    .returning({ id: recordings.id });

  await audit({
    userId: user.id,
    action: "upload",
    entityType: "recording",
    entityId: rec.id,
    detail: { customerId, size: stored.size },
  });

  // 응답을 먼저 보내고 음성 인식·요약은 뒤에서 처리합니다.
  after(async () => {
    enqueueRecording(rec.id);
    await purgeOldAudio(deleteStored).catch((e) => console.error("[recordings] 보관기간 정리 실패", e));
  });

  return json({ id: rec.id, customerId, contact: parsed.contact, recordedAt: parsed.recordedAt });
}
