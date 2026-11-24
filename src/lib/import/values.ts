// 엑셀 셀 값 해석. 사람이 손으로 적은 한국어 표현을 숫자·코드로 바꿉니다.
import { M2_PER_PYEONG } from "../format";

export type MoneyUnit = "auto" | "won" | "manwon" | "eok";
export type AreaUnit = "m2" | "pyeong";

const clean = (s: string) => s.replace(/[,\s]/g, "").replace(/원$/, "");

/** 헤더 이름으로 금액 단위를 짐작합니다. "예산(억)" → eok, "희망가(만원)" → manwon */
export function moneyUnitFromHeader(header: string): MoneyUnit {
  if (/억/.test(header)) return "eok";
  if (/만원|만\)/.test(header)) return "manwon";
  if (/\(원\)|단위:?원/.test(header)) return "won";
  return "auto";
}

export function areaUnitFromHeader(header: string, fallback: AreaUnit): AreaUnit {
  if (/평/.test(header)) return "pyeong";
  if (/㎡|m2|m²|제곱/i.test(header)) return "m2";
  return fallback;
}

/**
 * 금액 → 만원. 빈 값은 null, 해석할 수 없으면 NaN.
 * "45억" · "3억5천" · "3억 5,000만원" · "4500만" · "450,000"(만원) · "4,500,000,000"(원, 1천만 이상 숫자는 원으로 봄)
 */
export function parseMoney(raw: string | null | undefined, unit: MoneyUnit = "auto"): number | null {
  if (raw === null || raw === undefined) return null;
  const s = clean(String(raw));
  if (s === "" || s === "-") return null;

  if (/[억천백만]/.test(s)) {
    const m = s.match(/^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)천)?(?:(\d+(?:\.\d+)?)백)?(?:(\d+(?:\.\d+)?))?만?$/);
    if (!m || m[0] === "") return NaN;
    const [, eok, cheon, baek, rest] = m;
    const value =
      (eok ? Number(eok) * 10000 : 0) +
      (cheon ? Number(cheon) * 1000 : 0) +
      (baek ? Number(baek) * 100 : 0) +
      (rest ? Number(rest) : 0);
    return Math.round(value);
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  if (unit === "eok") return Math.round(n * 10000);
  if (unit === "won") return Math.round(n / 10000);
  if (unit === "manwon") return Math.round(n);
  return n >= 10_000_000 ? Math.round(n / 10000) : Math.round(n);
}

export interface Range {
  min: number | null;
  max: number | null;
}

/** "30억~50억", "30-50억", "50억 이하", "30억 이상", "40억" (단일 값은 상한으로 봄) */
export function parseRange(raw: string | null | undefined, parseOne: (s: string) => number | null): Range | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s === "") return null;

  let mode: "max" | "min" = "max";
  if (/(이하|까지|미만)$/.test(s)) {
    s = s.replace(/(이하|까지|미만)$/, "");
  } else if (/(이상|부터|초과|~)$/.test(s)) {
    s = s.replace(/(이상|부터|초과|~)$/, "");
    mode = "min";
  }

  const parts = s.split(/\s*(?:~|〜|∼|-|–|에서)\s*/).filter((p) => p.trim() !== "");
  if (parts.length === 2) {
    let [a] = parts;
    const b = parts[1];
    // "30-50억" 처럼 뒤에만 단위가 붙은 경우 앞에도 같은 단위를 붙입니다.
    const unit = b.match(/(억|천만|만원|만|평|㎡|m2|m²)$/i)?.[1];
    if (unit && /^[\d.,\s]+$/.test(a)) a = `${a}${unit}`;
    const min = parseOne(a);
    const max = parseOne(b);
    if (Number.isNaN(min) || Number.isNaN(max)) return { min: NaN, max: NaN };
    return { min, max };
  }
  if (parts.length !== 1) return { min: NaN, max: NaN };
  const v = parseOne(parts[0]);
  return mode === "min" ? { min: v, max: null } : { min: null, max: v };
}

