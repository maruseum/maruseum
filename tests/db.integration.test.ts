import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { customerNeeds, customers, teams, users } from "@/db/schema";
import { canViewCustomer, customerScope, type Actor } from "@/lib/authz";
import { saveNeedsVersion } from "@/lib/needs-store";
import type { NeedsSnapshot } from "@/lib/needs";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

const empty: NeedsSnapshot = {
  regions: [],
  propertyTypes: [],
  purpose: null,
  budgetMin: null,
  budgetMax: null,
  landAreaMinM2: null,
  landAreaMaxM2: null,
  zonings: [],
  notes: null,
};

describe.runIf(hasDb)("DB 통합", () => {
  let actors: Record<"admin" | "manager" | "agentA" | "agentB" | "loneManager", Actor>;
  let customerIds: string[];

  beforeAll(async () => {
    const [t1, t2] = await db.insert(teams).values([{ name: "T1" }, { name: "T2" }]).returning();
    const rows = await db
      .insert(users)
      .values([
        { email: "admin@t", name: "admin", role: "admin", passwordHash: "x" },
        { email: "mgr@t", name: "mgr", role: "manager", teamId: t1.id, passwordHash: "x" },
        { email: "a@t", name: "a", role: "agent", teamId: t1.id, passwordHash: "x" },
        { email: "b@t", name: "b", role: "agent", teamId: t2.id, passwordHash: "x" },
        { email: "lone@t", name: "lone", role: "manager", teamId: null, passwordHash: "x" },
      ])
      .returning();
    const [admin, manager, agentA, agentB, loneManager] = rows.map((u) => ({ id: u.id, role: u.role, teamId: u.teamId }));
    actors = { admin, manager, agentA, agentB, loneManager };

    const cs = await db
      .insert(customers)
      .values([
        { name: "c-agentA", assigneeId: agentA.id },
        { name: "c-agentB", assigneeId: agentB.id },
        { name: "c-manager", assigneeId: manager.id },
        { name: "c-none", assigneeId: null },
      ])
      .returning();
    customerIds = cs.map((c) => c.id);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("customerScope(SQL) 결과가 canViewCustomer 규칙과 같다", async () => {
    const all = await db
      .select({ id: customers.id, assigneeId: customers.assigneeId, teamId: users.teamId })
      .from(customers)
      .leftJoin(users, eq(users.id, customers.assigneeId));

    for (const actor of Object.values(actors)) {
      const visible = await db.select({ id: customers.id }).from(customers).where(customerScope(actor));
      const expected = all.filter((c) => canViewCustomer(actor, { id: c.assigneeId, teamId: c.teamId })).map((c) => c.id);
      expect(visible.map((v) => v.id).sort()).toEqual(expected.sort());
    }
  });

  it("팀장은 팀원·본인·미지정 고객 3명을 본다", async () => {
    const visible = await db.select({ name: customers.name }).from(customers).where(customerScope(actors.manager));
    expect(visible.map((v) => v.name).sort()).toEqual(["c-agentA", "c-manager", "c-none"]);
  });

  it("니즈는 바뀔 때만 버전이 올라간다", async () => {
    const cid = customerIds[0];
    const uid = actors.agentA.id;
    const v1 = await saveNeedsVersion(uid, cid, { ...empty, regions: ["화성"], budgetMax: 500000 }, "최초");
    expect(v1.version).toBe(1);

    const same = await saveNeedsVersion(uid, cid, { ...empty, regions: ["화성"], budgetMax: 500000 }, "중복");
    expect(same.changes).toHaveLength(0);
    expect(same.version).toBe(1);

    const v2 = await saveNeedsVersion(uid, cid, { ...empty, regions: ["화성", "안성"], budgetMax: 600000 }, "확대");
    expect(v2.version).toBe(2);
    expect(v2.changes.map((c) => c.field).sort()).toEqual(["budgetMax", "regions"]);

    const rows = await db
      .select({ version: customerNeeds.version, reason: customerNeeds.reason })
      .from(customerNeeds)
      .where(eq(customerNeeds.customerId, cid))
      .orderBy(asc(customerNeeds.version));
    expect(rows).toEqual([
      { version: 1, reason: "최초" },
      { version: 2, reason: "확대" },
    ]);
  });

  it("동시에 저장해도 버전 번호가 겹치지 않는다", async () => {
    const cid = customerIds[1];
    const uid = actors.agentB.id;
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => saveNeedsVersion(uid, cid, { ...empty, budgetMax: n * 10000 }, `동시 ${n}`)),
    );
    const versions = results.map((r) => r.version).sort();
    expect(versions).toEqual([1, 2, 3, 4, 5]);
  });
});
