import ExcelJS from "exceljs";
import Papa from "papaparse";

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
export const MAX_COLS = 60;

export interface Table {
  headers: string[];
  rows: string[][];
  /** 엑셀 기준 헤더 행 번호 (1부터) */
  headerRow: number;
}

export class ReadError extends Error {}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
  }
  return String(value);
}

/** 앞쪽 10행 중 값이 2칸 이상 있는 첫 행을 헤더로 봅니다 (제목 행이 있는 엑셀 대응). */
function splitHeader(grid: string[][]): Table {
  const headerIdx = grid.slice(0, 10).findIndex((r) => r.filter((c) => c.trim() !== "").length >= 2);
  if (headerIdx < 0) throw new ReadError("머리글(항목 이름) 행을 찾을 수 없습니다. 첫 줄에 항목 이름을 넣어 주세요.");
  const width = Math.min(MAX_COLS, Math.max(...grid.slice(headerIdx).map((r) => r.length)));
  const headers = Array.from({ length: width }, (_, i) => (grid[headerIdx][i] ?? "").trim() || `열 ${i + 1}`);
  const rows = grid
    .slice(headerIdx + 1)
    .map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").toString().trim()));
  // 끝쪽 빈 행 제거
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  if (rows.length === 0) throw new ReadError("데이터 행이 없습니다.");
  if (rows.length > MAX_ROWS) throw new ReadError(`한 번에 ${MAX_ROWS.toLocaleString()}행까지 가져올 수 있습니다. 파일을 나눠 주세요.`);
  return { headers, rows, headerRow: headerIdx + 1 };
}

async function readXlsx(buf: Buffer): Promise<Table> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new ReadError("엑셀 파일을 열 수 없습니다. .xlsx 형식인지 확인해 주세요.");
  }
  const ws = wb.worksheets.find((s) => s.state === "visible" && s.actualRowCount > 0);
  if (!ws) throw new ReadError("내용이 있는 시트가 없습니다.");
  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > MAX_ROWS + 20) return;
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col <= MAX_COLS) cells[col - 1] = cellText(cell.value);
    });
    grid[rowNumber - 1] = cells;
  });
  return splitHeader(Array.from(grid, (r) => r ?? []));
}

function decodeText(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    // 한글 엑셀에서 "CSV(쉼표로 분리)" 로 저장하면 EUC-KR(CP949) 입니다.
    return new TextDecoder("euc-kr").decode(buf);
  }
}

function readCsv(buf: Buffer): Table {
  const parsed = Papa.parse<string[]>(decodeText(buf), { skipEmptyLines: false });
  return splitHeader(parsed.data.map((r) => r.map((c) => String(c ?? ""))));
}

export async function readTable(buf: Buffer, fileName: string): Promise<Table> {
  if (buf.byteLength === 0) throw new ReadError("빈 파일입니다.");
  if (buf.byteLength > MAX_BYTES) throw new ReadError("파일이 5MB를 넘습니다.");
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "xlsx") return readXlsx(buf);
  if (ext === "csv" || ext === "txt") return readCsv(buf);
  if (ext === "xls") throw new ReadError("예전 엑셀 형식(.xls)은 지원하지 않습니다. 엑셀에서 '다른 이름으로 저장 → .xlsx' 후 올려 주세요.");
  throw new ReadError(".xlsx 또는 .csv 파일만 가져올 수 있습니다.");
}
