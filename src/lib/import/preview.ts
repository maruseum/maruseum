import "server-only";
import type { Actor } from "../authz";
import { formatAreaRange, formatArea, formatBudgetRange, formatManwon } from "../format";
import { CUSTOMER_STAGE_LABEL, CUSTOMER_TYPE_LABEL, PROPERTY_STATUS_LABEL, PROPERTY_TYPE_LABEL } from "../labels";
import { findCustomerDuplicates, findPropertyDuplicates, insertCustomers, insertProperties } from "./commit";
import type { ImportKind, Mapping } from "./fields";
import {
  buildCustomerRecords,
  buildPropertyRecords,
  missingRequired,
  type BuildResult,
  type CustomerRecord,
  type PropertyRecord,
  type RowIssue,
  type Staff,
} from "./validate";

export interface ImportInput {
  kind: ImportKind;
  headers: string[];
  rows: string[][];
  headerRow: number;
  mapping: Mapping;
}

export interface ImportPreview {
  total: number;
  ready: number;
  duplicates: { row: number; label: string; reason: string }[];
  errors: RowIssue[];
  warnings: RowIssue[];
  mappingErrors: string[];
  sampleHead: string[];
  sample: { row: number; cells: string[]; duplicate: boolean }[];
}

function build(actor: Actor, staff: Staff[], input: ImportInput) {
  const opts = {
    staff,
    defaultAssigneeId: actor.id,
    headerRow: input.headerRow,
  };
  if (input.kind === "customers") {
    // 직원은 본인 담당으로만 가져올 수 있습니다 (다른 직원 고객으로 넣으면 본인이 볼 수 없게 되므로).
    const forced = actor.role === "agent" ? { forceAssigneeId: actor.id } : {};
    return { kind: "customers" as const, result: buildCustomerRecords(input.headers, input.rows, input.mapping, { ...opts, ...forced }) };
  }
  return { kind: "properties" as const, result: buildPropertyRecords(input.headers, input.rows, input.mapping, opts) };
}

type Built =
  | { kind: "customers"; result: BuildResult<CustomerRecord> }
  | { kind: "properties"; result: BuildResult<PropertyRecord> };

async function duplicatesOf(b: Built) {
  return b.kind === "customers" ? findCustomerDuplicates(b.result.records) : findPropertyDuplicates(b.result.records);
}

const staffName = (staff: Staff[], id: string | null) => staff.find((s) => s.id === id)?.name ?? "미지정";

export async function previewImport(actor: Actor, staff: Staff[], input: ImportInput): Promise<ImportPreview> {
  const mappingErrors = missingRequired(input.kind, input.mapping);
  const b = build(actor, staff, input) as Built;
  const dup = mappingErrors.length ? new Map<number, string>() : await duplicatesOf(b);

  let sampleHead: string[];
  let sample: ImportPreview["sample"];
  let labelOf: (row: number) => string;

  if (b.kind === "customers") {
    sampleHead = ["행", "이름", "구분", "연락처", "단계", "담당", "희망 지역", "예산", "면적"];
    sample = b.result.records.slice(0, 10).map((r) => ({
      row: r.row,
      duplicate: dup.has(r.row),
      cells: [
        String(r.row),
        r.customer.companyName ? `${r.customer.name} (${r.customer.companyName})` : r.customer.name,
        CUSTOMER_TYPE_LABEL[r.customer.customerType],
        r.customer.phone ?? "—",
        CUSTOMER_STAGE_LABEL[r.customer.stage],
        staffName(staff, r.customer.assigneeId),
        r.needs?.regions.join(", ") || "—",
        r.needs ? formatBudgetRange(r.needs.budgetMin, r.needs.budgetMax) : "—",
        r.needs ? formatAreaRange(r.needs.landAreaMinM2, r.needs.landAreaMaxM2) : "—",
      ],
    }));
    const byRow = new Map(b.result.records.map((r) => [r.row, r.customer.name]));
    labelOf = (row) => byRow.get(row) ?? "";
  } else {
    sampleHead = ["행", "물건명", "종류", "지번 주소", "지역", "용도지역", "토지면적", "희망가", "상태"];
    sample = b.result.records.slice(0, 10).map((r) => ({
      row: r.row,
      duplicate: dup.has(r.row),
      cells: [
        String(r.row),
        r.property.title,
        PROPERTY_TYPE_LABEL[r.property.propertyType],
        r.property.address,
        r.property.region ?? "—",
        r.property.zoning ?? "—",
        formatArea(r.property.landAreaM2),
        formatManwon(r.property.askingPrice),
        PROPERTY_STATUS_LABEL[r.property.status],
      ],
    }));
    const byRow = new Map(b.result.records.map((r) => [r.row, r.property.address]));
    labelOf = (row) => byRow.get(row) ?? "";
  }

  return {
    total: b.result.total,
    ready: mappingErrors.length ? 0 : b.result.records.length - dup.size,
    duplicates: [...dup].map(([row, reason]) => ({ row, label: labelOf(row), reason })),
    errors: b.result.errors,
    warnings: b.result.warnings,
    mappingErrors,
    sampleHead,
    sample,
  };
}

export interface CommitResult {
  inserted: number;
  skippedDuplicates: number;
  errorRows: number;
}

/** 오류 행은 항상 건너뛰고, 중복 행은 skipDuplicates 일 때 건너뜁니다. */
export async function commitImport(
  actor: Actor,
  staff: Staff[],
  input: ImportInput,
  skipDuplicates: boolean,
): Promise<CommitResult | { error: string }> {
  const mappingErrors = missingRequired(input.kind, input.mapping);
  if (mappingErrors.length) return { error: mappingErrors.join(" / ") };
  const b = build(actor, staff, input) as Built;
  const dup = await duplicatesOf(b);
  const keep = <R extends { row: number }>(records: R[]) => (skipDuplicates ? records.filter((r) => !dup.has(r.row)) : records);

  const inserted =
    b.kind === "customers"
      ? await insertCustomers(actor.id, keep(b.result.records))
      : await insertProperties(actor.id, keep(b.result.records));
  return {
    inserted,
    skippedDuplicates: skipDuplicates ? dup.size : 0,
    errorRows: b.result.errors.length,
  };
}
