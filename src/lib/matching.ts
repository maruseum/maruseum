import { formatManwon } from "./format";
import { PROPERTY_TYPE_LABEL } from "./labels";
import type { NeedsSnapshot } from "./needs";
import { regionMatches } from "./region";

export interface MatchProperty {
  propertyType: keyof typeof PROPERTY_TYPE_LABEL;
  region: string | null;
  address: string;
  zoning: string | null;
  landAreaM2: number | null;
  askingPrice: number | null; // 만원
}

export interface MatchResult {
  /** 0–100. 고객이 입력한 조건만으로 계산합니다. */
  score: number;
  /** 맞는 점 */
  reasons: string[];
  /** 애매하거나 조금 벗어난 점 */
  warnings: string[];
  /** 추천 대상이 아닌 이유 (종류·지역 불일치, 예산 20% 초과, 니즈 없음) */
  excluded: string | null;
}

// 항목별 배점. 고객이 입력하지 않은 항목은 분모에서 빠집니다.
export const WEIGHTS = { region: 30, type: 20, budget: 25, area: 15, zoning: 10 } as const;

/** 예산 상한을 이만큼 넘으면 추천에서 뺍니다. */
export const BUDGET_HARD_LIMIT = 0.2;

const pct = (r: number) => `${Math.round(r * 100)}%`;

export function scoreMatch(needs: NeedsSnapshot, p: MatchProperty): MatchResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let earned = 0;
  let possible = 0;
  const exclude = (why: string): MatchResult => ({ score: 0, reasons, warnings, excluded: why });

  // 물건 종류 (필수 조건)
  if (needs.propertyTypes.length) {
    possible += WEIGHTS.type;
    if (!needs.propertyTypes.includes(p.propertyType)) return exclude(`종류 불일치 (${PROPERTY_TYPE_LABEL[p.propertyType]})`);
    earned += WEIGHTS.type;
    reasons.push(`종류 ${PROPERTY_TYPE_LABEL[p.propertyType]}`);
  }

  // 지역 (필수 조건)
  if (needs.regions.length) {
    possible += WEIGHTS.region;
    const target = `${p.region ?? ""} ${p.address}`;
    const hit = needs.regions.find((r) => regionMatches(r, target));
    if (!hit) return exclude("희망 지역 밖");
    earned += WEIGHTS.region;
    reasons.push(`지역 ${hit}`);
  }

  // 예산
  if (needs.budgetMin !== null || needs.budgetMax !== null) {
    possible += WEIGHTS.budget;
    const price = p.askingPrice;
    if (price === null) {
      earned += WEIGHTS.budget * 0.5;
      warnings.push("희망가 미정");
    } else if (needs.budgetMax !== null && price > needs.budgetMax) {
      const over = (price - needs.budgetMax) / needs.budgetMax;
      if (over > BUDGET_HARD_LIMIT) return exclude(`예산 ${pct(over)} 초과`);
      earned += WEIGHTS.budget * (over <= 0.1 ? 0.6 : 0.3);
      warnings.push(`예산 ${pct(over)} 초과 (${formatManwon(price)})`);
    } else if (needs.budgetMin !== null && price < needs.budgetMin) {
      earned += WEIGHTS.budget * 0.7;
      warnings.push(`예산 하한보다 낮음 (${formatManwon(price)})`);
    } else {
      earned += WEIGHTS.budget;
      reasons.push(`예산 범위 (${formatManwon(price)})`);
    }
  }

  // 토지면적
  if (needs.landAreaMinM2 !== null || needs.landAreaMaxM2 !== null) {
    possible += WEIGHTS.area;
    const area = p.landAreaM2;
    const min = needs.landAreaMinM2;
    const max = needs.landAreaMaxM2;
    if (area === null) {
      earned += WEIGHTS.area * 0.5;
      warnings.push("면적 미입력");
    } else if ((min === null || area >= min) && (max === null || area <= max)) {
      earned += WEIGHTS.area;
      reasons.push("면적 범위");
    } else {
      const gap = min !== null && area < min ? (min - area) / min : max !== null ? (area - max) / max : 1;
      if (gap <= 0.15) earned += WEIGHTS.area * 0.5;
      warnings.push(min !== null && area < min ? `면적 ${pct(gap)} 작음` : `면적 ${pct(gap)} 큼`);
    }
  }

  // 용도지역
  if (needs.zonings.length) {
    possible += WEIGHTS.zoning;
    const z = p.zoning?.replace(/\s/g, "") ?? null;
    if (z === null) {
      earned += WEIGHTS.zoning * 0.5;
      warnings.push("용도지역 미입력");
    } else if (needs.zonings.some((n) => z.includes(n.replace(/\s/g, "")) || n.replace(/\s/g, "").includes(z))) {
      earned += WEIGHTS.zoning;
      reasons.push(p.zoning!);
    } else {
      warnings.push(`용도지역 다름 (${p.zoning})`);
    }
  }

  if (possible === 0) return exclude("니즈 미입력");
  return { score: Math.round((earned / possible) * 100), reasons, warnings, excluded: null };
}
