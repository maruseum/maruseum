import { describe, expect, it } from "vitest";
import {
  formatArea,
  formatBudgetRange,
  formatManwon,
  parseList,
  parseNumberInput,
  parseSeoulDateTime,
  pricePerPyeong,
  toSeoulInputValue,
} from "@/lib/format";

describe("formatManwon", () => {
  it("억과 만원을 나눠 표시한다", () => {
    expect(formatManwon(123450)).toBe("12억 3,450만원");
    expect(formatManwon(450000)).toBe("45억원");
    expect(formatManwon(3500)).toBe("3,500만원");
    expect(formatManwon(1_000_000)).toBe("100억원");
  });
  it("빈 값은 대시", () => {
    expect(formatManwon(null)).toBe("—");
  });
});

describe("formatBudgetRange", () => {
  it("하한·상한 조합", () => {
    expect(formatBudgetRange(300000, 500000)).toBe("30억원 ~ 50억원");
    expect(formatBudgetRange(null, 500000)).toBe("50억원 이하");
    expect(formatBudgetRange(300000, null)).toBe("30억원 이상");
    expect(formatBudgetRange(null, null)).toBe("—");
  });
});

describe("면적", () => {
  it("㎡ 와 평을 같이 보여준다", () => {
    expect(formatArea(3305.785)).toBe("3,305.8㎡ (1,000평)");
  });
  it("평당가 (만원/평)", () => {
    // 1,000평 45억 → 평당 450만원
    expect(pricePerPyeong(450000, 3305.785)).toBe(450);
    expect(pricePerPyeong(null, 100)).toBeNull();
  });
});

describe("입력 파싱", () => {
  it("숫자: 쉼표 제거, 빈 값 null", () => {
    expect(parseNumberInput("1,234")).toBe(1234);
    expect(parseNumberInput("  ")).toBeNull();
    expect(parseNumberInput("abc")).toBeNaN();
  });
  it("목록: 쉼표·줄바꿈 분리, 중복 제거", () => {
    expect(parseList("경기 화성, 평택\n평택 ,용인")).toEqual(["경기 화성", "평택", "용인"]);
  });
  it("datetime-local 은 서울 시간으로 해석", () => {
    const d = parseSeoulDateTime("2026-03-12T09:30");
    expect(d?.toISOString()).toBe("2026-03-12T00:30:00.000Z");
    expect(toSeoulInputValue(d)).toBe("2026-03-12T09:30");
    expect(parseSeoulDateTime("")).toBeNull();
  });
});
