import Link from "next/link";
import type { RecordingListRow } from "@/lib/calls/queries";
import { CallSummarySchema } from "@/lib/calls/summary-schema";
import { formatDateTime } from "@/lib/format";
import { Badge, Empty, type BadgeColor } from "./ui";

export const RECORDING_STATUS: Record<RecordingListRow["status"], [string, BadgeColor]> = {
  uploaded: ["대기", "slate"],
  transcribing: ["음성 인식 중", "blue"],
  summarizing: ["요약 중", "blue"],
  done: ["완료", "green"],
  failed: ["실패", "red"],
};

export const isProcessing = (s: RecordingListRow["status"]) => s === "uploaded" || s === "transcribing" || s === "summarizing";

export function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  return m ? `${m}분 ${sec % 60}초` : `${sec}초`;
}

export function RecordingList({ rows, showCustomer = true }: { rows: RecordingListRow[]; showCustomer?: boolean }) {
  if (rows.length === 0) return <Empty>올린 통화 녹음이 없습니다.</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => {
        const s = CallSummarySchema.safeParse(r.summary);
        const [label, color] = RECORDING_STATUS[r.status];
        return (
          <li key={r.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge color={color}>{label}</Badge>
              <Link href={`/calls/${r.id}`} className="font-medium text-slate-900 hover:underline">
                {s.success ? s.data.headline : r.contactLabel ?? r.fileName}
              </Link>
              {showCustomer &&
                (r.customerId ? (
                  <Link href={`/customers/${r.customerId}`} className="text-xs text-slate-600 underline">
                    {r.customerName}
                  </Link>
                ) : (
                  r.status !== "failed" && <Badge color="amber">고객 연결 필요</Badge>
                ))}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatDateTime(r.recordedAt ?? r.createdAt)}
              {r.contactLabel && ` · ${r.contactLabel}`}
              {r.durationSec ? ` · ${formatDuration(r.durationSec)}` : ""}
              {r.uploaderName && ` · ${r.uploaderName}`}
            </p>
            {r.status === "failed" && r.error && <p className="mt-0.5 text-xs text-red-600">{r.error}</p>}
          </li>
        );
      })}
    </ul>
  );
}
