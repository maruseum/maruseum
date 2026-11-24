import { describe, expect, it } from "vitest";
import { FormError } from "@/lib/form";
import { diffNeeds, isEmptyNeeds, parseNeedsForm, type NeedsSnapshot } from "@/lib/needs";

const base: NeedsSnapshot = {
  regions: ["경기 화성", "경기 평택"],
  propertyTypes: ["land"],
  purpose: "물류창고 신축",
  budgetMin: 300000,
  budgetMax: 500000,
  landAreaMinM2: 6611.57,
  landAreaMaxM2: null,
  zonings: ["계획관리지역"],
  notes: null,
};

describe("diffNeeds", () => {
  it("첫 등록이면 입력된 항목만 변경으로 잡는다", () => {
    const changes = diffNeeds(null, base);
    expect(changes.map((c) => c.field)).toEqual([
      "regions",
      "propertyTypes",
      "purpose",
      "budgetMin",
      "budgetMax",
      "landAreaMinM2",
      "zonings",
    ]);
  });

  it("같은 값이면 변경 없음 (목록 순서는 무시)", () => {
    expect(diffNeeds(base, { ...base, regions: ["경기 평택", "경기 화성"] })).toEqual([]);
  });

  it("목록은 추가·삭제 항목을 알려준다", () => {
    const [c] = diffNeeds(base, { ...base, regions: ["경기 화성", "경기 안성"] });
    expect(c.field).toBe("regions");
    expect(c.added).toEqual(["경기 안성"]);
    expect(c.removed).toEqual(["경기 평택"]);
  });

  it("금액은 억 단위로 전후를 보여준다", () => {
    const [c] = diffNeeds(base, { ...base, budgetMax: 600000 });
    expect(c).toMatchObject({ field: "budgetMax", before: "50억원", after: "60억원" });
  });

  it("공백만 다른 텍스트는 같은 값", () => {
    expect(diffNeeds(base, { ...base, purpose: " 물류창고 신축 " })).toEqual([]);
    expect(diffNeeds({ ...base, notes: "" }, base)).toEqual([]);
  });

  it("물건 종류는 한국어 라벨로 보여준다", () => {
    const [c] = diffNeeds(base, { ...base, propertyTypes: ["land", "building"] });
    expect(c.added).toEqual(["건물"]);
  });
});

describe("parseNeedsForm", () => {
  const fd = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };

  it("평 입력을 ㎡ 로 바꾸고 목록을 나눈다", () => {
    const n = parseNeedsForm(
      fd([
        ["needs_regions", "경기 화성, 평택"],
        ["needs_types", "land"],
        ["needs_types", "bogus"],
        ["needs_budgetMax", "500,000"],
        ["needs_landMin", "2000"],
        ["needs_areaUnit", "pyeong"],
      ]),
    );
    expect(n.regions).toEqual(["경기 화성", "평택"]);
    expect(n.propertyTypes).toEqual(["land"]);
    expect(n.budgetMax).toBe(500000);
    expect(n.landAreaMinM2).toBe(6611.57);
  });

  it("하한이 상한보다 크면 오류", () => {
    expect(() => parseNeedsForm(fd([["needs_budgetMin", "9"], ["needs_budgetMax", "1"]]))).toThrow(FormError);
  });

  it("음수·문자는 오류", () => {
    expect(() => parseNeedsForm(fd([["needs_budgetMin", "-1"]]))).toThrow(FormError);
    expect(() => parseNeedsForm(fd([["needs_landMax", "많이"]]))).toThrow(FormError);
  });

  it("아무것도 없으면 빈 니즈", () => {
    expect(isEmptyNeeds(parseNeedsForm(fd([])))).toBe(true);
  });
});
