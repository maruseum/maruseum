"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  analyzeUpload,
  commitImport,
  previewImport,
  type AnalyzeState,
  type ImportInputJson,
} from "@/app/(app)/import/actions";
import type { FieldDef } from "@/lib/import/fields";
import type { CommitResult, ImportPreview } from "@/lib/import/preview";

type Ready = Extract<NonNullable<AnalyzeState>, { preview: ImportPreview }>;

const btn = "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
const box = "rounded-lg border border-slate-200 bg-white p-5 shadow-sm";

export function ImportWizard({ fields }: { fields: Record<"customers" | "properties", FieldDef[]> }) {
  const [state, analyze, analyzing] = useActionState(analyzeUpload, null);
  const ready = state && "preview" in state ? state : null;

  return (
    <div className="space-y-6">
      <form action={analyze} className={box}>
        <h2 className="mb-4 text-base font-semibold">1. 파일 선택</h2>
        <div className="flex flex-wrap items-end gap-4">
          <fieldset className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="kind" value="customers" defaultChecked /> 고객
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="kind" value="properties" /> 물건
            </label>
          </fieldset>
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,.csv"
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
          />
          <button className={btn} disabled={analyzing}>
            {analyzing ? "읽는 중…" : "파일 분석"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          .xlsx 또는 .csv, 5MB·5,000행까지. 첫 줄(또는 제목 아래 줄)에 항목 이름이 있어야 합니다. 양식:{" "}
          <a href="/import/template?kind=customers" className="underline">고객 양식</a> ·{" "}
          <a href="/import/template?kind=properties" className="underline">물건 양식</a>
        </p>
        {state && "error" in state && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {state.error}
          </p>
        )}
      </form>

      {ready && <MappingStep key={`${ready.fileName}:${ready.rows.length}:${ready.headers.join("|")}`} data={ready} fields={fields[ready.kind]} />}
    </div>
  );
}

