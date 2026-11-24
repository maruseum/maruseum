import { describe, expect, it } from "vitest";
import { parseCallFileName } from "@/lib/calls/filename";
import { buildUserMessage, dueDateToDate, mergeNeedsChange } from "@/lib/calls/prompt";
import type { NeedsChange } from "@/lib/calls/summary-schema";
import type { NeedsSnapshot } from "@/lib/needs";

describe("갤럭시 통화 녹음 파일명", () => {
  it("이름 + YYMMDD_HHMMSS", () => {
    const p = parseCallFileName("통화 녹음 홍길동_231124_143012.m4a");
    expect(p).toMatchObject({ contact: "홍길동", name: "홍길동", phone: null });
    expect(p.recordedAt?.toISOString()).toBe("2023-11-24T05:30:12.000Z"); // 서울 14:30
  });

  it("번호 + 영문 접두어", () => {
    const p = parseCallFileName("Call recording 010-1234-5678_241005_090501.m4a");
    expect(p).toMatchObject({ phone: "010-1234-5678", name: null });
    expect(p.recordedAt?.toISOString()).toBe("2024-10-05T00:05:01.000Z");
  });

  it("예전 형식: 붙여 쓴 번호 + YYYYMMDDHHMMSS", () => {
    const p = parseCallFileName("통화녹음 01098765432_20220315101500.amr");
    expect(p.phone).toBe("010-9876-5432");
    expect(p.recordedAt?.toISOString()).toBe("2022-03-15T01:15:00.000Z");
  });

  it("국가번호(+82)·띄어쓴 이름·접두어 없음", () => {
    expect(parseCallFileName("+82 10-1111-2222_231124_143012.m4a").phone).toBe("010-1111-2222");
    expect(parseCallFileName("김 대표 (한빛)_231124_143012.m4a").name).toBe("김 대표 (한빛)");
  });

  it("규칙에 안 맞으면 시각은 null, 이름은 그대로", () => {
    expect(parseCallFileName("회의 녹음.m4a")).toEqual({ contact: "회의 녹음", phone: null, name: "회의 녹음", recordedAt: null });
    expect(parseCallFileName("통화 녹음 홍길동_231399_143012.m4a").recordedAt).toBeNull(); // 13월
  });
});

const current: NeedsSnapshot = {
  regions: ["경기 평택", "충남 아산"],
  propertyTypes: ["land"],
  purpose: "공장 이전",
  budgetMin: null,
  budgetMax: 600000,
  landAreaMinM2: 6611.57,
  landAreaMaxM2: null,
  zonings: ["일반공업지역"],
  notes: "4차선 접도",
};

const change: NeedsChange = {
  regions: ["경기 평택", "경기 안성"],
  propertyTypes: null,
  purpose: null,
  budgetMinManwon: null,
  budgetMaxManwon: 550000,
  landAreaMinPyeong: null,
  landAreaMaxPyeong: 3000,
  zonings: null,
  notes: "고압 전력 인입 필수",
  evidence: "예산이 55억으로 줄었어요",
};

describe("니즈 변경 제안 합치기", () => {
  it("제안된 항목만 바꾸고 나머지는 유지, 평 → ㎡, 기타 조건은 덧붙임", () => {
    expect(mergeNeedsChange(current, change)).toEqual({
      ...current,
      regions: ["경기 평택", "경기 안성"],
      budgetMax: 550000,
      landAreaMaxM2: 9917.36,
      notes: "4차선 접도 / 고압 전력 인입 필수",
    });
  });

  it("등록된 니즈가 없으면 제안만으로 만듦", () => {
    const n = mergeNeedsChange(null, change);
    expect(n.regions).toEqual(["경기 평택", "경기 안성"]);
    expect(n.budgetMin).toBeNull();
    expect(n.notes).toBe("고압 전력 인입 필수");
  });

  it("같은 기타 조건은 중복으로 붙이지 않음", () => {
    expect(mergeNeedsChange({ ...current, notes: "고압 전력 인입 필수" }, change).notes).toBe("고압 전력 인입 필수");
  });
});

describe("요약 요청 구성", () => {
  it("통화 날짜(요일)·고객·현재 니즈·녹취록을 담는다", () => {
    const msg = buildUserMessage("고객: 55억까지요", {
      recordedAt: new Date("2026-11-24T05:30:00Z"),
      customerName: "정○○",
      companyName: "대성정밀",
      currentNeeds: current,
    });
    expect(msg).toContain("2026. 11. 24. (화)");
    expect(msg).toContain("정○○ (대성정밀)");
    expect(msg).toContain("예산: 60억원 이하");
    expect(msg).toContain("<transcript>\n고객: 55억까지요\n</transcript>");
  });

  it("날짜 문자열 → 서울 오전 9시", () => {
    expect(dueDateToDate("2026-11-28")?.toISOString()).toBe("2026-11-28T00:00:00.000Z");
    expect(dueDateToDate("다음주")).toBeNull();
    expect(dueDateToDate(null)).toBeNull();
  });
});
