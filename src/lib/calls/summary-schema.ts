import { z } from "zod";

// AI 통화 요약 결과. Claude 구조화 출력(JSON 스키마)으로 받습니다.
// 숫자 범위·글자 수 제약은 구조화 출력에서 지원하지 않으므로 쓰지 않습니다.

export const NeedsChangeSchema = z.object({
  regions: z.array(z.string()).nullable().describe("바뀐 경우 변경 후 희망 지역 전체 목록. 언급 없으면 null"),
  propertyTypes: z
    .array(z.enum(["land", "building", "land_building"]))
    .nullable()
    .describe("바뀐 경우 변경 후 물건 종류 전체. land=토지, building=건물, land_building=토지+건물. 언급 없으면 null"),
  purpose: z.string().nullable().describe("매입 목적이 바뀌었거나 새로 나온 경우. 아니면 null"),
  budgetMinManwon: z.number().nullable().describe("예산 하한 (만원 단위. 30억 = 300000). 언급 없으면 null"),
  budgetMaxManwon: z.number().nullable().describe("예산 상한 (만원 단위). 언급 없으면 null"),
  landAreaMinPyeong: z.number().nullable().describe("토지면적 하한 (평). ㎡로 말했으면 평으로 환산. 언급 없으면 null"),
  landAreaMaxPyeong: z.number().nullable().describe("토지면적 상한 (평). 언급 없으면 null"),
  zonings: z.array(z.string()).nullable().describe("바뀐 경우 변경 후 용도지역 전체 목록. 언급 없으면 null"),
  notes: z.string().nullable().describe("새로 나온 기타 필수 조건 (접도, 전력, 인허가 등). 없으면 null"),
  evidence: z.string().describe("고객이 실제로 한 말을 짧게 인용"),
});

export const CallSummarySchema = z.object({
  headline: z.string().describe("통화 내용을 한 줄로. 예: '평택 포승 부지 가격 조정 요청, 다음 주 임장 희망'"),
  summary: z.array(z.string()).describe("핵심 내용 3~7개. 각 항목은 한 문장"),
  customerIntent: z
    .enum(["hot", "warm", "cold", "unknown"])
    .describe("고객 매입 의지. hot=구체적 진행 의사, warm=관심, cold=관심 낮음·보류"),
  needsChange: NeedsChangeSchema.nullable().describe("고객 매입 조건이 바뀌었거나 새로 나온 경우만. 없으면 null"),
  actionItems: z
    .array(
      z.object({
        title: z.string().describe("직원이 해야 할 일. 예: '포승 부지 토지이용계획확인원 보내기'"),
        dueDate: z.string().nullable().describe("YYYY-MM-DD. '다음 주 화요일' 같은 표현은 통화 날짜 기준으로 계산. 기한 언급 없으면 null"),
        owner: z.enum(["agent", "customer"]).describe("agent=중개사(직원)가 할 일, customer=고객이 하기로 한 일"),
      }),
    )
    .describe("통화에서 약속한 후속 조치"),
  mentionedProperties: z.array(z.string()).describe("통화에서 언급된 물건(지역·지번·물건명)"),
  nextContact: z.string().nullable().describe("다음 연락 약속 (예: '11/28 오후 재통화'). 없으면 null"),
});

export type CallSummary = z.infer<typeof CallSummarySchema>;
export type NeedsChange = z.infer<typeof NeedsChangeSchema>;

export const INTENT_LABEL: Record<CallSummary["customerIntent"], string> = {
  hot: "적극",
  warm: "관심",
  cold: "낮음",
  unknown: "판단 어려움",
};