function MappingStep({ data, fields }: { data: Ready; fields: FieldDef[] }) {
  const [mapping, setMapping] = useState(data.mapping);
  const [preview, setPreview] = useState<ImportPreview>(data.preview);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [pending, startTransition] = useTransition();

  const input: ImportInputJson = { kind: data.kind, headers: data.headers, rows: data.rows, headerRow: data.headerRow, mapping };
  const sampleOf = (col: number | null) => {
    if (col === null) return "";
    const v = data.rows.find((r) => (r[col] ?? "").trim() !== "")?.[col];
    return v ? (v.length > 30 ? `${v.slice(0, 30)}…` : v) : "(빈 열)";
  };

  function changeMapping(key: string, value: string) {
    const next = { ...mapping, [key]: value === "" ? null : Number(value) };
    setMapping(next);
    setError(null);
    startTransition(async () => {
      const p = await previewImport({ ...input, mapping: next });
      if ("error" in p) setError(p.error);
      else setPreview(p);
    });
  }

  function runImport() {
    setError(null);
    startTransition(async () => {
      const r = await commitImport(input, skipDuplicates);
      if ("error" in r) setError(r.error);
      else setResult(r);
    });
  }

  const what = data.kind === "customers" ? "고객" : "물건";
  const count = preview.ready + (skipDuplicates ? 0 : preview.duplicates.length);

  if (result) {
    return (
      <section className={box}>
        <h2 className="mb-2 text-base font-semibold">3. 완료</h2>
        <p className="text-sm text-slate-700">
          {what} <strong>{result.inserted}건</strong>을 가져왔습니다.
          {result.skippedDuplicates > 0 && ` 중복 ${result.skippedDuplicates}건은 건너뛰었습니다.`}
          {result.errorRows > 0 && ` 오류 ${result.errorRows}행은 제외했습니다.`}
        </p>
        <div className="mt-4 flex gap-3 text-sm">
          <Link href={data.kind === "customers" ? "/customers" : "/properties"} className={btn}>
            {what} 목록 보기
          </Link>
          <Link href="/matching" className="rounded-md border border-slate-300 px-4 py-2">
            매칭 확인
          </Link>
          <a href="/import" className="rounded-md border border-slate-300 px-4 py-2">
            다른 파일 가져오기
          </a>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className={box}>
        <h2 className="mb-1 text-base font-semibold">2. 열 연결 확인</h2>
        <p className="mb-4 text-sm text-slate-500">
          {data.fileName} · {data.headers.length}개 열 · 헤더 {data.headerRow}행. 자동으로 연결한 결과입니다. 틀린 곳만 고치세요.
        </p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className="grid grid-cols-[9rem_1fr] items-center gap-2 text-sm">
              <span className="text-slate-700">
                {f.label}
                {f.required && <span className="text-red-600"> *</span>}
              </span>
              <span>
                <select
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => changeMapping(f.key, e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">— 사용 안 함 —</option>
                  {data.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="block truncate text-xs text-slate-400">
                  {mapping[f.key] !== null && mapping[f.key] !== undefined ? `예: ${sampleOf(mapping[f.key])}` : f.hint ?? ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className={box} aria-busy={pending}>
        <h2 className="mb-3 text-base font-semibold">미리보기 {pending && <span className="text-xs font-normal text-slate-400">갱신 중…</span>}</h2>
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Chip label="전체" value={preview.total} />
          <Chip label="가져올 수 있음" value={preview.ready} tone="green" />
          <Chip label="중복" value={preview.duplicates.length} tone={preview.duplicates.length ? "amber" : undefined} />
          <Chip label="오류(제외)" value={preview.errors.length} tone={preview.errors.length ? "red" : undefined} />
          <Chip label="확인 필요" value={preview.warnings.length} tone={preview.warnings.length ? "amber" : undefined} />
        </div>

        {preview.mappingErrors.map((m) => (
          <p key={m} role="alert" className="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">{m}</p>
        ))}

        {preview.sample.length > 0 && (
          <div className="mb-4 overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>{preview.sampleHead.map((h) => <th key={h} className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-slate-600">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.sample.map((s) => (
                  <tr key={s.row} className={s.duplicate ? "bg-amber-50" : ""}>
                    {s.cells.map((c, i) => <td key={i} className="whitespace-nowrap px-3 py-1.5 text-slate-700">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-1 text-xs text-slate-400">처음 {preview.sample.length}건 · 노란 행은 중복</p>
          </div>
        )}

        <IssueList title="오류 — 이 행들은 가져오지 않습니다" tone="red" items={preview.errors.map((e) => ({ row: e.row, text: e.messages.join(" / ") }))} open />
        <IssueList title="중복" tone="amber" items={preview.duplicates.map((d) => ({ row: d.row, text: `${d.label} — ${d.reason}` }))} open />
        <IssueList title="확인 필요 — 가져오되 기본값으로 둡니다" tone="amber" items={preview.warnings.map((w) => ({ row: w.row, text: w.messages.join(" / ") }))} />

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          {preview.duplicates.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
              중복은 건너뛰기
            </label>
          )}
          <button type="button" className={btn} disabled={pending || count === 0 || preview.mappingErrors.length > 0} onClick={runImport}>
            {pending ? "처리 중…" : `${what} ${count}건 가져오기`}
          </button>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
      </section>
    </>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" }) {
  const cls = tone === "green" ? "bg-emerald-50 text-emerald-800" : tone === "amber" ? "bg-amber-50 text-amber-800" : tone === "red" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-3 py-1 ${cls}`}>
      {label} <strong>{value}</strong>
    </span>
  );
}

function IssueList({ title, items, tone, open = false }: { title: string; items: { row: number; text: string }[]; tone: "red" | "amber"; open?: boolean }) {
  if (items.length === 0) return null;
  return (
    <details open={open} className="mb-3">
      <summary className={`cursor-pointer text-sm font-medium ${tone === "red" ? "text-red-700" : "text-amber-800"}`}>
        {title} ({items.length})
      </summary>
      <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto text-xs text-slate-700">
        {items.slice(0, 200).map((it, i) => (
          <li key={`${it.row}-${i}`}>
            <span className="mr-2 font-mono text-slate-400">{it.row}행</span>
            {it.text}
          </li>
        ))}
        {items.length > 200 && <li className="text-slate-400">… 외 {items.length - 200}건</li>}
      </ul>
    </details>
  );
}
