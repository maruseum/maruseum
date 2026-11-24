import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db";
import { customerNeeds, customers, users } from "@/db/schema";
import { Badge, ButtonLink, Empty, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { customerScope } from "@/lib/authz";
import { daysSince, formatBudgetRange, formatDate } from "@/lib/format";
import { CUSTOMER_STAGE_LABEL, CUSTOMER_TYPE_LABEL, entries, STAGE_COLOR } from "@/lib/labels";

type Stage = keyof typeof CUSTOMER_STAGE_LABEL;

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const stage = typeof sp.stage === "string" && sp.stage in CUSTOMER_STAGE_LABEL ? (sp.stage as Stage) : null;
  const mine = sp.mine === "1";

  const scope = customerScope(user);
  const filters: (SQL | undefined)[] = [scope];
  if (q) {
    const like = `%${q}%`;
    filters.push(or(ilike(customers.name, like), ilike(customers.companyName, like), ilike(customers.phone, like)));
  }
  if (mine) filters.push(eq(customers.assigneeId, user.id));

  const latestNeeds = db
    .selectDistinctOn([customerNeeds.customerId], {
      customerId: customerNeeds.customerId,
      regions: customerNeeds.regions,
      budgetMin: customerNeeds.budgetMin,
      budgetMax: customerNeeds.budgetMax,
      version: customerNeeds.version,
    })
    .from(customerNeeds)
    .orderBy(customerNeeds.customerId, desc(customerNeeds.version))
    .as("ln");
  const assignee = alias(users, "assignee");

  const [rows, stageCounts] = await Promise.all([
    db
      .select({
        c: customers,
        assigneeName: assignee.name,
        regions: latestNeeds.regions,
        budgetMin: latestNeeds.budgetMin,
        budgetMax: latestNeeds.budgetMax,
        needsVersion: latestNeeds.version,
      })
      .from(customers)
      .leftJoin(assignee, eq(assignee.id, customers.assigneeId))
      .leftJoin(latestNeeds, eq(latestNeeds.customerId, customers.id))
      .where(and(...filters, stage ? eq(customers.stage, stage) : undefined))
      .orderBy(sql`${customers.lastContactedAt} desc nulls last`, desc(customers.createdAt))
      .limit(300),
    db
      .select({ stage: customers.stage, n: count() })
      .from(customers)
      .where(and(...filters))
      .groupBy(customers.stage),
  ]);

  const countBy = Object.fromEntries(stageCounts.map((r) => [r.stage, r.n])) as Partial<Record<Stage, number>>;
  const total = stageCounts.reduce((s, r) => s + r.n, 0);
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { q: q || null, stage, mine: mine ? "1" : null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/customers?${s}` : "/customers";
  };

  return (
    <>
      <PageHeader
        title="고객"
        description={`${user.role === "agent" ? "내 담당" : "볼 수 있는"} 고객 ${total}명`}
        actions={<ButtonLink href="/customers/new">+ 고객 등록</ButtonLink>}
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/customers">
        <input
          name="q"
          defaultValue={q}
          placeholder="이름·회사·연락처 검색"
          className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {stage && <input type="hidden" name="stage" value={stage} />}
        {user.role !== "agent" && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="mine" value="1" defaultChecked={mine} /> 내 담당만
          </label>
        )}
        <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">검색</button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={qs({ stage: null })} className={`rounded-full px-3 py-1 ${!stage ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
          전체 {total}
        </Link>
        {entries(CUSTOMER_STAGE_LABEL).map(([key, label]) => (
          <Link
            key={key}
            href={qs({ stage: key })}
            className={`rounded-full px-3 py-1 ${stage === key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {label} {countBy[key] ?? 0}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>조건에 맞는 고객이 없습니다.</Empty>
      ) : (
        <Table head={["이름", "구분", "단계", "희망 지역", "예산", "담당", "최근 연락"]}>
          {rows.map(({ c, assigneeName, regions, budgetMin, budgetMax }) => {
            const days = c.lastContactedAt ? daysSince(c.lastContactedAt) : null;
            return (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/customers/${c.id}`} className="font-medium text-slate-900 hover:underline">
                    {c.name}
                  </Link>
                  {c.companyName && <span className="ml-1 text-xs text-slate-500">{c.companyName}</span>}
                </Td>
                <Td>{CUSTOMER_TYPE_LABEL[c.customerType]}</Td>
                <Td>
                  <Badge color={STAGE_COLOR[c.stage]}>{CUSTOMER_STAGE_LABEL[c.stage]}</Badge>
                </Td>
                <Td className="max-w-56 truncate">{regions?.length ? regions.join(", ") : "—"}</Td>
                <Td>{formatBudgetRange(budgetMin ?? null, budgetMax ?? null)}</Td>
                <Td>{assigneeName ?? <span className="text-slate-400">미지정</span>}</Td>
                <Td>
                  {c.lastContactedAt ? (
                    <span className={days !== null && days >= 30 ? "text-red-600" : ""}>
                      {formatDate(c.lastContactedAt)} ({days}일 전)
                    </span>
                  ) : (
                    <span className="text-slate-400">없음</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
