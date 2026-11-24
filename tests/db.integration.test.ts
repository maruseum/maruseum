import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { customerNeeds, customers, interactions, properties, proposals, recordings, tasks, teams, users } from "@/db/schema";
import { parseCallFileName } from "@/lib/calls/filename";
import { applyToCustomer, processRecording } from "@/lib/calls/process";
import { findCustomerForCall } from "@/lib/calls/queries";
import { canViewCustomer, customerScope, type Actor } from "@/lib/authz";
import { commitImport, previewImport } from "@/lib/import/preview";
import { matchesForCustomer, matchesForProperty } from "@/lib/match-queries";
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

  it("엑셀 가져오기: 기존·파일 내 중복을 찾고, 중복은 건너뛰고 저장", async () => {
    await db.insert(customers).values({ name: "기존고객", phone: "010-1111-2222", assigneeId: actors.agentA.id });
    const staff = [{ id: actors.agentA.id, name: "a" }];
    const input = {
      kind: "customers" as const,
      headers: ["이름", "연락처", "희망지역", "예산"],
      rows: [
        ["새고객1", "01011112222", "경기 화성", "30억~50억"], // DB 중복 (연락처)
        ["새고객2", "010-3333-4444", "경기 평택", "40억"],
        ["새고객3", "010 3333 4444", "", ""], // 파일 내 중복
        ["", "010-5555-6666", "", ""], // 오류: 이름 없음
      ],
      headerRow: 1,
      mapping: { name: 0, phone: 1, regions: 2, budget: 3 },
    };
    const p = await previewImport(actors.agentA, staff, input);
    expect(p.total).toBe(4);
    expect(p.errors.map((e) => e.row)).toEqual([5]);
    expect(p.duplicates.map((d) => [d.row, d.reason])).toEqual([
      [2, "같은 연락처의 고객이 이미 있습니다"],
      [4, "3행과 연락처가 같습니다"],
    ]);
    expect(p.ready).toBe(1);

    const res = await commitImport(actors.agentA, staff, input, true);
    expect(res).toEqual({ inserted: 1, skippedDuplicates: 2, errorRows: 1 });

    const [c] = await db.select().from(customers).where(eq(customers.name, "새고객2"));
    expect(c.assigneeId).toBe(actors.agentA.id); // 직원은 본인 담당으로 고정
    const needs = await db.select().from(customerNeeds).where(eq(customerNeeds.customerId, c.id));
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({ version: 1, source: "import", regions: ["경기 평택"], budgetMax: 400000 });
  });

  it("물건 가져오기: 공백만 다른 지번 주소는 중복", async () => {
    await db.insert(properties).values({ title: "기존", propertyType: "land", address: "경기도 화성시 장안면 ○○리 1" });
    const input = {
      kind: "properties" as const,
      headers: ["주소", "희망가"],
      rows: [["경기도 화성시  장안면 ○○리 1", "45억"], ["경기도 평택시 포승읍 ○○리 2", "52억"]],
      headerRow: 1,
      mapping: { address: 0, askingPrice: 1 },
    };
    const res = await commitImport(actors.admin, [], input, true);
    expect(res).toEqual({ inserted: 1, skippedDuplicates: 1, errorRows: 0 });
    const [p] = await db.select().from(properties).where(eq(properties.address, "경기도 평택시 포승읍 ○○리 2"));
    expect(p).toMatchObject({ region: "경기 평택시", askingPrice: 520000, createdBy: actors.admin.id });
  });

  it("매칭: 맞는 물건을 점수순으로, 거절한 물건은 제외", async () => {
    const [c] = await db.select().from(customers).where(eq(customers.name, "새고객2")); // 니즈: 경기 평택, 40억 이하
    const needs = { ...empty, regions: ["경기 평택"], budgetMax: 400000 };
    const [cheap] = await db
      .insert(properties)
      .values({ title: "평택 싼 물건", propertyType: "land", address: "경기도 평택시 ○○리 3", region: "경기 평택시", askingPrice: 350000 })
      .returning();

    let matches = await matchesForCustomer(c.id, needs);
    // 52억 물건은 예산 30% 초과로 제외, 35억 물건만
    expect(matches.map((m) => [m.property.title, m.result.score])).toEqual([["평택 싼 물건", 100]]);

    await db.insert(proposals).values({ customerId: c.id, propertyId: cheap.id, status: "rejected" });
    matches = await matchesForCustomer(c.id, needs);
    expect(matches).toHaveLength(0);

    // 물건 쪽에서 보면: 직원B 는 직원A 고객을 볼 수 없음
    const fromB = await matchesForProperty(actors.agentB, { ...cheap });
    expect(fromB.find((m) => m.customer.id === c.id)).toBeUndefined();
  });

  it("통화 녹음: 파일명으로 고객 자동 연결 → 인식·요약 → 상담 기록·할 일 (한 번만)", async () => {
    process.env.STT_PROVIDER = "mock";
    process.env.SUMMARY_PROVIDER = "mock";
    const dir = await mkdtemp(path.join(tmpdir(), "maru-rec-"));
    process.env.RECORDINGS_DIR = dir;
    // ffmpeg 로 1초짜리 m4a 생성
    await promisify(execFile)("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "aac", path.join(dir, "t.m4a")]);

    const [c] = await db
      .insert(customers)
      .values({ name: "녹음고객", phone: "010-2468-1357", assigneeId: actors.agentA.id, lastContactedAt: null })
      .returning();

    // 번호로 연결 (내 담당 고객만)
    const byPhone = parseCallFileName("통화 녹음 01024681357_241120_101500.m4a");
    expect(await findCustomerForCall(actors.agentA, byPhone)).toBe(c.id);
    expect(await findCustomerForCall(actors.agentB, byPhone)).toBeNull(); // 다른 팀 직원은 연결 안 됨
    expect(await findCustomerForCall(actors.agentA, parseCallFileName("통화 녹음 녹음 고객_241120_101500.m4a"))).toBe(c.id);

    const [rec] = await db
      .insert(recordings)
      .values({
        uploadedBy: actors.agentA.id,
        customerId: c.id,
        fileName: "통화 녹음 01024681357_241120_101500.m4a",
        storageKey: "t.m4a",
        sizeBytes: 1000,
        recordedAt: byPhone.recordedAt,
      })
      .returning();

    await processRecording(rec.id);
    const [done] = await db.select().from(recordings).where(eq(recordings.id, rec.id));
    expect(done.status).toBe("done");
    expect(done.durationSec).toBe(1);
    expect(done.transcript).toContain("평택 포승");
    expect(done.interactionId).not.toBeNull();

    const [it] = await db.select().from(interactions).where(eq(interactions.id, done.interactionId!));
    expect(it).toMatchObject({ kind: "call", customerId: c.id, title: "평택 포승 부지 예산 부담, 다음 주 화요일 임장 약속" });
    expect(it.occurredAt.toISOString()).toBe(byPhone.recordedAt!.toISOString());
    const made = await db.select().from(tasks).where(eq(tasks.customerId, c.id));
    expect(made.map((t) => t.title).sort()).toEqual(["포승 부지 임장 (오후 2시)", "포승 부지 토지이용계획확인원·전력 인입 가능 여부 보내기"]);
    expect(made.every((t) => t.assigneeId === actors.agentA.id)).toBe(true);
    const [after] = await db.select().from(customers).where(eq(customers.id, c.id));
    expect(after.lastContactedAt?.toISOString()).toBe(byPhone.recordedAt!.toISOString());

    // 다시 반영해도, 다시 처리해도 중복 생성 없음
    expect(await applyToCustomer(rec.id)).toBe(false);
    await processRecording(rec.id); // done 상태라 처리권을 얻지 못함
    expect(await db.select().from(tasks).where(eq(tasks.customerId, c.id))).toHaveLength(2);
    expect(await db.select().from(interactions).where(eq(interactions.customerId, c.id))).toHaveLength(1);
  });

  it("통화 녹음: 음성 파일이 없으면 실패 상태와 안내 문구", async () => {
    const [rec] = await db
      .insert(recordings)
      .values({ uploadedBy: actors.agentA.id, fileName: "x.m4a", storageKey: null, sizeBytes: 1 })
      .returning();
    await processRecording(rec.id);
    const [r] = await db.select().from(recordings).where(eq(recordings.id, rec.id));
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/음성 파일이 삭제/);
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
