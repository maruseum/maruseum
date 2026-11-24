// 표(헤더 + 행)를 고객·물건 레코드로 바꾸고 행별 오류·경고를 모읍니다. DB 접근 없음.
import { toPyeong } from "../format";
import { isEmptyNeeds, type NeedsSnapshot } from "../needs";
import { regionFromAddress } from "../region";
import { fieldsFor, type ImportKind, type Mapping } from "./fields";
import {
  areaUnitFromHeader,
  CUSTOMER_STAGE_WORDS,
  CUSTOMER_TYPE_WORDS,
  formatPhone,
  matchCode,
  moneyUnitFromHeader,
  parseArea,
  parseMoney,
  parseRange,
  PROPERTY_STATUS_WORDS,
  PROPERTY_TYPE_WORDS,
  splitList,
} from "./values";

export interface Staff {
  id: string;
  name: string;
}

export interface RowIssue {
  /** 엑셀 기준 행 번호 (헤더가 1행이면 첫 데이터는 2행) */
  row: number;
  messages: string[];
}

export interface CustomerRecord {
  row: number;
  customer: {
    name: string;
    customerType: "individual" | "corporation";
    companyName: string | null;
    phone: string | null;
    email: string | null;
    source: string | null;
    memo: string | null;
    stage: keyof typeof CUSTOMER_STAGE_WORDS;
    assigneeId: string | null;
  };
  needs: NeedsSnapshot | null;
}

export interface PropertyRecord {
  row: number;
  property: {
    title: string;
    propertyType: keyof typeof PROPERTY_TYPE_WORDS;
    status: keyof typeof PROPERTY_STATUS_WORDS;
    address: string;
    roadAddress: string | null;
    region: string | null;
    landCategory: string | null;
    zoning: string | null;
    landAreaM2: number | null;
    buildingAreaM2: number | null;
    askingPrice: number | null;
    ownerName: string | null;
    ownerPhone: string | null;
    description: string | null;
    assigneeId: string | null;
  };
}

export interface BuildResult<R> {
  records: R[];
  errors: RowIssue[];
  warnings: RowIssue[];
  /** 빈 행을 뺀 데이터 행 수 */
  total: number;
}

/** 데이터 행 번호 → 엑셀 행 번호 (헤더 1행 가정 + headerRow 보정) */
const excelRow = (i: number, headerRow: number) => headerRow + 1 + i;

class RowReader {
  errors: string[] = [];
  warnings: string[] = [];
  constructor(
    private row: string[],
    private headers: string[],
    private mapping: Mapping,
  ) {}

  header(key: string): string {
    const idx = this.mapping[key];
    return idx === null || idx === undefined ? "" : (this.headers[idx] ?? "");
  }

  text(key: string): string | null {
    const idx = this.mapping[key];
    if (idx === null || idx === undefined) return null;
    const v = (this.row[idx] ?? "").trim();
    return v === "" ? null : v;
  }

  money(key: string, label: string): number | null {
    const v = parseMoney(this.text(key), moneyUnitFromHeader(this.header(key)));
    if (Number.isNaN(v)) {
      this.errors.push(`${label} "${this.text(key)}" 을(를) 금액으로 읽을 수 없습니다`);
      return null;
    }
    return v;
  }

  moneyRange(key: string, label: string) {
    const unit = moneyUnitFromHeader(this.header(key));
    const r = parseRange(this.text(key), (s) => parseMoney(s, unit));
    if (r && (Number.isNaN(r.min) || Number.isNaN(r.max))) {
      this.errors.push(`${label} "${this.text(key)}" 을(를) 읽을 수 없습니다 (예: 30억~50억)`);
      return null;
    }
    return r;
  }

  area(key: string, label: string, fallback: "m2" | "pyeong"): number | null {
    const v = parseArea(this.text(key), areaUnitFromHeader(this.header(key), fallback));
    if (Number.isNaN(v)) {
      this.errors.push(`${label} "${this.text(key)}" 을(를) 면적으로 읽을 수 없습니다`);
      return null;
    }
    return v;
  }

  areaRange(key: string, label: string, fallback: "m2" | "pyeong") {
    const unit = areaUnitFromHeader(this.header(key), fallback);
    const r = parseRange(this.text(key), (s) => parseArea(s, unit));
    if (r && (Number.isNaN(r.min) || Number.isNaN(r.max))) {
      this.errors.push(`${label} "${this.text(key)}" 을(를) 읽을 수 없습니다 (예: 2000~3000평)`);
      return null;
    }
    return r;
  }

  code<T extends string>(key: string, label: string, table: Record<T, string[]>, fallback: T): T {
    const raw = this.text(key);
    if (!raw) return fallback;
    const c = matchCode(raw, table);
    if (!c) {
      this.warnings.push(`${label} "${raw}" 을(를) 알 수 없어 기본값으로 둡니다`);
      return fallback;
    }
    return c;
  }

  staff(key: string, staff: Staff[], fallback: string | null): string | null {
    const raw = this.text(key);
    if (!raw) return fallback;
    const s = staff.find((m) => m.name.replace(/\s/g, "") === raw.replace(/\s/g, ""));
    if (!s) {
      this.warnings.push(`담당자 "${raw}" 직원을 찾을 수 없습니다`);
      return fallback;
    }
    return s.id;
  }
}

const isBlank = (row: string[]) => row.every((c) => (c ?? "").trim() === "");

export interface BuildOptions {
  staff: Staff[];
  /** 담당자 칸이 비었거나 못 찾았을 때 */
  defaultAssigneeId: string | null;
  /** 직원 권한: 담당자를 항상 본인으로 */
  forceAssigneeId?: string | null;
  headerRow?: number;
}

