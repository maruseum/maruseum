import Link from "next/link";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import { formatDateTime, isPast } from "@/lib/format";
import { Empty } from "./ui";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  status: "open" | "done" | "canceled";
  assigneeName: string | null;
  customerId?: string | null;
  customerName?: string | null;
  propertyId?: string | null;
  propertyTitle?: string | null;
}

export function TaskList({ rows, showLinks = false, empty = "할 일이 없습니다." }: { rows: TaskRow[]; showLinks?: boolean; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((t) => {
        const overdue = t.status === "open" && isPast(t.dueAt);
        return (
          <li key={t.id} className="flex items-start gap-3 py-2">
            <form action={setTaskStatus}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={t.status === "done" ? "open" : "done"} />
              <button
                aria-label={t.status === "done" ? "완료 취소" : "완료 처리"}
                className={`mt-0.5 h-5 w-5 rounded border ${t.status === "done" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 bg-white"} text-xs leading-none`}
              >
                {t.status === "done" ? "✓" : ""}
              </button>
            </form>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${t.status === "done" ? "text-slate-400 line-through" : "text-slate-900"}`}>{t.title}</p>
              <p className="text-xs text-slate-500">
                {t.dueAt && <span className={overdue ? "font-medium text-red-600" : ""}>마감 {formatDateTime(t.dueAt)}{overdue ? " (지남)" : ""} · </span>}
                {t.assigneeName ?? "담당 미지정"}
                {showLinks && t.customerId && (
                  <>
                    {" · "}
                    <Link href={`/customers/${t.customerId}`} className="underline">
                      {t.customerName}
                    </Link>
                  </>
                )}
                {showLinks && t.propertyId && (
                  <>
                    {" · "}
                    <Link href={`/properties/${t.propertyId}`} className="underline">
                      {t.propertyTitle}
                    </Link>
                  </>
                )}
              </p>
              {t.description && <p className="mt-1 text-xs text-slate-600">{t.description}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
