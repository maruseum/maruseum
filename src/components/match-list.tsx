import Link from "next/link";
import { proposeProperty, setProposalStatus } from "@/app/(app)/matching/actions";
import { formatArea, formatDate, formatManwon } from "@/lib/format";
import { CUSTOMER_STAGE_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/labels";
import type { CustomerMatch, PropertyMatch } from "@/lib/match-queries";
import type { MatchResult } from "@/lib/matching";
import { Badge, Empty } from "./ui";

export function ScoreBadge({ score }: { score: number }) {
  const color = score >= 85 ? "green" : score >= 70 ? "blue" : "amber";
  return <Badge color={color}>{score}점</Badge>;
}

export function Reasons({ result }: { result: MatchResult }) {
  return (
    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
      {result.reasons.map((r) => (
        <span key={r} className="text-emerald-700">✓ {r}</span>
      ))}
      {result.warnings.map((w) => (
        <span key={w} className="text-amber-700">△ {w}</span>
      ))}
    </p>
  );
}

const PROPOSAL_LABEL = { proposed: "제안함", interested: "관심", rejected: "거절" } as const;

function ProposalControls({
  customerId,
  propertyId,
  proposal,
}: {
  customerId: string;
  propertyId: string;
  proposal: { status: keyof typeof PROPOSAL_LABEL; createdAt: Date } | null;
}) {
  const hidden = (
    <>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="propertyId" value={propertyId} />
    </>
  );
  if (!proposal) {
    return (
      <form action={proposeProperty}>
        {hidden}
        <button className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">제안 기록</button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <Badge color={proposal.status === "interested" ? "green" : "slate"}>
        {PROPOSAL_LABEL[proposal.status]} · {formatDate(proposal.createdAt)}
      </Badge>
      {proposal.status !== "interested" && (
        <form action={setProposalStatus}>
          {hidden}
          <input type="hidden" name="status" value="interested" />
          <button className="rounded border border-emerald-300 px-2 py-0.5 text-emerald-700 hover:bg-emerald-50">관심</button>
        </form>
      )}
      <form action={setProposalStatus}>
        {hidden}
        <input type="hidden" name="status" value="rejected" />
        <button className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50">거절</button>
      </form>
    </div>
  );
}

/** 고객 상세: 이 고객에게 맞는 물건 */
export function PropertyMatchList({ customerId, matches }: { customerId: string; matches: PropertyMatch[] }) {
  if (matches.length === 0) return <Empty>니즈에 맞는 진행 중 물건이 없습니다.</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {matches.map(({ property: p, result, proposal }) => (
        <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <ScoreBadge score={result.score} />{" "}
              <Link href={`/properties/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {PROPERTY_TYPE_LABEL[p.propertyType]} · {p.region ?? p.address} · {formatArea(p.landAreaM2)} · {formatManwon(p.askingPrice)}
            </p>
            <Reasons result={result} />
          </div>
          <ProposalControls customerId={customerId} propertyId={p.id} proposal={proposal} />
        </li>
      ))}
    </ul>
  );
}

/** 물건 상세: 이 물건에 맞는 고객 */
export function CustomerMatchList({ propertyId, matches }: { propertyId: string; matches: CustomerMatch[] }) {
  if (matches.length === 0) return <Empty>이 물건에 맞는 진행 중 고객이 없습니다 (내가 볼 수 있는 고객 기준).</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {matches.map(({ customer: c, result, proposal }) => (
        <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <ScoreBadge score={result.score} />{" "}
              <Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
              {c.companyName && <span className="ml-1 text-xs text-slate-500">{c.companyName}</span>}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {CUSTOMER_STAGE_LABEL[c.stage as keyof typeof CUSTOMER_STAGE_LABEL]} · 담당 {c.assigneeName ?? "미지정"}
            </p>
            <Reasons result={result} />
          </div>
          <ProposalControls customerId={c.id} propertyId={propertyId} proposal={proposal} />
        </li>
      ))}
    </ul>
  );
}
