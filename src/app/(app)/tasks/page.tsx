import { and, eq, gte, lt, or, sql } from "drizzle-orm";
import Link from "next/link";
import { tasks } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { TaskList } from "@/components/task-list";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { listStaff, staffOptions } from "@/lib/queries";
import { listTasks, taskScope } from "@/lib/task-queries";
import { createTask } from "./actions";

/** 서울 기준 오늘 0시 */
function startOfTodaySeoul(now = new Date()): Date {
  const seoul = new Date(now.getTime() + 9 * 3600_000);
  seoul.setUTCHours(0, 0, 0, 0);
  return new Date(seoul.getTime() - 9 * 3600_000);
}

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "all" && user.role !== "agent" ? "all" : sp.view === "done" ? "done" : "mine";
  const scope = taskScope(user, view === "mine");

  const today = startOfTodaySeoul();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const open = eq(tasks.status, "open");

  const [overdue, dueToday, upcoming, done, staff] = await Promise.all([
    listTasks(and(scope, open, lt(tasks.dueAt, today))),
    listTasks(and(scope, open, gte(tasks.dueAt, today), lt(tasks.dueAt, tomorrow))),
    listTasks(and(scope, open, or(gte(tasks.dueAt, tomorrow), sql`${tasks.dueAt} is null`))),
    view === "done" ? listTasks(and(taskScope(user, false), eq(tasks.status, "done")), 100) : Promise.resolve([]),
    listStaff(),
  ]);

  const tab = (v: string, label: string) => (
    <Link
      href={v === "mine" ? "/tasks" : `/tasks?view=${v}`}
      className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="할 일" description="통화 요약에서 뽑은 후속 조치도 여기로 모입니다 (다음 단계)." />
      <div className="mb-4 flex gap-2">
        {tab("mine", "내 할 일")}
        {user.role !== "agent" && tab("all", "팀 전체")}
        {tab("done", "완료한 일")}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {view === "done" ? (
            <Card title="완료한 일 (최근 100건)">
              <TaskList rows={done} showLinks />
            </Card>
          ) : (
            <>
              <Card title={`지난 마감 ${overdue.length}`}>
                <TaskList rows={overdue} showLinks empty="지난 마감이 없습니다." />
              </Card>
              <Card title={`오늘 ${dueToday.length}`}>
                <TaskList rows={dueToday} showLinks empty="오늘 마감인 일이 없습니다." />
              </Card>
              <Card title={`예정 ${upcoming.length}`}>
                <TaskList rows={upcoming} showLinks />
              </Card>
            </>
          )}
        </div>
        <Card title="할 일 추가">
          <ActionForm action={createTask.bind(null, {})} resetOnSuccess submitLabel="추가">
            <Field label="할 일 *">
              <Input name="title" required />
            </Field>
            <Field label="마감">
              <Input name="dueAt" type="datetime-local" />
            </Field>
            <Field label="담당">
              <Select name="assigneeId" options={staffOptions(staff)} defaultValue={user.id} />
            </Field>
            <Field label="메모">
              <Input name="description" />
            </Field>
          </ActionForm>
          <p className="mt-3 text-xs text-slate-500">특정 고객·물건 관련 일은 해당 상세 화면에서 추가하면 자동으로 연결됩니다.</p>
        </Card>
      </div>
    </>
  );
}
