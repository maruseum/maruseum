import { and, count, desc, eq, lt, notInArray, or, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { customers, properties, tasks } from "@/db/schema";
import { TaskList } from "@/components/task-list";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { customerScope } from "@/lib/authz";
import { daysAgo, daysSince, formatDate, formatManwon } from "@/lib/format";
import { CUSTOMER_STAGE_LABEL, entries, PROPERTY_STATUS_COLOR, PROPERTY_STATUS_LABEL, STAGE_COLOR } from "@/lib/labels";
import { countMyOpenTasks, listTasks, taskScope } from "@/lib/task-queries";

const STALE_DAYS = 30;

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = customerScope(user);
  const staleBefore = daysAgo(STALE_DAYS);
  const activeStage = notInArray(customers.stage, ["closed", "lost"]);
  const staleCond = and(
    scope,
    activeStage,
    or(lt(customers.lastContactedAt, staleBefore), sql`${customers.lastContactedAt} is null`),
  );

  const [stageCounts, myTasks, stale, staleCount, propertyCounts, recentProps, taskCounts] = await Promise.all([
    db.select({ stage: customers.stage, n: count() }).from(customers).where(scope).groupBy(customers.stage),
    listTasks(and(taskScope(user, true), eq(tasks.status, "open")), 10),
    db
      .select({ id: customers.id, name: customers.name, stage: customers.stage, last: customers.lastContactedAt, createdAt: customers.createdAt })
      .from(customers)
      .where(staleCond)
      .orderBy(sql`${customers.lastContactedAt} asc nulls first`)
      .limit(8),
    db.select({ n: count() }).from(customers).where(staleCond),
    db.select({ status: properties.status, n: count() }).from(properties).groupBy(properties.status),
    db.select().from(properties).orderBy(desc(properties.createdAt)).limit(5),
    countMyOpenTasks(user),
  ]);

  const byStage = Object.fromEntries(stageCounts.map((r) => [r.stage, r.n])) as Record<string, number>;
  const totalCustomers = stageCounts.reduce((s, r) => s + r.n, 0);
  const activeCustomers = stageCounts.filter((r) => r.stage !== "closed" && r.stage !== "lost").reduce((s, r) => s + r.n, 0);
  const byPropStatus = Object.fromEntries(propertyCounts.map((r) => [r.status, r.n])) as Record<string, number>;

  const stat = (label: string, value: number | string, href: string, warn = false) => (
    <Link href={href} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${warn ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </Link>
  );

  return (
    <>
      {sp.denied && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">접근 권한이 없는 화면입니다.</p>}
      <PageHeader title={`${user.name}님, 안녕하세요`} description={formatDate(new Date())} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat("진행 중 고객", `${activeCustomers} / ${totalCustomers}`, "/customers")}
        {stat(`${STALE_DAYS}일 이상 미연락`, staleCount[0]?.n ?? 0, "/customers", (staleCount[0]?.n ?? 0) > 0)}
        {stat("내 할 일 (지난 마감)", `${taskCounts.open} (${taskCounts.overdue})`, "/tasks", taskCounts.overdue > 0)}
        {stat("진행·협상 중 물건", (byPropStatus.available ?? 0) + (byPropStatus.negotiating ?? 0), "/properties")}
      </div>

      <Card title="고객 파이프라인" className="mb-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {entries(CUSTOMER_STAGE_LABEL).map(([key, label]) => (
            <Link key={key} href={`/customers?stage=${key}`} className="rounded-md border border-slate-200 p-3 text-center hover:bg-slate-50">
              <Badge color={STAGE_COLOR[key]}>{label}</Badge>
              <p className="mt-2 text-xl font-semibold">{byStage[key] ?? 0}</p>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="내 할 일" actions={<Link href="/tasks" className="text-xs text-slate-500 underline">전체 보기</Link>}>
          <TaskList rows={myTasks} showLinks empty="남은 할 일이 없습니다." />
        </Card>

        <Card title="연락이 끊긴 고객" actions={<span className="text-xs text-slate-500">{STALE_DAYS}일 이상</span>}>
          {stale.length === 0 ? (
            <Empty>모든 진행 고객과 최근에 연락했습니다.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stale.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  <span className="text-xs text-slate-500">
                    {CUSTOMER_STAGE_LABEL[c.stage]} · {c.last ? `${daysSince(c.last)}일 전` : "연락 기록 없음"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="최근 등록 물건" actions={<Link href="/properties" className="text-xs text-slate-500 underline">전체 보기</Link>}>
          {recentProps.length === 0 ? (
            <Empty>등록된 물건이 없습니다.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentProps.map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <Link href={`/properties/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Badge color={PROPERTY_STATUS_COLOR[p.status]}>{PROPERTY_STATUS_LABEL[p.status]}</Badge>
                    {formatManwon(p.askingPrice)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