/** 면적 → ㎡. 값에 "평"·"㎡" 가 붙어 있으면 그 단위, 없으면 unit. */
export function parseArea(raw: string | null | undefined, unit: AreaUnit): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/[,\s]/g, "");
  if (s === "" || s === "-") return null;
  let u = unit;
  if (/평$/.test(s)) {
    u = "pyeong";
    s = s.replace(/평$/, "");
  } else if (/(㎡|m2|m²|제곱미터)$/i.test(s)) {
    u = "m2";
    s = s.replace(/(㎡|m2|m²|제곱미터)$/i, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  return Math.round((u === "pyeong" ? n * M2_PER_PYEONG : n) * 100) / 100;
}

/** "경기 화성, 평택 / 용인" → ["경기 화성", "평택", "용인"] */
export function splitList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const items = String(raw)
    .split(/[,/;·\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(items)];
}

/** 연락처 비교용: 숫자만 */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** 01012345678 → 010-1234-5678 (형식을 모르면 원문 유지) */
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;
  let d = phoneDigits(raw);
  // 엑셀이 숫자로 저장하면서 맨 앞 0이 빠진 휴대폰 번호 (1012345678)
  if (/^1[016789]\d{7,8}$/.test(d)) d = `0${d}`;
  const split = (a: number, b: number) => `${d.slice(0, a)}-${d.slice(a, b)}-${d.slice(b)}`;
  if (/^02\d{7,8}$/.test(d)) return d.length === 9 ? split(2, 5) : split(2, 6);
  if (/^0\d{9,10}$/.test(d)) return d.length === 10 ? split(3, 6) : split(3, 7);
  return String(raw).trim();
}

/** 주소 비교용: 괄호·공백 제거 */
export function addressKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, "")
    .replace(/번지$/, "");
}

/** 라벨·별칭으로 코드 찾기. 공백 무시. 정확히 같은 말을 먼저, 그다음 포함 관계. */
export function matchCode<T extends string>(raw: string | null | undefined, table: Record<T, string[]>): T | null {
  if (!raw) return null;
  const v = String(raw).replace(/\s/g, "").toLowerCase();
  if (!v) return null;
  const entries = Object.entries(table) as [T, string[]][];
  const n = (w: string) => w.replace(/\s/g, "").toLowerCase();
  for (const [code, words] of entries) if (words.some((w) => n(w) === v)) return code;
  for (const [code, words] of entries) if (words.some((w) => n(w).length >= 2 && v.includes(n(w)))) return code;
  return null;
}

export const PROPERTY_TYPE_WORDS = {
  land_building: ["토지+건물", "토지건물", "건물포함", "토지및건물", "꼬마빌딩", "통건물", "단독건물"],
  building: ["건물", "빌딩", "상가", "공장", "창고", "사옥"],
  land: ["토지", "땅", "부지", "대지", "임야", "전", "답", "나대지"],
};

export const PROPERTY_STATUS_WORDS = {
  available: ["진행중", "진행", "판매중", "매도중", "가능"],
  negotiating: ["협상중", "협상", "조율중"],
  on_hold: ["보류"],
  sold: ["거래완료", "완료", "매각", "매각완료", "계약완료"],
  withdrawn: ["철회", "취소", "회수"],
};

export const CUSTOMER_STAGE_WORDS = {
  new: ["신규", "신규문의", "문의"],
  consulting: ["상담", "상담중"],
  proposing: ["물건제안", "제안", "제안중"],
  site_visit: ["임장", "현장답사", "답사"],
  negotiating: ["협상", "협상중", "가격협상"],
  contracted: ["계약", "계약완료", "가계약"],
  closed: ["잔금완료", "잔금", "종결", "완료"],
  lost: ["이탈", "보류", "취소", "중단", "실패"],
};

export const CUSTOMER_TYPE_WORDS = {
  corporation: ["법인", "회사", "기업", "주식회사", "(주)"],
  individual: ["개인", "개인고객"],
};
