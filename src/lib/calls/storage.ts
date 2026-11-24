import "server-only";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

/** 녹음 파일 저장 위치. 운영에서는 백업되는 디스크 경로로 지정하세요. */
export function recordingsRoot(): string {
  // 실행 시점에 정해지는 경로라 빌드 추적에서 제외합니다 (프로젝트 전체가 배포물에 포함되지 않도록).
  return path.resolve(/*turbopackIgnore: true*/ process.env.RECORDINGS_DIR ?? "storage/recordings");
}

/** 저장 키 → 절대 경로. 저장 폴더 밖을 가리키는 키는 거부합니다. */
export function absolutePath(key: string): string {
  const root = recordingsRoot();
  const abs = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!abs.startsWith(root + path.sep)) throw new Error("잘못된 저장 경로");
  return abs;
}

export async function saveUpload(file: File): Promise<{ key: string; size: number }> {
  const ext = (path.extname(file.name).toLowerCase().match(/^\.[a-z0-9]{2,5}$/)?.[0] ?? "").replace("..", ".");
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}${ext}`;
  const abs = absolutePath(key);
  await mkdir(path.dirname(abs), { recursive: true });
  await pipeline(Readable.fromWeb(file.stream() as unknown as WebReadableStream), createWriteStream(abs, { flags: "wx" }));
  const { size } = await stat(abs);
  return { key, size };
}

export async function deleteStored(key: string): Promise<void> {
  await rm(absolutePath(key), { force: true });
}
