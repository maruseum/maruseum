import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { customerNeeds } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatDuration, isProcessing, RECORDING_STATUS } from "@/components/recording-list";
import { Badge, Card, Empty, PageHeader, Select } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { readSummary, STALE_MS } from "@/lib/calls/process";
import { dueDateToDate, mergeNeedsChange } from "@/lib/calls/prompt";
import { customerOptions, getRecordingFor } from "@/lib/calls/queries";
import { INTENT_LABEL } from "@/lib/calls/summary-schema";
import { formatDate, formatDateTime, isPast } from "@/lib/format";
import { diffNeeds, toSnapshot } from "@/lib/needs";
import { applyNeedsFromCall, deleteRecordingAudio, linkRecordingCustomer, reprocessRecording } from "../actions";

export default async function CallDetailPage({ params }: PageProps<"/calls/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const row = await getRecordingFor(user, id);
  if (!row) notFound();
  const rec = row.rec;
  await audit({ userId: user.id, action: "view", entityType: "recording", entityId: id });

  const summary = readSummary(rec.summary);
  const [label, color] = RECORDING_STATUS[rec.status];
  const stale = isProcessing(rec.status) && isPast(new Date(rec.updatedAt.getTime() + STALE_MS));

  // 니즈 변경 제안: 현재 니즈와 비교해 무엇이 바뀌는지 미리 보여줍니다.
  let needsDiff: ReturnType<typeof diffNeeds> = [];
  if (summary?.needsChange && rec.customerId) {
    const [latest] = await db
      .select()
      .from(customerNeeds)
      .where(eq(customerNeeds.customerId, rec.customerId))
      .orderBy(desc(customerNeeds.version))
      .limit(1);
    const current = latest ? toSnapshot(latest) : null;
    needsDiff = diffNeeds(current, mergeNeedsChange(current, summary.needsChange));
  }
  const options = rec.customerId ? [] : await customerOptions(user);
  const canDeleteAudio = (user.role === "admin" || rec.uploadedBy === user.id) && rec.storageKey && !isProcessing(rec.status);

  return (
    <>
      <AutoRefresh active={isProcessing(rec.status) && !stale} />
      <PageHeader
        title={summary?.headline ?? rec.contactLabel ?? rec.fileName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge color={color}>{label}</Badge>
            {formatDateTime(rec.recordedAt ?? rec.createdAt)}
            {rec.contactLabel && ` · ${rec.contactLabel}`}
            {rec.durationSec ? ` · ${formatDuration(rec.durationSec)}` : ""}
            {rec.customerId && (
              <>
                {" · "}
                <Link href={`/customers/${rec.customerId}`} className="underline">
                  {row.customerName}
                  {row.customerCompany && ` (${row.customerCompany})`}
                </Link>
              </>
            )}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {(rec.status === "failed" || stale) && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              <span>{rec.error ?? "처리가 오래 멈춰 있습니다."}</span>
              <form action={reprocessRecording}>
                <input type="hidden" name="recordingId" value={rec.id} />
                <button className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white">재처리</button>
              </form>
            </div>
          )}

          {!rec.customerId && rec.status !== "failed" && (
            <Card title="고객 연결">
              <p className="mb-3 text-sm text-slate-600">
                파일명({rec.contactLabel ?? "상대 정보 없음"})으로 고객을 찾지 못했습니다. 고객을 선택하면 요약이 상담 기록과 할 일로 반영됩니다.
              </p>
              <ActionForm action={linkRecordingCustomer} submitLabel="연결" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="recordingId" value={rec.id} />
                <Select
                  name="customerId"
                  required
                  placeholder="고객 선택"
                  className="w-72"
                  options={options.map((c) => [
                    c.id,
                    `${c.name}${c.companyName ? ` (${c.companyName})` : ""}${c.phone ? ` · ${c.phone}` : ""}`,
                  ])}
                />
              </ActionForm>
            </Card>
          )}

          {isProcessing(rec.status) && !stale && (
            <Card>
              <p className="text-sm text-slate-600">
                {rec.status === "summarizing" ? "AI가 요약하고 있습니다…" : "음성을 글로 바꾸는 중입니다… (통화 10분에 30초~1분 정도)"} 이 화면은
                자동으로 새로 고쳐집니다.
              </p>
            </Card>
          )}

          {summary && (
            <Card
              title="AI 요약"
              actions={
                <Badge color={summary.customerIntent === "hot" ? "green" : summary.customerIntent === "cold" ? "slate" : "blue"}>
                  매입 의지 {INTENT_LABEL[summary.customerIntent]}
                </Badge>
              }
            >
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
                {summary.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              {summary.nextContact && (
                <p className="mt-3 text-sm">
                  <span className="text-slate-500">다음 연락:</span> {summary.nextContact}
                </p>
              )}
              {summary.mentionedProperties.length > 0 && (
                <p className="mt-1 text-sm">
                  <span className="text-slate-500">언급된 물건:</span> {summary.mentionedProperties.join(", ")}
                </p>
              )}
              <p className="mt-3 text-xs text-slate-400">AI가 만든 요약입니다. 중요한 숫자·날짜는 녹취록이나 음성으로 확인하세요.</p>
            </Card>
          )}

          {summary?.needsChange && (
            <Card title="니즈 변경 제안">
              <p className="mb-2 text-sm text-slate-600">“{summary.needsChange.evidence}”</p>
              {!rec.customerId ? (
                <Empty>고객을 연결하면 반영할 수 있습니다.</Empty>
              ) : rec.needsAppliedAt ? (
                <p className="text-sm text-emerald-700">✓ {formatDate(rec.needsAppliedAt)}에 고객 니즈에 반영했습니다.</p>
              ) : needsDiff.length === 0 ? (
                <p className="text-sm text-slate-500">현재 등록된 니즈와 같습니다.</p>
              ) : (
                <>
                  <ul className="mb-4 space-y-1 text-sm">
                    {needsDiff.map((ch) => (
                      <li key={ch.field}>
                        <span className="text-slate-500">{ch.label}:</span>{" "}
                        <span className="text-slate-400 line-through">{ch.before}</span> → <span className="font-medium">{ch.after}</span>
                      </li>
                    ))}
                  </ul>
                  <ActionForm action={applyNeedsFromCall} submitLabel="고객 니즈에 반영 (새 버전)">
                    <input type="hidden" name="recordingId" value={rec.id} />
                  </ActionForm>
                </>
              )}
            </Card>
          )}

          {rec.transcript && (
            <Card title="녹취록">
              <details>
                <summary className="cursor-pointer text-sm text-slate-600">펼치기 ({rec.transcript.length.toLocaleString()}자)</summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{rec.transcript}</p>
              </details>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="음성">
            {rec.storageKey ? (
              <audio controls preload="none" src={`/api/recordings/${rec.id}/audio`} className="w-full" />
            ) : (
              <p className="text-sm text-slate-500">음성 파일이 삭제됐습니다 (녹취록·요약은 남아 있음).</p>
            )}
            <p className="mt-2 break-all text-xs text-slate-400">
              {rec.fileName} ·{" "}
              {rec.sizeBytes >= 1024 * 1024 ? `${(rec.sizeBytes / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(rec.sizeBytes / 1024)}KB`} · 올린
              사람 {row.uploaderName ?? "—"}
            </p>
            {canDeleteAudio && (
              <form action={deleteRecordingAudio} className="mt-3">
                <input type="hidden" name="recordingId" value={rec.id} />
                <button className="text-xs text-red-600 underline">음성 파일 지금 삭제</button>
              </form>
            )}
          </Card>

          {summary && (
            <Card title="후속 조치">
              {summary.actionItems.length === 0 ? (
                <Empty>약속한 후속 조치가 없습니다.</Empty>
              ) : (
                <ul className="space-y-2 text-sm">
                  {summary.actionItems.map((a, i) => {
                    const due = dueDateToDate(a.dueDate);
                    return (
                      <li key={i}>
                        <Badge color={a.owner === "agent" ? "violet" : "slate"}>{a.owner === "agent" ? "직원" : "고객"}</Badge> {a.title}
                        {due && <span className="ml-1 text-xs text-slate-500">· {formatDate(due)}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">
                {rec.interactionId
                  ? "직원 할 일은 고객의 할 일 목록에 자동으로 추가됐습니다."
                  : "고객이 연결되면 직원 할 일이 자동으로 추가됩니다."}
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
