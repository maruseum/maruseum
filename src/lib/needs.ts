import { FormError, nonNegative, str } from "./form";
import { formatArea, formatManwon, M2_PER_PYEONG, parseList, parseNumberInput } from "./format";
import { PROPERTY_TYPE_LABEL } from "./labels";

/** 고객 니즈 한 시점의 값 (customer_needs 한 행에서 비교 대상 필드만) */
export interface NeedsSnapshot {
  regions: string[];
  propertyTypes: string[];
  purpose: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  landAreaMinM2: number | null;
  landAreaMaxM2: number | null;
  zonings: string[];
  notes: string | null;
}

export interface NeedsChange {
  field: keyof NeedsSnapshot;
  label: string;
  before: string;
  after: string;
  /** 목록형 필드일 때 추가/삭제된 항목 */
  added?: string[];
  removed?: string[];
}

type FieldSpec =
  | { key: keyof NeedsSnapshot; label: string; kind: "list"; show?: (v: string) => string }
  | { key: keyof NeedsSnapshot; label: string; kind: "money" | "area" | "text" };

const typeLabel = (v: string) => PROPERTY_TYPE_LABEL[v as keyof typeof PROPERTY_TYPE_LABEL] ?? v;

export const NEEDS_FIELDS: FieldSpec[] = [
  { key: "regions", label: "희망 지역", kind: "list" },
  { key: "propertyTypes", label: "물건 종류", kind: "list", show: typeLabel },
  { key: "purpose", label: "매입 목적", kind: "text" },
  { key: "budgetMin", label: "예산 하한", kind: "money" },
  { key: "budgetMax", label: "예산 상한", kind: "money" },
  { key: "landAreaMinM2", label: "토지면적 하한", kind: "area" },
  { key: "landAreaMaxM2", label: "토지면적 상한", kind: "area" },
  { key: "zonings", label: "용도지역", kind: "list" },
  { key: "notes", label: "기타 조건", kind: "text" },
];

const EMPTY = "—";

function show(spec: FieldSpec, value: unknown): string {
  if (spec.kind === "list") {
    const arr = value as string[];
    if (!arr.length) return EMPTY;
    return arr.map(spec.show ?? ((v) => v)).join(", ");
  }
  if (value === null || value === undefined || value === "") return EMPTY;
  if (spec.kind === "money") return formatManwon(value as number);
  if (spec.kind === "area") return formatArea(value as number);
  return String(value);
}

function normText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** 이전 니즈와 새 니즈를 비교해 바뀐 항목만 돌려줍니다. prev 가 null 이면 첫 등록입니다. */
export function diffNeeds(prev: NeedsSnapshot | null, next: NeedsSnapshot): NeedsChange[] {
  const changes: NeedsChange[] = [];

  for (const spec of NEEDS_FIELDS) {
    const a = prev ? prev[spec.key] : spec.kind === "list" ? [] : null;
    const b = next[spec.key];

    if (spec.kind === "list") {
      const before = new Set((a as string[]) ?? []);
      const after = new Set((b as string[]) ?? []);
      const added = [...after].filter((x) => !before.has(x));
      const removed = [...before].filter((x) => !after.has(x));
      if (added.length || removed.length) {
        const fmt = spec.show ?? ((v: string) => v);
        changes.push({
          field: spec.key,
          label: spec.label,
          before: show(spec, [...before]),
          after: show(spec, [...after]),
          added: added.map(fmt),
          removed: removed.map(fmt),
        });
      }
      continue;
    }

    if (spec.kind === "text") {
      if (normText(a) !== normText(b)) {
        changes.push({ field: spec.key, label: spec.label, before: show(spec, normText(a)), after: show(spec, normText(b)) });
      }
      continue;
    }

    const na = a === null || a === undefined ? null : Number(a);
    const nb = b === null || b === undefined ? null : Number(b);
    if (na !== nb) {
      changes.push({ field: spec.key, label: spec.label, before: show(spec, na), after: show(spec, nb) });
    }
  }

  return changes;
}

/** 니즈 입력 폼(이름 앞에 needs_)을 읽습니다. 면적은 평 또는 ㎡ 로 받아 ㎡ 로 저장합니다. */
export function parseNeedsForm(fd: FormData): NeedsSnapshot {
  const unit = fd.get("needs_areaUnit") === "m2" ? "m2" : "pyeong";
  const area = (name: string, label: string) => {
    const v = nonNegative(parseNumberInput(fd.get(name)), label);
    if (v === null) return null;
    return Math.round((unit === "m2" ? v : v * M2_PER_PYEONG) * 100) / 100;
  };
  const budgetMin = nonNegative(parseNumberInput(fd.get("needs_budgetMin")), "예산 하한");
  const budgetMax = nonNegative(parseNumberInput(fd.get("needs_budgetMax")), "예산 상한");
  if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    throw new FormError("예산 하한이 상한보다 큽니다.");
  }
  const landAreaMinM2 = area("needs_landMin", "토지면적 하한");
  const landAreaMaxM2 = area("needs_landMax", "토지면적 상한");
  if (landAreaMinM2 !== null && landAreaMaxM2 !== null && landAreaMinM2 > landAreaMaxM2) {
    throw new FormError("토지면적 하한이 상한보다 큽니다.");
  }
  const types = fd
    .getAll("needs_types")
    .map(String)
    .filter((t) => t in PROPERTY_TYPE_LABEL);

  return {
    regions: parseList(fd.get("needs_regions")),
    propertyTypes: [...new Set(types)],
    purpose: str(fd, "needs_purpose"),
    budgetMin,
    budgetMax,
    landAreaMinM2,
    landAreaMaxM2,
    zonings: parseList(fd.get("needs_zonings")),
    notes: str(fd, "needs_notes"),
  };
}

export function isEmptyNeeds(n: NeedsSnapshot): boolean {
  return diffNeeds(null, n).length === 0;
}

export function toSnapshot(row: {
  regions: string[] | null;
  propertyTypes: string[] | null;
  purpose: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  landAreaMinM2: number | null;
  landAreaMaxM2: number | null;
  zonings: string[] | null;
  notes: string | null;
}): NeedsSnapshot {
  return {
    regions: row.regions ?? [],
    propertyTypes: row.propertyTypes ?? [],
    purpose: row.purpose,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    landAreaMinM2: row.landAreaMinM2,
    landAreaMaxM2: row.landAreaMaxM2,
    zonings: row.zonings ?? [],
    notes: row.notes,
  };
}
