"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { fieldsFor, suggestMapping, type ImportKind } from "@/lib/import/fields";
import { commitImport as commit, previewImport as preview, type CommitResult, type ImportPreview } from "@/lib/import/preview";
import { MAX_COLS, MAX_ROWS, ReadError, readTable } from "@/lib/import/read-file";
import { listStaff } from "@/lib/queries";

const inputSchema = z.object({
  kind: z.enum(["customers", "properties"]),
  headers: z.array(z.string().max(200)).min(1).max(MAX_COLS),
  rows: z.array(z.array(z.string().max(5000)).max(MAX_COLS)).max(MAX_ROWS),
  headerRow: z.number().int().min(1).max(20),
  mapping: z.record(z.string(), z.number().int().min(0).max(MAX_COLS - 1).nullable()),
});

export type ImportInputJson = z.infer<typeof inputSchema>;

export type AnalyzeState =
  | null
  | { error: string }
  | ({ fileName: string; preview: ImportPreview } & ImportInputJson);

/** 1단계: 파일을 읽고 열을 자동 연결한 뒤 미리보기를 만듭니다. */
export async function analyzeUpload(_: AnalyzeState, fd: FormData): Promise<AnalyzeState> {
  const user = await requireUser();
  const kind: ImportKind = fd.get("kind") === "properties" ? "properties" : "customers";
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "파일을 선택해 주세요." };

  try {
    const table = await readTable(Buffer.from(await file.arrayBuffer()), file.name);
    const mapping = suggestMapping(table.headers, fieldsFor(kind));
    const input = { kind, ...table, mapping };
    const staff = await listStaff();
    return { fileName: file.name, ...input, preview: await preview(user, staff, input) };
  } catch (e) {
    if (e instanceof ReadError) return { error: e.message };
    throw e;
  }
}

/** 2단계: 열 연결을 바꿨을 때 다시 미리보기 */
export async function previewImport(raw: ImportInputJson): Promise<ImportPreview | { error: string }> {
  const user = await requireUser();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { error: "가져오기 데이터 형식이 올바르지 않습니다. 파일을 다시 올려 주세요." };
  return preview(user, await listStaff(), parsed.data);
}

/** 3단계: 실제 저장 */
export async function commitImport(
  raw: ImportInputJson,
  skipDuplicates: boolean,
): Promise<CommitResult | { error: string }> {
  const user = await requireUser();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { error: "가져오기 데이터 형식이 올바르지 않습니다. 파일을 다시 올려 주세요." };
  const result = await commit(user, await listStaff(), parsed.data, skipDuplicates !== false);
  if ("error" in result) return result;

  await audit({
    userId: user.id,
    action: "import",
    entityType: parsed.data.kind === "customers" ? "customer" : "property",
    detail: { ...result, rows: parsed.data.rows.length },
  });
  revalidatePath(parsed.data.kind === "customers" ? "/customers" : "/properties");
  revalidatePath("/");
  return result;
}
