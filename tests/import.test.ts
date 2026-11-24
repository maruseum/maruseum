import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { CUSTOMER_FIELDS, PROPERTY_FIELDS, suggestMapping } from "@/lib/import/fields";
import { readTable, ReadError } from "@/lib/import/read-file";
import { buildCustomerRecords, buildPropertyRecords, missingRequired } from "@/lib/import/validate";
import {
  CUSTOMER_STAGE_WORDS,
  formatPhone,
  matchCode,
  parseArea,
  parseMoney,
  parseRange,
  PROPERTY_TYPE_WORDS,
  splitList,
} from "@/lib/import/values";

describe("금액 (만원)", () => {
  it.each([
    ["45억", 450000],
    ["3억5천", 35000],
    ["3억 5,000만원", 35000],
    ["4500만", 4500],
    ["4,500만원", 4500],
    ["1.5억", 15000],
    ["450,000", 450000],
    ["4,500,000,000", 450000],
    ["4500000000원", 450000],
  ])("%s → %d", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });
  it("헤더 단위 힌트", () => {
    expect(parseMoney("45", "eok")).toBe(450000);
    expect(parseMoney("350000000", "won")).toBe(35000);
  });
  it("빈 값 null, 이상한 값 NaN", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("-")).toBeNull();
    expect(parseMoney("협의")).toBeNaN();
  });
});

describe("범위", () => {
  const money = (s: string) => parseMoney(s);
  it("다양한 범위 표현", () => {
    expect(parseRange("30억~50억", money)).toEqual({ min: 300000, max: 500000 });
    expect(parseRange("30-50억", money)).toEqual({ min: 300000, max: 500000 });
    expect(parseRange("50억 이하", money)).toEqual({ min: null, max: 500000 });
    expect(parseRange("30억 이상", money)).toEqual({ min: 300000, max: null });
    expect(parseRange("40억", money)).toEqual({ min: null, max: 400000 });
    expect(parseRange("", money)).toBeNull();
  });
  it("면적 범위 (평 → ㎡)", () => {
    const r = parseRange("2000~3000평", (s) => parseArea(s, "m2"));
    expect(r).toEqual({ min: 6611.57, max: 9917.36 });
  });
});

describe("면적·목록·코드·연락처", () => {
  it("면적 단위", () => {
    expect(parseArea("1,000평", "m2")).toBe(3305.79);
    expect(parseArea("3305.785㎡", "pyeong")).toBe(3305.79);
    expect(parseArea("1000", "pyeong")).toBe(3305.79);
    expect(parseArea("넓음", "m2")).toBeNaN();
  });
  it("목록 분리", () => {
    expect(splitList("경기 화성, 평택 / 용인·안성")).toEqual(["경기 화성", "평택", "용인", "안성"]);
  });
  it("라벨 매칭", () => {
    expect(matchCode("토지", PROPERTY_TYPE_WORDS)).toBe("land");
    expect(matchCode("토지 + 건물", PROPERTY_TYPE_WORDS)).toBe("land_building");
    expect(matchCode("공장건물", PROPERTY_TYPE_WORDS)).toBe("building");
    expect(matchCode("계약완료", CUSTOMER_STAGE_WORDS)).toBe("contracted");
    expect(matchCode("상담중", CUSTOMER_STAGE_WORDS)).toBe("consulting");
    expect(matchCode("뭔지모름", CUSTOMER_STAGE_WORDS)).toBeNull();
  });
  it("연락처 정리 (엑셀이 지운 앞자리 0 복원)", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("1012345678")).toBe("010-1234-5678");
    expect(formatPhone("02-123-4567")).toBe("02-123-4567");
    expect(formatPhone("0311234567")).toBe("031-123-4567");
    expect(formatPhone("")).toBeNull();
  });
});

describe("헤더 자동 연결", () => {
  it("흔한 고객 엑셀 헤더", () => {
    const headers = ["No", "고객명", "업체명", "HP", "희망 지역", "예산(억)", "평수", "담당", "비고"];
    const m = suggestMapping(headers, CUSTOMER_FIELDS);
    expect(m.name).toBe(1);
    expect(m.companyName).toBe(2);
    expect(m.phone).toBe(3);
    expect(m.regions).toBe(4);
    expect(m.budget).toBe(5);
    expect(m.landArea).toBe(6);
    expect(m.assignee).toBe(7);
    expect(m.memo).toBe(8);
    expect(m.email).toBeNull();
  });
  it("물건: 연락처는 소유자 연락처로, 한 열은 한 항목에만", () => {
    const headers = ["소재지", "지목", "용도지역", "면적(평)", "매매가", "지주", "연락처"];
    const m = suggestMapping(headers, PROPERTY_FIELDS);
    expect(m.address).toBe(0);
    expect(m.landArea).toBe(3);
    expect(m.askingPrice).toBe(4);
    expect(m.ownerName).toBe(5);
    expect(m.ownerPhone).toBe(6);
    const used = Object.values(m).filter((v) => v !== null);
    expect(new Set(used).size).toBe(used.length);
  });
  it("필수 항목 누락 알림", () => {
    expect(missingRequired("properties", { address: null })).toHaveLength(1);
    expect(missingRequired("customers", { name: 0 })).toHaveLength(0);
  });
});