export function buildCustomerRecords(
  headers: string[],
  rows: string[][],
  mapping: Mapping,
  opts: BuildOptions,
): BuildResult<CustomerRecord> {
  const out: BuildResult<CustomerRecord> = { records: [], errors: [], warnings: [], total: 0 };
  rows.forEach((row, i) => {
    if (isBlank(row)) return;
    out.total++;
    const r = new RowReader(row, headers, mapping);
    const rowNo = excelRow(i, opts.headerRow ?? 1);

    const name = r.text("name");
    if (!name) r.errors.push("고객 이름이 비어 있습니다");
    const companyName = r.text("companyName");

    const budget = r.moneyRange("budget", "예산");
    const budgetMin = r.money("budgetMin", "예산 하한") ?? budget?.min ?? null;
    const budgetMax = r.money("budgetMax", "예산 상한") ?? budget?.max ?? null;
    if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) r.errors.push("예산 하한이 상한보다 큽니다");
    const area = r.areaRange("landArea", "희망 면적", "pyeong");

    const needs: NeedsSnapshot = {
      regions: splitList(r.text("regions")),
      propertyTypes: [
        ...new Set(
          splitList(r.text("propertyTypes"))
            .map((t) => matchCode(t, PROPERTY_TYPE_WORDS))
            .filter((t): t is keyof typeof PROPERTY_TYPE_WORDS => t !== null),
        ),
      ],
      purpose: r.text("purpose"),
      budgetMin,
      budgetMax,
      landAreaMinM2: area?.min ?? null,
      landAreaMaxM2: area?.max ?? null,
      zonings: splitList(r.text("zonings")),
      notes: r.text("needsNotes"),
    };
    const typesRaw = splitList(r.text("propertyTypes"));
    if (typesRaw.length > needs.propertyTypes.length) r.warnings.push(`물건 종류 일부를 알 수 없습니다 (${typesRaw.join(", ")})`);

    const typeFallback = companyName ? "corporation" : "individual";
    const record: CustomerRecord = {
      row: rowNo,
      customer: {
        name: name ?? "",
        customerType: r.code("customerType", "구분", CUSTOMER_TYPE_WORDS, typeFallback),
        companyName,
        phone: formatPhone(r.text("phone")),
        email: r.text("email"),
        source: r.text("source"),
        memo: r.text("memo"),
        stage: r.code("stage", "진행 단계", CUSTOMER_STAGE_WORDS, "new"),
        assigneeId:
          opts.forceAssigneeId !== undefined
            ? opts.forceAssigneeId
            : r.staff("assignee", opts.staff, opts.defaultAssigneeId),
      },
      needs: isEmptyNeeds(needs) ? null : needs,
    };

    if (r.warnings.length) out.warnings.push({ row: rowNo, messages: r.warnings });
    if (r.errors.length) out.errors.push({ row: rowNo, messages: r.errors });
    else out.records.push(record);
  });
  return out;
}

const pyeongLabel = (m2: number) => `${Math.round(toPyeong(m2)).toLocaleString("ko-KR")}평`;

export function buildPropertyRecords(
  headers: string[],
  rows: string[][],
  mapping: Mapping,
  opts: BuildOptions,
): BuildResult<PropertyRecord> {
  const out: BuildResult<PropertyRecord> = { records: [], errors: [], warnings: [], total: 0 };
  rows.forEach((row, i) => {
    if (isBlank(row)) return;
    out.total++;
    const r = new RowReader(row, headers, mapping);
    const rowNo = excelRow(i, opts.headerRow ?? 1);

    const address = r.text("address");
    if (!address) r.errors.push("지번 주소가 비어 있습니다");
    const region = r.text("region") ?? regionFromAddress(address);
    const zoning = r.text("zoning");
    const landAreaM2 = r.area("landArea", "토지면적", "m2");
    const title =
      r.text("title") ??
      ([region, zoning, landAreaM2 ? pyeongLabel(landAreaM2) : null].filter(Boolean).join(" ") || address || "");

    const record: PropertyRecord = {
      row: rowNo,
      property: {
        title,
        propertyType: r.code("propertyType", "종류", PROPERTY_TYPE_WORDS, "land"),
        status: r.code("status", "상태", PROPERTY_STATUS_WORDS, "available"),
        address: address ?? "",
        roadAddress: r.text("roadAddress"),
        region,
        landCategory: r.text("landCategory"),
        zoning,
        landAreaM2,
        buildingAreaM2: r.area("buildingArea", "건물 연면적", "m2"),
        askingPrice: r.money("askingPrice", "희망가"),
        ownerName: r.text("ownerName"),
        ownerPhone: formatPhone(r.text("ownerPhone")),
        description: r.text("description"),
        assigneeId:
          opts.forceAssigneeId !== undefined
            ? opts.forceAssigneeId
            : r.staff("assignee", opts.staff, opts.defaultAssigneeId),
      },
    };

    if (r.warnings.length) out.warnings.push({ row: rowNo, messages: r.warnings });
    if (r.errors.length) out.errors.push({ row: rowNo, messages: r.errors });
    else out.records.push(record);
  });
  return out;
}

/** 필수 항목이 연결되지 않았으면 오류 문구 */
export function missingRequired(kind: ImportKind, mapping: Mapping): string[] {
  return fieldsFor(kind)
    .filter((f) => f.required && (mapping[f.key] === null || mapping[f.key] === undefined))
    .map((f) => `필수 항목 "${f.label}" 에 해당하는 열을 선택해 주세요`);
}
