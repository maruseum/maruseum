import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/dal";
import { getRecordingFor } from "@/lib/calls/queries";
import { absolutePath } from "@/lib/calls/storage";

const MIME: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  amr: "audio/amr",
  "3gp": "audio/3gpp",
};

/** 녹음 재생. 구간 이동을 위해 Range 요청을 지원합니다. proxy 를 거치지 않으므로 여기서 권한을 확인합니다. */
export async function GET(request: Request, ctx: RouteContext<"/api/recordings/[id]/audio">) {
  const user = await getCurrentUser();
  if (!user) return new Response("로그인이 필요합니다.", { status: 401 });
  const { id } = await ctx.params;
  const row = await getRecordingFor(user, id);
  if (!row) return new Response("찾을 수 없습니다.", { status: 404 });
  if (!row.rec.storageKey) return new Response("보관 기간이 지나 음성 파일이 삭제됐습니다.", { status: 410 });

  const file = absolutePath(row.rec.storageKey);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response("음성 파일이 없습니다.", { status: 410 });
  }
  const ext = row.rec.storageKey.split(".").pop()?.toLowerCase() ?? "";
  const headers: Record<string, string> = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };

  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (!range || (!range[1] && !range[2])) {
    await audit({ userId: user.id, action: "listen", entityType: "recording", entityId: id });
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
  }

  // bytes=100-  |  bytes=100-199  |  bytes=-500 (마지막 500바이트)
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  if (start === 0) await audit({ userId: user.id, action: "listen", entityType: "recording", entityId: id });
  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}
