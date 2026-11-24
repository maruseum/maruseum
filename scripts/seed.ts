/**
 * 데모용 합성 데이터를 넣습니다. 실제 고객·소유자 정보가 아닙니다.
 * 실행: npm run db:seed   (이미 관리자 계정이 있으면 아무것도 하지 않습니다)
 */
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { customerNeeds, customers, interactions, properties, tasks, teams, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";

const DEMO_PASSWORD = "maru1234!";
const day = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * day);
const later = (d: number) => new Date(Date.now() + d * day);

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, "admin@maru.local"));
  if (existing) {
    console.log("이미 시드 데이터가 있습니다. 건너뜁니다.");
    return;
  }

  const hash = await hashPassword(DEMO_PASSWORD);
  const [t1, t2] = await db.insert(teams).values([{ name: "영업1팀" }, { name: "영업2팀" }]).returning();
  const [admin, manager, agentA, agentB] = await db
    .insert(users)
    .values([
      { email: "admin@maru.local", name: "관리자", role: "admin", passwordHash: hash },
      { email: "manager@maru.local", name: "김팀장", role: "manager", teamId: t1.id, passwordHash: hash },
      { email: "agent1@maru.local", name: "이대리", role: "agent", teamId: t1.id, passwordHash: hash },
      { email: "agent2@maru.local", name: "박과장", role: "agent", teamId: t2.id, passwordHash: hash },
    ])
    .returning();

  const props = await db
    .insert(properties)
    .values([
      {
        title: "화성 장안면 계획관리 3,000평",
        propertyType: "land",
        status: "available",
        region: "경기 화성시",
        address: "경기도 화성시 장안면 ○○리 100-1",
        landCategory: "임야",
        zoning: "계획관리지역",
        landAreaM2: 9917.36,
        askingPrice: 450000,
        ownerName: "홍○○",
        description: "4차선 접도, 물류창고 인허가 검토 가능",
        assigneeId: agentA.id,
        createdBy: agentA.id,
      },
      {
        title: "평택 포승 일반공업 공장부지",
        propertyType: "land",
        status: "negotiating",
        region: "경기 평택시",
        address: "경기도 평택시 포승읍 ○○리 55",
        landCategory: "공장용지",
        zoning: "일반공업지역",
        landAreaM2: 6611.57,
        askingPrice: 520000,
        assigneeId: manager.id,
        createdBy: manager.id,
      },
      {
        title: "성수동 꼬마빌딩 (근생)",
        propertyType: "land_building",
        status: "available",
        region: "서울 성동구",
        address: "서울특별시 성동구 성수동2가 ○○-3",
        landCategory: "대",
        zoning: "준공업지역",
        landAreaM2: 330.58,
        buildingAreaM2: 892.4,
        askingPrice: 980000,
        assigneeId: agentB.id,
        createdBy: agentB.id,
      },
      {
        title: "용인 처인구 자연녹지 전원주택 부지",
        propertyType: "land",
        status: "on_hold",
        region: "경기 용인시",
        address: "경기도 용인시 처인구 원삼면 ○○리 12",
        landCategory: "전",
        zoning: "자연녹지지역",
        landAreaM2: 2644.63,
        askingPrice: 120000,
        assigneeId: agentA.id,
        createdBy: agentA.id,
      },
    ])
    .returning();

  const custs = await db
    .insert(customers)
    .values([
      {
        name: "최○○",
        customerType: "corporation",
        companyName: "(주)한빛로지스",
        phone: "010-0000-1001",
        source: "기존 고객 소개",
        stage: "site_visit",
        assigneeId: agentA.id,
        lastContactedAt: ago(3),
      },
      {
        name: "정○○",
        customerType: "corporation",
        companyName: "대성정밀",
        phone: "010-0000-1002",
        source: "광고",
        stage: "proposing",
        assigneeId: manager.id,
        lastContactedAt: ago(41),
      },
      {
        name: "윤○○",
        customerType: "individual",
        phone: "010-0000-1003",
        source: "지인",
        stage: "consulting",
        assigneeId: agentB.id,
        lastContactedAt: ago(10),
      },
      {
        name: "강○○",
        customerType: "individual",
        phone: "010-0000-1004",
        source: "홈페이지 문의",
        stage: "new",
        assigneeId: null,
      },
    ])
    .returning();

  await db.insert(customerNeeds).values([
    {
      customerId: custs[0].id,
      version: 1,
      regions: ["경기 화성", "경기 평택"],
      propertyTypes: ["land"],
      purpose: "물류창고 신축",
      budgetMin: 300000,
      budgetMax: 500000,
      landAreaMinM2: 6611.57,
      zonings: ["계획관리지역"],
      reason: "최초 등록",
      changedBy: agentA.id,
      createdAt: ago(60),
    },
    {
      customerId: custs[0].id,
      version: 2,
      regions: ["경기 화성", "경기 평택", "경기 안성"],
      propertyTypes: ["land"],
      purpose: "물류창고 신축",
      budgetMin: 350000,
      budgetMax: 600000,
      landAreaMinM2: 8264.46,
      zonings: ["계획관리지역"],
      notes: "4차선 접도 필수",
      reason: "통화: 안성까지 확대, 예산 상향 가능",
      changedBy: agentA.id,
      createdAt: ago(20),
    },
    {
      customerId: custs[1].id,
      version: 1,
      regions: ["경기 평택", "충남 아산"],
      propertyTypes: ["land", "land_building"],
      purpose: "공장 이전",
      budgetMax: 600000,
      zonings: ["일반공업지역", "준공업지역"],
      reason: "최초 등록",
      changedBy: manager.id,
      createdAt: ago(70),
    },
    {
      customerId: custs[2].id,
      version: 1,
      regions: ["서울 성동구", "서울 마포구"],
      propertyTypes: ["land_building"],
      purpose: "임대 수익 + 사옥 일부 사용",
      budgetMin: 700000,
      budgetMax: 1000000,
      reason: "최초 등록",
      changedBy: agentB.id,
      createdAt: ago(15),
    },
  ]);

  await db.insert(interactions).values([
    {
      customerId: custs[0].id,
      propertyId: props[0].id,
      userId: agentA.id,
      kind: "call",
      occurredAt: ago(20),
      title: "희망 지역 확대 및 예산 조정",
      content: "안성까지 검토 가능. 예산 상한 60억까지. 4차선 접도는 필수 조건.",
    },
    {
      customerId: custs[0].id,
      propertyId: props[0].id,
      userId: agentA.id,
      kind: "site_visit",
      occurredAt: ago(3),
      title: "화성 장안면 물건 임장",
      content: "진입로 폭 확인 필요. 대표 긍정적.",
    },
    {
      customerId: custs[1].id,
      propertyId: props[1].id,
      userId: manager.id,
      kind: "meeting",
      occurredAt: ago(41),
      title: "평택 포승 부지 제안",
    },
  ]);

  await db.insert(tasks).values([
    {
      title: "화성 장안면 진입로 폭 확인 (지적도)",
      dueAt: later(1),
      assigneeId: agentA.id,
      customerId: custs[0].id,
      propertyId: props[0].id,
      createdBy: agentA.id,
    },
    {
      title: "대성정밀 재연락 — 이전 일정 확인",
      dueAt: ago(2),
      assigneeId: manager.id,
      customerId: custs[1].id,
      createdBy: manager.id,
    },
    { title: "신규 문의 고객 담당 배정", assigneeId: manager.id, customerId: custs[3].id, createdBy: admin.id },
  ]);

  console.log("시드 완료. 데모 계정 (비밀번호 모두 %s):", DEMO_PASSWORD);
  console.log("  admin@maru.local (관리자) / manager@maru.local (팀장) / agent1@maru.local, agent2@maru.local (직원)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
