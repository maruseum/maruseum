import { asc, desc, eq, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { interactions, properties, tasks, users } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { NeedsFields } from "@/components/forms";
import { PropertyMatchList } from "@/components/match-list";
import { matchesForCustomer } from "@/lib/match-queries";
import { TaskList } from "@/components/task-list";
import { Badge, ButtonLink, Card, DescList, Empty, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import {
  formatAreaRange,
  formatBudgetRange,
  formatDate,
  formatDateTime,
  toSeoulInputValue,
} from "@/lib/format";
import {
  CUSTOMER_STAGE_LABEL,
  CUSTOMER_TYPE_LABEL,
  entries,
  INTERACTION_KIND_LABEL,
  NEEDS_SOURCE_LABEL,
  PROPERTY_TYPE_LABEL,
  STAGE_COLOR,
} from "@/lib/labels";
import { diffNeeds, toSnapshot } from "@/lib/needs";
import { getCustomerFor, getNeedsHistory, listStaff, staffOptions } from "@/lib/queries";
import { createTask } from "../../tasks/actions";
import { addInteraction, updateNeeds, updateStage } from "../actions";

export default async function CustomerDetailPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const row = await getCustomerFor(user, id);
  if (!row) notFound();
  const c = row.customer;

  const [history, log, taskRows, staff, propertyOptions] = await Promise.all([
    getNeedsHistory(id),
    db
      .select({ i: interactions, userName: users.name, propertyTitle: properties.title })
      .from(interactions)
      .leftJoin(users, eq(users.id, interactions.userId))
      .leftJoin(properties, eq(properties.id, interactions.propertyId))
      .where(eq(interactions.customerId, id))
      .orderBy(desc(interactions.occurredAt))
      .limit(100),
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
      .where(sql`${tasks.customerId} = ${id} and ${tasks.status} <> 'canceled'`)
      .orderBy(asc(tasks.status), sql`${tasks.dueAt} asc nulls last`),
    listStaff(),
    db
      .select({ id: properties.id, title: properties.title })
      .from(properties)
      .where(ne(properties.status, "withdrawn"))
      .orderBy(desc(properties.updatedAt))
      .limit(200),
  ]);

  await audit({ userId: user.id, action: "view", entityType: "customer", entityId: id });

  const current = history[0]?.needs ?? null;
  const snapshots = history.map((h) => toSnapshot(h.needs));
  const matches = current ? await matchesForCustomer(id, snapshots[0]) : [];

  return (
    <>
      <PageHeader
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge color={STAGE_COLOR[c.stage]}>{CUSTOMER_STAGE_LABEL[c.stage]}</Badge>
            {CUSTOMER_TYPE_LABEL[c.customerType]}
            {c.companyName && ` · ${c.companyName}`} · 담당 {row.assigneeName ?? "미지정"}
          </span>
        }
        actions={<ButtonLink href={`/customers/${id}/edit`} variant="secondary">정보 수정</ButtonLink>}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="현재 니즈" actions={current && <span className="text-xs text-slate-500">v{current.version} · {formatDate(current.createdAt)}</span>}>
            {current ? (
              <DescList
                items={[
                  ["희망 지역", current.regions.join(", ") || "—"],
                  ["물건 종류", current.propertyTypes.map((t) => PROPERTY_TYPE_LABEL[t as keyof typeof PROPERTY_TYPE_LABEL] ?? t).join(", ") || "—"],
                  ["매입 목적", current.purpose ?? "—"],
                  ["예산", formatBudgetRange(current.budgetMin, current.budgetMax)],
                  ["토지면적", formatAreaRange(current.landAreaMinM2, current.landAreaMaxM2)],
                  ["용도지역", current.zonings.join(", ") || "—"],
                  ["기타 조건", current.notes ?? "—"],
                ]}
              />
            ) : (
              <Empty>아직 입력된 니즈가 없습니다.</Empty>
            )}
            <details className="mt-5 rounded-md border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">니즈 변경하기</summary>
              <div className="mt-4">
                <ActionForm action={updateNeeds.bind(null, id)} submitLabel="새 버전으로 저장">
                  <NeedsFields needs={current ? toSnapshot(current) : null} />
                  <Field label="변경 사유" hint="예: 3/12 통화 — 공장 증설 계획 연기로 예산 축소">
                    <Input name="reason" />
                  </Field>
                </ActionForm>
              </div>
            </details>
          </Card>

          <Card
            title="추천 물건"
            actions={<span className="text-xs text-slate-500">현재 니즈 기준 · 진행·협상 중 물건 · 거절한 물건 제외</span>}
          >
            {current ? (
              <PropertyMatchList customerId={id} matches={matches} />
            ) : (
              <Empty>니즈를 입력하면 맞는 물건을 자동으로 찾아 줍니다.</Empty>
            )}
          </Card>

          <Card title="니즈 변화 이력">
            {history.length === 0 ? (
              <Empty>이력이 없습니다.</Empty>
            ) : (
              <ol className="relative space-y-5 border-l border-slate-200 pl-5">
                {history.map((h, idx) => {
                  const changes = diffNeeds(snapshots[idx + 1] ?? null, snapshots[idx]);
                  return (
                    <li key={h.needs.id}>
                      <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-400" />
                      <p className="text-sm font-medium text-slate-900">
                        v{h.needs.version} · {formatDateTime(h.needs.createdAt)}
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          {h.changedByName ?? "알 수 없음"} · {NEEDS_SOURCE_LABEL[h.needs.source]}
                        </span>
                      </p>
                      {h.needs.reason && <p className="text-sm text-slate-600">사유: {h.needs.reason}</p>}
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {changes.map((ch) => (
                          <li key={ch.field} className="text-slate-700">
                            <span className="text-slate-500">{ch.label}:</span>{" "}
                            {ch.added || ch.removed ? (
                              <>
                                {ch.added?.map((a) => <span key={a} className="mr-1 text-emerald-700">+{a}</span>)}
                                {ch.removed?.map((r) => <span key={r} className="mr-1 text-red-600 line-through">{r}</span>)}
                              </>
                            ) : (
                              <>
                                <span className="text-slate-400 line-through">{ch.before}</span> → <span className="font-medium">{ch.after}</span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card title="상담·연락 기록">
            <details className="mb-4 rounded-md border border-slate-200 p-4" open={log.length === 0}>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">기록 추가</summary>
              <div className="mt-4">
                <ActionForm action={addInteraction.bind(null, id)} resetOnSuccess submitLabel="기록">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field label="종류">
                      <Select name="kind" options={entries(INTERACTION_KIND_LABEL)} defaultValue="call" />
                    </Field>
                    <Field label="일시">
                      <Input name="occurredAt" type="datetime-local" defaultValue={toSeoulInputValue(new Date())} />
                    </Field>
                    <Field label="관련 물건">
                      <Select name="propertyId" options={propertyOptions.map((p) => [p.id, p.title])} placeholder="없음" />
                    </Field>
                  </div>
                  <Field label="제목 *">
                    <Input name="title" required placeholder="예: 화성 장안면 물건 제안, 가격 조정 요청" />
                  </Field>
                  <Field label="내용">
                    <Textarea name="content" rows={4} />
                  </Field>
                </ActionForm>
              </div>
            </details>
            {log.length === 0 ? (
              <Empty>기록이 없습니다.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {log.map(({ i, userName, propertyTitle }) => (
                  <li key={i.id} className="py-3">
                    <p className="text-sm text-slate-900">
                      <Badge>{INTERACTION_KIND_LABEL[i.kind]}</Badge> <span className="font-medium">{i.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateTime(i.occurredAt)} · {userName ?? "알 수 없음"}
                      {propertyTitle && i.propertyId && (
                        <>
                          {" · "}
                          <Link href={`/properties/${i.propertyId}`} className="underline">{propertyTitle}</Link>
                        </>
                      )}
                    </p>
                    {i.content && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{i.content}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="진행 단계">
            <ActionForm action={updateStage.bind(null, id)} submitLabel="변경" className="flex flex-wrap items-center gap-2">
              <Select name="stage" options={entries(CUSTOMER_STAGE_LABEL)} defaultValue={c.stage} className="w-auto" />
            </ActionForm>
          </Card>

          <Card title="기본 정보">
            <DescList
              items={[
                ["연락처", c.phone ? <a href={`tel:${c.phone}`} className="underline">{c.phone}</a> : "—"],
                ["이메일", c.email ?? "—"],
                ["유입 경로", c.source ?? "—"],
                ["최근 연락", formatDateTime(c.lastContactedAt)],
                ["등록일", formatDate(c.createdAt)],
              ]}
            />
            {c.memo && <p className="mt-4 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-700">{c.memo}</p>}
          </Card>

          <Card title="할 일">
            <TaskList rows={taskRows} />
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">할 일 추가</summary>
              <div className="mt-3">
                <ActionForm action={createTask.bind(null, { customerId: id })} resetOnSuccess submitLabel="추가">
                  <Field label="할 일 *">
                    <Input name="title" required placeholder="예: 토지이용계획확인원 보내기" />
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
      </div>
    </>
  );
}
