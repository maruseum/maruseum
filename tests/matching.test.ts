import { describe, expect, it } from "vitest";
import { scoreMatch, type MatchProperty } from "@/lib/matching";
import type { NeedsSnapshot } from "@/lib/needs";
import { regionFromAddress, regionMatches } from "@/lib/region";

describe("지역", () => {
  it("시도 약칭·시군구 접미사를 무시하고 비교", () => {
    expect(regionMatches("경기 화성", "경기도 화성시 장안면 ○○리 1")).toBe(true);
    expect(regionMatches("충남 천안", "충청남도 천안시 서북구")).toBe(true);
    expect(regionMatches("화성", "경기 화성시")).toBe(true);
    expect(regionMatches("서울 성동구", "서울특별시 성동구 성수동2가")).toBe(true);
    expect(regionMatches("용인 처인구", "경기도 용인시 처인구 원삼면")).toBe(true);
  });
  it("다른 지역은 불일치", () => {
    expect(regionMatches("경기 평택", "경기도 화성시 장안면")).toBe(false);
    expect(regionMatches("충북 청주", "충청남도 천안시")).toBe(false);
    expect(regionMatches("", "경기도 화성시")).toBe(false);
  });
  it("주소에서 시도 시군구 추출", () => {
    expect(regionFromAddress("경기도 화성시 장안면 ○○리 100-1")).toBe("경기 화성시");
    expect(regionFromAddress("서울특별시 성동구 성수동2가 1")).toBe("서울 성동구");
    expect(regionFromAddress("세종특별자치시 연기면 1")).toBe("세종");
    expect(regionFromAddress("화성시 장안면")).toBeNull();
  });
});

const needs: NeedsSnapshot = {
  regions: ["경기 화성", "경기 평택"],
  propertyTypes: ["land"],
  purpose: "물류창고",
  budgetMin: 300000,
  budgetMax: 500000,
  landAreaMinM2: 6000,
  landAreaMaxM2: null,
  zonings: ["계획관리지역"],
  notes: null,
};

const prop: MatchProperty = {
  propertyType: "land",
  region: "경기 화성시",
  address: "경기도 화성시 장안면 ○○리 100-1",
  zoning: "계획관리지역",
  landAreaM2: 9917,
  askingPrice: 450000,
};

describe("scoreMatch", () => {
  it("모든 조건이 맞으면 100점", () => {
    const r = scoreMatch(needs, prop);
    expect(r.excluded).toBeNull();
    expect(r.score).toBe(100);
    expect(r.reasons).toContain("지역 경기 화성");
  });

  it("종류가 다르면 제외", () => {
    expect(scoreMatch(needs, { ...prop, propertyType: "building" }).excluded).toMatch(/종류/);
  });

  it("희망 지역 밖이면 제외", () => {
    expect(scoreMatch(needs, { ...prop, region: "충남 천안시", address: "충청남도 천안시" }).excluded).toBe("희망 지역 밖");
  });

  it("예산 10% 이내 초과는 감점, 20% 넘으면 제외", () => {
    const slightly = scoreMatch(needs, { ...prop, askingPrice: 540000 });
    expect(slightly.excluded).toBeNull();
    expect(slightly.score).toBeLessThan(100);
    expect(slightly.warnings[0]).toMatch(/예산 8% 초과/);
    expect(scoreMatch(needs, { ...prop, askingPrice: 620000 }).excluded).toMatch(/예산 24% 초과/);
  });

  it("희망가 미정·면적 미입력은 절반 점수", () => {
    const r = scoreMatch(needs, { ...prop, askingPrice: null, landAreaM2: null });
    // 지역30 + 종류20 + 예산12.5 + 면적7.5 + 용도10 = 80
    expect(r.score).toBe(80);
    expect(r.warnings).toEqual(["희망가 미정", "면적 미입력"]);
  });

  it("고객이 입력한 조건만으로 계산", () => {
    const onlyRegion: NeedsSnapshot = { ...needs, propertyTypes: [], budgetMin: null, budgetMax: null, landAreaMinM2: null, zonings: [] };
    expect(scoreMatch(onlyRegion, { ...prop, askingPrice: 9_999_999 }).score).toBe(100);
  });

  it("니즈가 비어 있으면 제외", () => {
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
    expect(scoreMatch(empty, prop).excluded).toBe("니즈 미입력");
  });

  it("용도지역은 띄어쓰기 무시", () => {
    expect(scoreMatch(needs, { ...prop, zoning: "계획 관리 지역" }).score).toBe(100);
  });
});