describe("행 → 레코드", () => {
  const staff = [{ id: "u1", name: "이대리" }];

  it("고객: 니즈까지 읽고 오류·경고를 행 번호로", () => {
    const headers = ["이름", "회사명", "연락처", "희망지역", "예산", "희망면적(평)", "물건종류", "진행단계", "담당자"];
    const rows = [
      ["최○○", "(주)한빛", "1012345678", "경기 화성, 평택", "30억~50억", "2000~3000", "토지", "상담중", "이대리"],
      ["", "", "010-0000-0000", "", "", "", "", "", ""],
      ["윤○○", "", "", "", "많이", "", "", "", ""],
      ["", "", "", "", "", "", "", "", ""],
      ["강○○", "", "", "서울", "", "", "아파트", "뭔가", "김부장"],
    ];
    const m = suggestMapping(headers, CUSTOMER_FIELDS);
    const res = buildCustomerRecords(headers, rows, m, { staff, defaultAssigneeId: "me" });

    expect(res.total).toBe(4); // 빈 행 제외
    expect(res.records.map((r) => r.row)).toEqual([2, 6]);
    const [first, last] = res.records;
    expect(first.customer).toMatchObject({
      name: "최○○",
      customerType: "corporation",
      phone: "010-1234-5678",
      stage: "consulting",
      assigneeId: "u1",
    });
    expect(first.needs).toMatchObject({ regions: ["경기 화성", "평택"], propertyTypes: ["land"], budgetMin: 300000, budgetMax: 500000, landAreaMinM2: 6611.57 });
    expect(last.customer).toMatchObject({ stage: "new", assigneeId: "me", customerType: "individual" });

    expect(res.errors).toEqual([
      { row: 3, messages: ["고객 이름이 비어 있습니다"] },
      { row: 4, messages: ['예산 "많이" 을(를) 읽을 수 없습니다 (예: 30억~50억)'] },
    ]);
    expect(res.warnings.find((w) => w.row === 6)?.messages).toEqual([
      "물건 종류 일부를 알 수 없습니다 (아파트)",
      '진행 단계 "뭔가" 을(를) 알 수 없어 기본값으로 둡니다',
      '담당자 "김부장" 직원을 찾을 수 없습니다',
    ]);
  });

  it("직원 권한이면 담당자를 본인으로 고정", () => {
    const headers = ["이름", "담당자"];
    const res = buildCustomerRecords(headers, [["A", "이대리"]], suggestMapping(headers, CUSTOMER_FIELDS), {
      staff,
      defaultAssigneeId: "me",
      forceAssigneeId: "me",
    });
    expect(res.records[0].customer.assigneeId).toBe("me");
  });

  it("물건: 지역·물건명 자동 생성, 면적 단위는 헤더 따라", () => {
    const headers = ["소재지", "용도지역", "면적(평)", "매매가"];
    const rows = [["경기도 화성시 장안면 ○○리 7", "계획관리지역", "3,000", "45억"], ["", "", "100", ""]];
    const res = buildPropertyRecords(headers, rows, suggestMapping(headers, PROPERTY_FIELDS), { staff, defaultAssigneeId: "me" });
    expect(res.records).toHaveLength(1);
    expect(res.records[0].property).toMatchObject({
      region: "경기 화성시",
      title: "경기 화성시 계획관리지역 3,000평",
      landAreaM2: 9917.36,
      askingPrice: 450000,
      propertyType: "land",
      status: "available",
    });
    expect(res.errors[0]).toEqual({ row: 3, messages: ["지번 주소가 비어 있습니다"] });
  });
});

describe("파일 읽기", () => {
  async function xlsx(rows: unknown[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("s");
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("xlsx: 제목 행을 건너뛰고 헤더를 찾음, 숫자·수식 결과를 문자열로", async () => {
    const buf = await xlsx([["2026 고객 목록"], [], ["이름", "연락처", "예산"], ["최○○", 1012345678, { formula: "30*10000", result: 300000 }]]);
    const t = await readTable(buf, "list.xlsx");
    expect(t.headerRow).toBe(3);
    expect(t.headers).toEqual(["이름", "연락처", "예산"]);
    expect(t.rows).toEqual([["최○○", "1012345678", "300000"]]);
  });

  it("csv: EUC-KR(한글 엑셀 저장) 자동 판별", async () => {
    // "이름,지역\n최,화성" 을 EUC-KR 로
    const euckr = Buffer.from([0xc0, 0xcc, 0xb8, 0xa7, 0x2c, 0xc1, 0xf6, 0xbf, 0xaa, 0x0a, 0xc3, 0xd6, 0x2c, 0xc8, 0xad, 0xbc, 0xba]);
    const t = await readTable(euckr, "a.csv");
    expect(t.headers).toEqual(["이름", "지역"]);
    expect(t.rows).toEqual([["최", "화성"]]);
  });

  it("csv: UTF-8 BOM", async () => {
    const t = await readTable(Buffer.from("﻿이름,예산\n윤,\"30억~50억\"\n"), "b.csv");
    expect(t.rows).toEqual([["윤", "30억~50억"]]);
  });

  it("지원하지 않는 형식은 안내 오류", async () => {
    await expect(readTable(Buffer.from("x"), "old.xls")).rejects.toThrow(ReadError);
    await expect(readTable(Buffer.from("x"), "a.pdf")).rejects.toThrow(/xlsx 또는 .csv/);
  });
});
