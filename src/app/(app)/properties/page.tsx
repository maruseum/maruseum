import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { properties, users } from "@/db/schema";
import { Badge, ButtonLink, Empty, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { formatArea, formatManwon, pricePerPyeong } from "@/lib/format";
import { entries, PROPERTY_STATUS_COLOR, PROPERTY_STATUS_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/labels";

type Status = keyof typeof PROPERTY_STATUS_LABEL;
type PType = keyof typeof PROPERTY_TYPE_LABEL;

export default async function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && sp.status in PROPERTY_STATUS_LABEL ? (sp.status as Status) : null;
  const type = typeof sp.type === "string" && sp.type in PROPERTY_TYPE_LABEL ? (sp.type as PType) : null;

  const filters: (SQL | undefined)[] = [];
  if (q) {
    const like = `%${q}%`;
    filters.push(
      or(ilike(properties.title, like), ilike(properties.address, like), ilike(properties.region, like), ilike(properties.zoning, like)),
    );
  }
  if (status) filters.push(eq(properties.status, status));
  if (type) filters.push(eq(properties.propertyType, type));

  const rows = await db
    .select({ p: properties, assigneeName: users.name })
    .from(properties)
    .leftJoin(users, eq(users.id, properties.assigneeId))
    .where(and(...filters))
    .orderBy(desc(properties.updatedAt))
    .limit(300);

  return (
    <>
      <PageHeader
        title="물건"
        description={`${rows.length}건`}
        actions={<ButtonLink href="/properties/new">+ 물건 등록</ButtonLink>}
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/properties">
        <input name="q" defaultValue={q} placeholder="물건명·주소·지역·용도지역" className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select name="type" defaultValue={type ?? ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">종류 전체</option>
          {entries(PROPERTY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">상태 전체</option>
          {entries(PROPERTY_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">검색</button>
      </form>

      {rows.length === 0 ? (
        <Empty>조건에 맞는 물건이 없습니다.</Empty>
      ) : (
        <Table head={["물건명", "종류", "지역", "용도지역", "토지면적", "희망가", "평당가", "상태", "담당"]}>
          {rows.map(({ p, assigneeName }) => {
            const ppp = pricePerPyeong(p.askingPrice, p.landAreaM2);
            return (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/properties/${p.id}`} className="font-medium text-slate-900 hover:underline">{p.title}</Link>
                  <div className="text-xs text-slate-500">{p.address}</div>
                </Td>
                <Td>{PROPERTY_TYPE_LABEL[p.propertyType]}</Td>
                <Td>{p.region ?? "—"}</Td>
                <Td>{p.zoning ?? "—"}</Td>
                <Td>{formatArea(p.landAreaM2)}</Td>
                <Td>{formatManwon(p.askingPrice)}</Td>
                <Td>{ppp ? `${formatManwon(ppp)}/평` : "—"}</Td>
                <Td><Badge color={PROPERTY_STATUS_COLOR[p.status]}>{PROPERTY_STATUS_LABEL[p.status]}</Badge></Td>
                <Td>{assigneeName ?? "—"}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
