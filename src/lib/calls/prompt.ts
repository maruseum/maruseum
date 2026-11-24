// 요약 지시문 구성과 니즈 변경 제안 처리 (순수 함수, 테스트 대상)
import { formatAreaRange, formatBudgetRange, M2_PER_PYEONG } from "../format";
import { PROPERTY_TYPE_LABEL } from "../labels";
import type { NeedsSnapshot } from "../needs";
import type { NeedsChange } from "./summary-schema";

/** 고정 지시문 (요청마다 같아야 프롬프트 캐시가 맞습니다) */
export const SUMMARY_SYSTEM = `당신은 한국의 토지·건물 매입 중개법인에서 일하는 직원을 돕는 비서입니다.
중개사와 매수 고객 사이의 통화 녹취록을 읽고, 직원이 고객 기록에 남길 요약을 만듭니다.

원칙:
- 녹취록에 실제로 나온 내용만 씁니다. 추측하거나 지어내지 않습니다. 애매하면 요약 문장에 "~로 보임"처럼 표시합니다.
- 음성 인식 오류가 있을 수 있습니다. 지명·숫자가 문맥상 명백히 잘못 인식된 경우만 바로잡고, 확실하지 않으면 들린 그대로 둡니다.
- 금액은 만원 단위 숫자로 바꿉니다 (30억 = 300000, 3억5천 = 35000). 면적은 평 단위로 바꿉니다 (1평 = 3.3058㎡).
- needsChange 는 고객의 매입 조건(지역·종류·목적·예산·면적·용도지역·필수 조건)이 "현재 등록된 니즈"와 달라졌거나 새로 나왔을 때만 채웁니다. 바뀌지 않은 항목은 null 로 둡니다. 목록 항목(지역·종류·용도지역)이 바뀌면 변경 후 전체 목록을 적습니다.
- actionItems 는 통화에서 실제로 약속한 일만 적습니다. 날짜 표현은 통화 날짜를 기준으로 YYYY-MM-DD 로 바꿉니다.
- 요약은 한국어로, 직원끼리 쓰는 간결한 업무 말투로 씁니다.`;

export interface SummaryContext {
  /** 통화 시각 (서울 기준 날짜 계산용) */
  recordedAt: Date | null;
  customerName: string | null;
  companyName: string | null;
  currentNeeds: NeedsSnapshot | null;
}

const seoulDay = (d: Date) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(d);

export function describeNeeds(n: NeedsSnapshot | null): string {
  if (!n) return "(등록된 니즈 없음)";
  const types = n.propertyTypes.map((t) => PROPERTY_TYPE_LABEL[t as keyof typeof PROPERTY_TYPE_LABEL] ?? t).join(", ");
  return [
    `희망 지역: ${n.regions.join(", ") || "-"}`,
    `물건 종류: ${types || "-"}`,
    `매입 목적: ${n.purpose ?? "-"}`,
    `예산: ${formatBudgetRange(n.budgetMin, n.budgetMax)}`,
    `토지면적: ${formatAreaRange(n.landAreaMinM2, n.landAreaMaxM2)}`,
    `용도지역: ${n.zonings.join(", ") || "-"}`,
    `기타 조건: ${n.notes ?? "-"}`,
  ].join("\n");
}

/** 요청마다 달라지는 부분 (통화 정보 + 녹취록) */
export function buildUserMessage(transcript: string, ctx: SummaryContext): string {
  const who = ctx.customerName ? `${ctx.customerName}${ctx.companyName ? ` (${ctx.companyName})` : ""}` : "(고객 미확인)";
  return `<call_info>
통화 날짜: ${ctx.recordedAt ? seoulDay(ctx.recordedAt) : "알 수 없음 (상대적 날짜 표현은 dueDate 를 null 로)"}
고객: ${who}
</call_info>

<current_needs>
${describeNeeds(ctx.currentNeeds)}
</current_needs>

<transcript>
${transcript}
</transcript>

위 통화를 요약해 주세요.`;
}

const toM2 = (p: number | null) => (p === null ? null : Math.round(p * M2_PER_PYEONG * 100) / 100);

/** 니즈 변경 제안을 현재 니즈에 합쳐 새 니즈를 만듭니다. 제안에 없는(null) 항목은 그대로 둡니다. */
export function mergeNeedsChange(current: NeedsSnapshot | null, change: NeedsChange): NeedsSnapshot {
  const base: NeedsSnapshot = current ?? {
    regions: [],
    propertyTypes: [],
    purpose: null,
    budgetMin: null,
    budgetMax: null,
    landAreaMinM2: null,
    landAreaMaxM2: null,
    zonings: [],
    notes: null,
  };
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  return {
    regions: change.regions ?? base.regions,
    propertyTypes: change.propertyTypes ?? base.propertyTypes,
    purpose: change.purpose ?? base.purpose,
    budgetMin: change.budgetMinManwon !== null ? round(change.budgetMinManwon) : base.budgetMin,
    budgetMax: change.budgetMaxManwon !== null ? round(change.budgetMaxManwon) : base.budgetMax,
    landAreaMinM2: change.landAreaMinPyeong !== null ? toM2(change.landAreaMinPyeong) : base.landAreaMinM2,
    landAreaMaxM2: change.landAreaMaxPyeong !== null ? toM2(change.landAreaMaxPyeong) : base.landAreaMaxM2,
    zonings: change.zonings ?? base.zonings,
    notes: change.notes ? (base.notes && !base.notes.includes(change.notes) ? `${base.notes} / ${change.notes}` : change.notes) : base.notes,
  };
}

/** "2026-11-28" → 서울 오전 9시 Date. 형식이 틀리면 null */
export function dueDateToDate(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T09:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
