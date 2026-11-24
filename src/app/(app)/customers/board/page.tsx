import { and, desc, eq, gte, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { customerNeeds, customers, users } from "@/db/schema";
import { PipelineBoard, type BoardCard } from "@/components/pipeline-board";
import { ButtonLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { customerScope } from "@/lib/authz";
import { daysAgo, daysSince, formatBudgetRange } from "@/lib/format";
import { CUSTOMER_STAGE_LABEL, entries } from "@/lib/labels";

const STALE_DAYS = 30;
/** 잔금 완료·이탈 열은 최근 이 기간에 바뀐 고객만 보여줍니다. */
const CLOSED_VISIBLE_DAYS = 60;

export default async function PipelineBoardPage({ searchParams }: PageProps<"/customers/board">) {
  const user = await requireUser();
  const sp = await searchParams;
  const mine = sp.mine === "1";

  const ln = db
    .selectDistinctOn([customerNeeds.customerId], {
      customerId: customerNeeds.customerId,
      regions: customerNeeds.regions,
      budgetMin: customerNeeds.budgetMin,
      budgetMax: customerNeeds.budgetMax,
    })
    .from(customerNeeds)
    .orderBy(customerNeeds.customerId, desc(customerNeeds.version))
    .as("ln");
  const assignee = alias(users, "assignee");

  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      companyName: customers.companyName,
      stage: customers.stage,
      lastContactedAt: customers.lastContactedAt,
      assigneeName: assignee.name,
      regions: ln.regions,
      budgetMin: ln.budgetMin,
      budgetMax: ln.budgetMax,
    })
    .from(customers)
    .leftJoin(assignee, eq(assignee.id, customers.assigneeId))
    .leftJoin(ln, eq(ln.customerId, customers.id))
    .where(
      and(
        customerScope(user),
        mine ? eq(customers.assigneeId, user.id) : undefined,
        or(notInArray(customers.stage, ["closed", "lost"]), gte(customers.updatedAt, daysAgo(CLOSED_VISIBLE_DAYS))),
      ),
    )
    .orderBy(sql`${customers.lastContactedAt} asc nulls first`)
    .limit(500);

  const cards: BoardCard[] = rows.map((r) => {
    const days = r.lastContactedAt ? daysSince(r.lastContactedAt) : null;
    const active = r.stage !== "closed" && r.stage !== "lost";
    const budget = formatBudgetRange(r.budgetMin ?? null, r.budgetMax ?? null);
    const parts = [r.regions?.slice(0, 2).join(", "), budget !== "—" ? budget : null].filter(Boolean);
    return {
      id: r.id,
      name: r.name,
      companyName: r.companyName,
      stage: r.stage,
      assigneeName: r.assigneeName,
      summary: parts.length ? parts.join(" · ") : null,
      lastContactLabel: days === null ? "연락 기록 없음" : days === 0 ? "오늘 연락" : `${days}일 전 연락`,
      stale: active && (days === null || days >= STALE_DAYS),
    };
  });

  return (
    <>
      <PageHeader
        title="파이프라인"
        description={`카드를 끌어 단계를 바꿉니다. 빨간 글씨는 ${STALE_DAYS}일 이상 연락 없음. 잔금 완료·이탈은 최근 ${CLOSED_VISIBLE_DAYS}일만 표시.`}
        actions={
          <>
            {user.role !== "agent" && (
              <ButtonLink href={mine ? "/customers/board" : "/customers/board?mine=1"} variant="secondary">
                {mine ? "전체 보기" : "내 담당만"}
              </ButtonLink>
            )}
            <ButtonLink href="/customers/new">+ 고객 등록</ButtonLink>
          </>
        }
      />
      <PipelineBoard columns={entries(CUSTOMER_STAGE_LABEL).map(([key, label]) => ({ key, label }))} cards={cards} />
    </>
  );
}
