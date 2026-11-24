import "server-only";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { customerNeeds, customers, properties, proposals, users } from "@/db/schema";
import { customerScope, type Actor } from "./authz";
import { scoreMatch, type MatchResult } from "./matching";
import { toSnapshot, type NeedsSnapshot } from "./needs";

/** 추천 목록에 보여줄 최소 점수 */
export const MIN_SCORE = 50;

const ACTIVE_PROPERTY = inArray(properties.status, ["available", "negotiating"]);
const ACTIVE_CUSTOMER = notInArray(customers.stage, ["closed", "lost"]);

const propertyCols = {
  id: properties.id,
  title: properties.title,
  propertyType: properties.propertyType,
  status: properties.status,
  region: properties.region,
  address: properties.address,
  zoning: properties.zoning,
  landAreaM2: properties.landAreaM2,
  askingPrice: properties.askingPrice,
};
export type MatchPropertyRow = { [K in keyof typeof propertyCols]: (typeof properties.$inferSelect)[K] };

type ProposalStatus = "proposed" | "interested" | "rejected";

function latestNeedsSubquery() {
  return db
    .selectDistinctOn([customerNeeds.customerId], {
      customerId: customerNeeds.customerId,
      regions: customerNeeds.regions,
      propertyTypes: customerNeeds.propertyTypes,
      purpose: customerNeeds.purpose,
      budgetMin: customerNeeds.budgetMin,
      budgetMax: customerNeeds.budgetMax,
      landAreaMinM2: customerNeeds.landAreaMinM2,
      landAreaMaxM2: customerNeeds.landAreaMaxM2,
      zonings: customerNeeds.zonings,
      notes: customerNeeds.notes,
    })
    .from(customerNeeds)
    .orderBy(customerNeeds.customerId, desc(customerNeeds.version))
    .as("ln");
}

/** 내가 볼 수 있는 진행 중 고객 + 최신 니즈 */
async function visibleCustomersWithNeeds(actor: Actor, onlyCustomerId?: string) {
  const ln = latestNeedsSubquery();
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      companyName: customers.companyName,
      stage: customers.stage,
      assigneeName: users.name,
      regions: ln.regions,
      propertyTypes: ln.propertyTypes,
      purpose: ln.purpose,
      budgetMin: ln.budgetMin,
      budgetMax: ln.budgetMax,
      landAreaMinM2: ln.landAreaMinM2,
      landAreaMaxM2: ln.landAreaMaxM2,
      zonings: ln.zonings,
      notes: ln.notes,
    })
    .from(customers)
    .innerJoin(ln, eq(ln.customerId, customers.id))
    .leftJoin(users, eq(users.id, customers.assigneeId))
    .where(and(customerScope(actor), ACTIVE_CUSTOMER, onlyCustomerId ? eq(customers.id, onlyCustomerId) : undefined));
  return rows.map((r) => ({ ...r, snapshot: toSnapshot(r) }));
}

async function proposalMap(where: ReturnType<typeof eq>) {
  const rows = await db
    .select({ customerId: proposals.customerId, propertyId: proposals.propertyId, status: proposals.status, createdAt: proposals.createdAt })
    .from(proposals)
    .where(where);
  return new Map(rows.map((r) => [`${r.customerId}:${r.propertyId}`, r]));
}

export interface PropertyMatch {
  property: MatchPropertyRow;
  result: MatchResult;
  proposal: { status: ProposalStatus; createdAt: Date } | null;
}

/** 고객 1명에게 맞는 물건 (거절한 물건 제외, 점수순) */
export async function matchesForCustomer(customerId: string, needs: NeedsSnapshot, limit = 10): Promise<PropertyMatch[]> {
  const [props, proposed] = await Promise.all([
    db.select(propertyCols).from(properties).where(ACTIVE_PROPERTY),
    proposalMap(eq(proposals.customerId, customerId)),
  ]);
  return props
    .map((property) => ({
      property,
      result: scoreMatch(needs, property),
      proposal: proposed.get(`${customerId}:${property.id}`) ?? null,
    }))
    .filter((m) => !m.result.excluded && m.result.score >= MIN_SCORE && m.proposal?.status !== "rejected")
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, limit);
}

export interface CustomerMatch {
  customer: { id: string; name: string; companyName: string | null; stage: string; assigneeName: string | null };
  result: MatchResult;
  proposal: { status: ProposalStatus; createdAt: Date } | null;
}

/** 물건 1건에 맞는 고객 (내가 볼 수 있는 고객만) */
export async function matchesForProperty(actor: Actor, property: MatchPropertyRow, limit = 20): Promise<CustomerMatch[]> {
  const [cs, proposed] = await Promise.all([
    visibleCustomersWithNeeds(actor),
    proposalMap(eq(proposals.propertyId, property.id)),
  ]);
  return cs
    .map((c) => ({
      customer: { id: c.id, name: c.name, companyName: c.companyName, stage: c.stage, assigneeName: c.assigneeName },
      result: scoreMatch(c.snapshot, property),
      proposal: proposed.get(`${c.id}:${property.id}`) ?? null,
    }))
    .filter((m) => !m.result.excluded && m.result.score >= MIN_SCORE && m.proposal?.status !== "rejected")
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, limit);
}

export interface PairMatch {
  customer: CustomerMatch["customer"];
  property: MatchPropertyRow;
  result: MatchResult;
}

/** 아직 제안하지 않은 고객×물건 조합 전체 (매칭 화면) */
export async function unproposedMatches(actor: Actor, minScore: number, limit = 200): Promise<PairMatch[]> {
  const [cs, props, done] = await Promise.all([
    visibleCustomersWithNeeds(actor),
    db.select(propertyCols).from(properties).where(ACTIVE_PROPERTY),
    db.select({ customerId: proposals.customerId, propertyId: proposals.propertyId }).from(proposals),
  ]);
  const proposedPairs = new Set(done.map((d) => `${d.customerId}:${d.propertyId}`));
  const out: PairMatch[] = [];
  for (const c of cs) {
    for (const p of props) {
      if (proposedPairs.has(`${c.id}:${p.id}`)) continue;
      const result = scoreMatch(c.snapshot, p);
      if (result.excluded || result.score < minScore) continue;
      out.push({
        customer: { id: c.id, name: c.name, companyName: c.companyName, stage: c.stage, assigneeName: c.assigneeName },
        property: p,
        result,
      });
    }
  }
  return out.sort((a, b) => b.result.score - a.result.score).slice(0, limit);
}

export async function getMatchProperty(id: string): Promise<MatchPropertyRow | null> {
  const [p] = await db.select(propertyCols).from(properties).where(eq(properties.id, id));
  return p ?? null;
}
