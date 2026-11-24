import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { customers, interactions, properties, tasks, users } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { TaskList } from "@/components/task-list";
import { Badge, ButtonLink, Card, DescList, Empty, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { canEditProperty, customerScope } from "@/lib/authz";
import { formatArea, formatDate, formatDateTime, formatManwon, pricePerPyeong } from "@/lib/format";
import { INTERACTION_KIND_LABEL, PROPERTY_STATUS_COLOR, PROPERTY_STATUS_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/labels";
import { listStaff, staffOptions } from "@/lib/queries";
import { createTask } from "../../tasks/actions";

export default async function PropertyDetailPage({ params }: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const assignee = alias(users, "assignee");
  const [row] = await db
    .select({ p: properties, assigneeName: assignee.name })
    .from(properties)
    .leftJoin(assignee, eq(assignee.id, properties.assigneeId))
    .where(eq(properties.id, id));
  if (!row) notFound();
  const p = row.p;

  const [log, taskRows, staff] = await Promise.all([
    // 이 물건이 언급된 상담 기록 (내가 볼 수 있는 고객 것만)
    db
      .select({ i: interactions, customerName: customers.name, userName: users.name })
      .from(interactions)
      .innerJoin(customers, eq(customers.id, interactions.customerId))
      .leftJoin(users, eq(users.id, interactions.userId))
      .where(and(eq(interactions.propertyId, id), customerScope(user)))
      .orderBy(desc(interactions.occurredAt))
      .limit(50),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        dueAt: tasks.dueAt,
        status: tasks.status,
        assigneeName: users.name,
      })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(sql`${tasks.propertyId} = ${id} and ${tasks.status} <> 'canceled'`)
      .orderBy(asc(tasks.status), sql`${tasks.dueAt} asc nulls last`),
    listStaff(),
  ]);

  const editable = canEditProperty(user, p);
  const ppp = pricePerPyeong(p.askingPrice, p.landAreaM2);

  return (
    <>
      <PageHeader
        title={p.title}
        description={
          <span className="flex items-center gap-2">
            <Badge color={PROPERTY_STATUS_COLOR[p.status]}>{PROPERTY_STATUS_LABEL[p.status]}</Badge>
            {PROPERTY_TYPE_LABEL[p.propertyType]} · 담당 {row.assigneeName ?? "미지정"}
          </span>
        }
        actions={editable && <ButtonLink href={`/properties/${id}/edit`} variant="secondary">수정</ButtonLink>}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="물건 정보">
            <DescList
              items={[
                ["지번 주소", p.address],
                ["도로명 주소", p.roadAddress ?? "—"],
                ["지역", p.region ?? "—"],
                ["지목", p.landCategory ?? "—"],
                ["용도지역", p.zoning ?? "—"],
                ["토지면적", formatArea(p.landAreaM2)],
                ["건물 연면적", formatArea(p.buildingAreaM2)],
                ["희망가", formatManwon(p.askingPrice)],
                ["평당가 (토지 기준)", ppp ? `${formatManwon(ppp)}/평` : "—"],
                ["소유자", p.ownerName ?? "—"],
                ["소유자 연락처", p.ownerPhone ? <a href={`tel:${p.ownerPhone}`} className="underline">{p.ownerPhone}</a> : "—"],
                ["등록일 / 수정일", `${formatDate(p.createdAt)} / ${formatDate(p.updatedAt)}`],
              ]}
            />
            {p.description && <p className="mt-4 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-700">{p.description}</p>}
          </Card>

          <Card title="이 물건 관련 상담 기록">
            {log.length === 0 ? (
              <Empty>고객 상담 기록에서 이 물건을 선택하면 여기에 모입니다.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {log.map(({ i, customerName, userName }) => (
                  <li key={i.id} className="py-3">
                    <p className="text-sm">
                      <Badge>{INTERACTION_KIND_LABEL[i.kind]}</Badge>{" "}
                      <Link href={`/customers/${i.customerId}`} className="font-medium underline">{customerName}</Link> — {i.title}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(i.occurredAt)} · {userName ?? "—"}</p>
                    {i.content && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{i.content}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="할 일">
          <TaskList rows={taskRows} />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">할 일 추가</summary>
            <div className="mt-3">
              <ActionForm action={createTask.bind(null, { propertyId: id })} resetOnSuccess submitLabel="추가">
                <Field label="할 일 *">
                  <Input name="title" required placeholder="예: 등기부등본 발급" />
                </Field>
                <Field label="마감">
                  <Input name="dueAt" type="datetime-local" />
                </Field>
                <Field label="담당">
                  <Select name="assigneeId" options={staffOptions(staff)} defaultValue={user.id} />
                </Field>
              </ActionForm>
            </div>
          </details>
        </Card>
      </div>
    </>
  );
}
