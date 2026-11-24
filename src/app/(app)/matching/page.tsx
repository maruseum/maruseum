import Link from "next/link";
import { proposeProperty } from "./actions";
import { Reasons, ScoreBadge } from "@/components/match-list";
import { Empty, PageHeader, Table, Td } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { formatArea, formatManwon } from "@/lib/format";
import { CUSTOMER_STAGE_LABEL } from "@/lib/labels";
import { unproposedMatches } from "@/lib/match-queries";
import { WEIGHTS } from "@/lib/matching";

const LEVELS = [
  ["85", "85점 이상"],
  ["70", "70점 이상"],
  ["50", "50점 이상"],
] as const;

export default async function MatchingPage({ searchParams }: PageProps<"/matching">) {
  const user = await requireUser();
  const sp = await searchParams;
  const min = LEVELS.some(([v]) => v === sp.min) ? Number(sp.min) : 70;
  const pairs = await unproposedMatches(user, min);

  return (
    <>
      <PageHeader
        title="매칭"
        description={`아직 제안하지 않은 고객 × 물건 조합 ${pairs.length}건 (진행 중 고객·물건, 내가 볼 수 있는 고객 기준)`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {LEVELS.map(([v, label]) => (
          <Link
            key={v}
            href={`/matching?min=${v}`}
            className={`rounded-full px-3 py-1 ${String(min) === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {label}
          </Link>
        ))}
        <span className="text-xs text-slate-500">
          배점: 지역 {WEIGHTS.region} · 예산 {WEIGHTS.budget} · 종류 {WEIGHTS.type} · 면적 {WEIGHTS.area} · 용도지역 {WEIGHTS.zoning} (고객이 입력한 항목만 계산, 종류·지역 불일치와 예산 20% 초과는 제외)
        </span>
      </div>

      {pairs.length === 0 ? (
        <Empty>조건에 맞는 새 조합이 없습니다. 고객 니즈를 입력하거나 기준 점수를 낮춰 보세요.</Empty>
      ) : (
        <Table head={["점수", "고객", "물건", "맞는 점 / 확인할 점", ""]}>
          {pairs.map(({ customer: c, property: p, result }) => (
            <tr key={`${c.id}:${p.id}`} className="align-top">
              <Td><ScoreBadge score={result.score} /></Td>
              <Td>
                <Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                <div className="text-xs text-slate-500">
                  {CUSTOMER_STAGE_LABEL[c.stage as keyof typeof CUSTOMER_STAGE_LABEL]} · {c.assigneeName ?? "미지정"}
                </div>
              </Td>
              <Td>
                <Link href={`/properties/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                <div className="text-xs text-slate-500">{formatArea(p.landAreaM2)} · {formatManwon(p.askingPrice)}</div>
              </Td>
              <Td className="whitespace-normal"><Reasons result={result} /></Td>
              <Td>
                <form action={proposeProperty}>
                  <input type="hidden" name="customerId" value={c.id} />
                  <input type="hidden" name="propertyId" value={p.id} />
                  <button className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">제안 기록</button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
