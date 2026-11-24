import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildUserMessage, SUMMARY_SYSTEM, type SummaryContext } from "./prompt";
import { CallSummarySchema, type CallSummary } from "./summary-schema";

export class SummaryError extends Error {}

/** 기본 모델. 바꾸려면 SUMMARY_MODEL 환경변수 */
const DEFAULT_MODEL = "claude-opus-5-5";

function mockSummary(ctx: SummaryContext): CallSummary {
  return {
    headline: "평택 포승 부지 예산 부담, 다음 주 화요일 임장 약속",
    summary: [
      "평택 포승 부지(52억) 위치는 만족하나 가격 부담",
      "이사회 결정으로 예산 상한 60억 → 55억으로 축소",
      "희망 지역에서 아산 제외, 평택·안성 위주",
      "고압 전력 인입 가능 부지여야 함",
    ],
    customerIntent: "warm",
    needsChange: {
      regions: ["경기 평택", "경기 안성"],
      propertyTypes: null,
      purpose: null,
      budgetMinManwon: null,
      budgetMaxManwon: 550000,
      landAreaMinPyeong: null,
      landAreaMaxPyeong: null,
      zonings: null,
      notes: "고압 전력 인입 필수",
      evidence: "예산을 원래 60억까지 봤는데 이번에 이사회에서 55억으로 줄었어요 / 아산 쪽은 이제 빼 주세요",
    },
    actionItems: [
      { title: "포승 부지 토지이용계획확인원·전력 인입 가능 여부 보내기", dueDate: null, owner: "agent" },
      { title: "포승 부지 임장 (오후 2시)", dueDate: null, owner: "agent" },
    ],
    mentionedProperties: ["평택 포승 부지"],
    nextContact: ctx.recordedAt ? "다음 주 화요일 오후 2시 임장" : null,
  };
}

export async function summarizeCall(transcript: string, ctx: SummaryContext): Promise<CallSummary> {
  if (process.env.SUMMARY_PROVIDER === "mock") return mockSummary(ctx);

  // 키는 ANTHROPIC_API_KEY 등 SDK 기본 경로에서 읽습니다.
  const client = new Anthropic({ maxRetries: 3 });
  try {
    const message = await client.beta.messages.parse({
      model: process.env.SUMMARY_MODEL ?? DEFAULT_MODEL,
      max_tokens: 16000,
      // 안전 분류기가 요청을 거절하면 같은 요청을 다른 모델로 다시 처리합니다.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: zodOutputFormat(CallSummarySchema),
      },
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: buildUserMessage(transcript, ctx) }],
    });

    if (message.stop_reason === "refusal") {
      throw new SummaryError("AI가 이 통화의 요약을 거절했습니다. 녹취록을 보고 직접 기록해 주세요.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new SummaryError("요약이 너무 길어 중간에 끊겼습니다. 재처리해 주세요.");
    }
    if (!message.parsed_output) throw new SummaryError("AI 요약 결과를 읽지 못했습니다. 재처리해 주세요.");
    return CallSummarySchema.parse(message.parsed_output);
  } catch (e) {
    if (e instanceof SummaryError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new SummaryError("AI 요약 API 키(ANTHROPIC_API_KEY)가 없거나 올바르지 않습니다.");
    if (e instanceof Anthropic.RateLimitError) throw new SummaryError("AI 요약 요청이 많아 잠시 거절됐습니다. 잠시 후 재처리하세요.");
    if (e instanceof Anthropic.BadRequestError) throw new SummaryError(`AI 요약 요청이 거부됐습니다: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new SummaryError(`AI 요약 서버 오류 (${e.status ?? "연결 실패"}). 잠시 후 재처리하세요.`);
    throw e;
  }
}
