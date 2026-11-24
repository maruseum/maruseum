import "server-only";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";

const run = promisify(execFile);

/** OpenAI 음성 인식 한 번에 보낼 수 있는 크기 (25MB) 보다 조금 작게 */
const MAX_UPLOAD = 24 * 1024 * 1024;
/** OpenAI 가 그대로 받는 형식 */
const DIRECT_EXT = new Set([".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg", ".flac"]);
/** 긴 통화는 이 길이(초)로 나눠 인식합니다. */
const SEGMENT_SEC = 20 * 60;

// 지명·용어 인식률을 높이기 위한 힌트
const VOCAB_HINT =
  "부동산 중개 통화. 토지, 건물, 평, ㎡, 억, 만원, 지번, 지목, 임야, 전, 답, 대지, 용도지역, 계획관리지역, 생산관리지역, 일반공업지역, 준공업지역, 자연녹지지역, 토지이용계획확인원, 등기부등본, 임장, 잔금, 계약금, 접도, 4차선.";

export class SttError extends Error {}

export interface Transcript {
  text: string;
  durationSec: number | null;
}

async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run(process.env.FFMPEG_PATH ?? "ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function probeDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await run(process.env.FFPROBE_PATH ?? "ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
    ]);
    const n = Number(stdout.trim());
    return Number.isFinite(n) ? Math.round(n) : null;
  } catch {
    return null;
  }
}

/**
 * 인식에 보낼 파일 목록을 만듭니다.
 * 작고 지원되는 형식이면 원본 그대로, 아니면 ffmpeg 로 모노 16kHz mp3 로 줄이고 20분 단위로 나눕니다.
 */
async function prepare(file: string): Promise<{ parts: string[]; cleanup: () => Promise<void> }> {
  const { size } = await stat(file);
  if (size <= MAX_UPLOAD && DIRECT_EXT.has(path.extname(file).toLowerCase())) {
    return { parts: [file], cleanup: async () => {} };
  }
  if (!(await ffmpegAvailable())) {
    throw new SttError("파일이 25MB를 넘거나 지원하지 않는 형식인데, 서버에 ffmpeg 가 없어 변환할 수 없습니다.");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "maru-stt-"));
  await run(process.env.FFMPEG_PATH ?? "ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", file,
    "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k",
    "-f", "segment", "-segment_time", String(SEGMENT_SEC), "-reset_timestamps", "1",
    path.join(dir, "part-%03d.mp3"),
  ], { maxBuffer: 10 * 1024 * 1024 });
  const parts = (await readdir(dir)).filter((f) => f.endsWith(".mp3")).sort().map((f) => path.join(dir, f));
  if (parts.length === 0) throw new SttError("오디오를 변환하지 못했습니다. 파일이 손상됐을 수 있습니다.");
  return { parts, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const MOCK_TRANSCRIPT = `직원: 네 대표님, 마루중개 이대리입니다. 지난번 보내드린 평택 포승 부지 검토해 보셨어요?
고객: 네 봤어요. 위치는 괜찮은데 52억은 좀 부담이네요. 예산을 원래 60억까지 봤는데 이번에 이사회에서 55억으로 줄었어요.
직원: 아 그러시군요. 면적은 그대로 2천 평 이상 보시는 거죠?
고객: 네, 그리고 아산 쪽은 이제 빼 주세요. 평택이랑 안성 위주로 봐 주시고요. 고압 전력 들어오는 곳이어야 해요.
직원: 알겠습니다. 포승 부지 토지이용계획확인원이랑 전력 인입 가능한지 확인해서 이번 주 금요일까지 보내드릴게요.
고객: 좋아요. 다음 주 화요일 오후에 현장 한번 같이 가 보죠.
직원: 네 그럼 다음 주 화요일 오후 2시로 임장 잡아 두겠습니다.`;

export async function transcribe(file: string): Promise<Transcript> {
  const durationSec = await probeDuration(file);
  if (process.env.STT_PROVIDER === "mock") return { text: MOCK_TRANSCRIPT, durationSec };

  if (!process.env.OPENAI_API_KEY) {
    throw new SttError("음성 인식 API 키(OPENAI_API_KEY)가 설정되지 않았습니다. 관리자에게 문의하세요.");
  }
  const client = new OpenAI({ maxRetries: 3, timeout: 10 * 60 * 1000 });
  const model = process.env.STT_MODEL ?? "whisper-1";
  const { parts, cleanup } = await prepare(file);
  try {
    const texts: string[] = [];
    for (const part of parts) {
      try {
        const res = await client.audio.transcriptions.create({
          file: createReadStream(part),
          model,
          language: "ko",
          prompt: VOCAB_HINT,
        });
        texts.push(res.text.trim());
      } catch (e) {
        if (e instanceof OpenAI.AuthenticationError) throw new SttError("음성 인식 API 키가 올바르지 않습니다.");
        if (e instanceof OpenAI.RateLimitError) throw new SttError("음성 인식 요청이 많아 잠시 거절됐습니다. 잠시 후 재처리하세요.");
        if (e instanceof OpenAI.BadRequestError) throw new SttError(`음성 인식 요청이 거부됐습니다: ${e.message}`);
        if (e instanceof OpenAI.APIError) throw new SttError(`음성 인식 서버 오류 (${e.status ?? "연결 실패"}). 잠시 후 재처리하세요.`);
        throw e;
      }
    }
    const text = texts.filter(Boolean).join("\n");
    if (!text) throw new SttError("음성에서 말소리를 찾지 못했습니다.");
    return { text, durationSec };
  } finally {
    await cleanup();
  }
}
