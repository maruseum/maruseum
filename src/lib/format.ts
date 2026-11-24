// 금액은 만원 단위 정수, 면적은 ㎡ 로 저장합니다.

export const M2_PER_PYEONG = 3.305785;

const num = new Intl.NumberFormat("ko-KR");
const num1 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

/** 123450 (만원) → "12억 3,450만원" */
export function formatManwon(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(Math.round(value));
  const eok = Math.floor(abs / 10000);
  const rest = abs % 10000;
  if (eok === 0) return `${sign}${num.format(rest)}만원`;
  if (rest === 0) return `${sign}${num.format(eok)}억원`;
  return `${sign}${num.format(eok)}억 ${num.format(rest)}만원`;
}

export function formatBudgetRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (min !== null && max !== null) {
    if (min === max) return formatManwon(min);
    return `${formatManwon(min)} ~ ${formatManwon(max)}`;
  }
  if (min !== null) return `${formatManwon(min)} 이상`;
  return `${formatManwon(max)} 이하`;
}

export function toPyeong(m2: number): number {
  return m2 / M2_PER_PYEONG;
}

/** 1000 → "1,000㎡ (302.5평)" */
export function formatArea(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined) return "—";
  return `${num1.format(m2)}㎡ (${num1.format(toPyeong(m2))}평)`;
}

export function formatAreaRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (min !== null && max !== null) return `${formatArea(min)} ~ ${formatArea(max)}`;
  if (min !== null) return `${formatArea(min)} 이상`;
  return `${formatArea(max)} 이하`;
}

/** 평당가 (만원/평) */
export function pricePerPyeong(priceManwon: number | null, m2: number | null): number | null {
  if (!priceManwon || !m2) return null;
  return Math.round(priceManwon / toPyeong(m2));
}

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "—";
}

export function formatDateTime(d: Date | null | undefined): string {
  return d ? dateTimeFmt.format(d) : "—";
}

/** 지금부터 n일 전 시각 */
export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

export function isPast(d: Date | null | undefined): boolean {
  return d ? d.getTime() < Date.now() : false;
}

export function daysSince(d: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

/** "1,234" · " 1234 " → 1234, 빈 값 → null, 숫자가 아니면 NaN */
export function parseNumberInput(raw: FormDataEntryValue | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[,\s]/g, "");
  if (s === "") return null;
  return Number(s);
}

/** "경기 화성, 평택\n용인" → ["경기 화성", "평택", "용인"] (중복 제거) */
export function parseList(raw: FormDataEntryValue | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const items = String(raw)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(items)];
}

/** datetime-local 입력값(서울 기준)을 Date 로 */
export function parseSeoulDateTime(raw: FormDataEntryValue | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const withTime = s.length === 10 ? `${s}T09:00` : s;
  const d = new Date(`${withTime}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → datetime-local 입력용 "YYYY-MM-DDTHH:mm" (서울 기준) */
export function toSeoulInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  const shifted = new Date(d.getTime() + 9 * 3600_000);
  return shifted.toISOString().slice(0, 16);
}
