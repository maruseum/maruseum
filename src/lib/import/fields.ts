// 가져오기 항목 정의와 엑셀 헤더 자동 매칭

export type ImportKind = "customers" | "properties";

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** 엑셀 헤더로 흔히 쓰는 이름들 (공백 무시, 앞쪽이 우선) */
  aliases: string[];
  hint?: string;
}

export const CUSTOMER_FIELDS: FieldDef[] = [
  { key: "name", label: "고객 이름", required: true, aliases: ["이름", "고객명", "성명", "성함", "고객", "고객이름", "대표자", "담당고객"] },
  { key: "companyName", label: "회사명", aliases: ["회사명", "회사", "법인명", "상호", "업체명", "업체", "소속"] },
  { key: "customerType", label: "구분 (개인/법인)", aliases: ["구분", "고객구분", "고객유형", "유형", "개인/법인"] },
  { key: "phone", label: "연락처", aliases: ["연락처", "휴대폰", "핸드폰", "전화번호", "전화", "휴대전화", "hp", "h.p", "mobile"] },
  { key: "email", label: "이메일", aliases: ["이메일", "메일", "email", "e-mail"] },
  { key: "source", label: "유입 경로", aliases: ["유입경로", "유입", "경로", "출처", "소개자"] },
  { key: "stage", label: "진행 단계", aliases: ["진행단계", "단계", "진행상황", "진행", "상태"] },
  { key: "assignee", label: "담당자 (직원 이름)", aliases: ["담당자", "담당", "담당직원", "영업담당"] },
  { key: "regions", label: "희망 지역", aliases: ["희망지역", "관심지역", "선호지역", "지역", "희망위치"] },
  { key: "propertyTypes", label: "물건 종류", aliases: ["물건종류", "희망물건", "매물종류", "종류", "희망유형"] },
  { key: "purpose", label: "매입 목적", aliases: ["매입목적", "목적", "용도", "사용목적"] },
  { key: "budget", label: "예산 (범위)", aliases: ["예산", "매입예산", "가격대", "희망가격", "희망가", "예산범위"], hint: "예: 30억~50억, 50억 이하" },
  { key: "budgetMin", label: "예산 하한", aliases: ["최소예산", "예산하한", "예산최소"] },
  { key: "budgetMax", label: "예산 상한", aliases: ["최대예산", "예산상한", "예산최대"] },
  { key: "landArea", label: "희망 토지면적 (범위)", aliases: ["희망면적", "토지면적", "면적", "희망평수", "평수"], hint: "단위 없으면 평" },
  { key: "zonings", label: "용도지역", aliases: ["용도지역", "희망용도지역"] },
  { key: "needsNotes", label: "기타 조건", aliases: ["기타조건", "조건", "요구사항", "희망조건"] },
  { key: "memo", label: "메모", aliases: ["메모", "비고", "특이사항", "참고"] },
];

export const PROPERTY_FIELDS: FieldDef[] = [
  { key: "title", label: "물건명", aliases: ["물건명", "매물명", "제목", "물건", "매물"], hint: "비우면 지역·용도지역·면적으로 만듭니다" },
  { key: "propertyType", label: "종류", aliases: ["종류", "물건종류", "매물종류", "유형", "구분"] },
  { key: "status", label: "상태", aliases: ["상태", "진행상태", "진행"] },
  { key: "address", label: "지번 주소", required: true, aliases: ["지번주소", "지번", "주소", "소재지", "소재지번", "위치"] },
  { key: "roadAddress", label: "도로명 주소", aliases: ["도로명주소", "도로명"] },
  { key: "region", label: "지역", aliases: ["지역", "시군구"], hint: "비우면 주소에서 채웁니다" },
  { key: "landCategory", label: "지목", aliases: ["지목"] },
  { key: "zoning", label: "용도지역", aliases: ["용도지역", "용도"] },
  { key: "landArea", label: "토지면적", aliases: ["토지면적", "대지면적", "면적", "토지", "평수"], hint: "단위 없으면 ㎡ (헤더에 '평'이 있으면 평)" },
  { key: "buildingArea", label: "건물 연면적", aliases: ["연면적", "건물면적", "건물연면적"] },
  { key: "askingPrice", label: "희망가", aliases: ["희망가", "매매가", "가격", "금액", "매도가", "호가", "평가"], hint: "예: 45억, 450000(만원)" },
  { key: "ownerName", label: "소유자", aliases: ["소유자", "매도인", "지주", "소유주"] },
  { key: "ownerPhone", label: "소유자 연락처", aliases: ["소유자연락처", "매도인연락처", "지주연락처", "연락처"] },
  { key: "assignee", label: "담당자 (직원 이름)", aliases: ["담당자", "담당", "담당직원"] },
  { key: "description", label: "설명", aliases: ["설명", "메모", "비고", "특이사항", "참고"] },
];

export function fieldsFor(kind: ImportKind): FieldDef[] {
  return kind === "customers" ? CUSTOMER_FIELDS : PROPERTY_FIELDS;
}

/** 필드 key → 헤더 열 번호 (없으면 매칭 안 됨) */
export type Mapping = Record<string, number | null>;

const norm = (s: string) =>
  s
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[\s_.*:]/g, "")
    .toLowerCase();

/** 헤더 이름으로 필드를 자동 연결합니다. 정확히 같은 이름을 먼저, 그다음 포함 관계를 봅니다. 한 열은 한 필드에만. */
export function suggestMapping(headers: string[], fields: FieldDef[]): Mapping {
  const normalized = headers.map(norm);
  const used = new Set<number>();
  const mapping: Mapping = Object.fromEntries(fields.map((f) => [f.key, null]));

  // 1차: 정확히 일치 (별칭 순서대로)
  for (const f of fields) {
    for (const alias of f.aliases) {
      const idx = normalized.findIndex((h, i) => !used.has(i) && h === norm(alias));
      if (idx >= 0) {
        mapping[f.key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  // 2차: 헤더가 별칭을 포함 (두 글자 이상 별칭만)
  for (const f of fields) {
    if (mapping[f.key] !== null) continue;
    for (const alias of f.aliases) {
      const a = norm(alias);
      if (a.length < 2) continue;
      const idx = normalized.findIndex((h, i) => !used.has(i) && h.includes(a));
      if (idx >= 0) {
        mapping[f.key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return mapping;
}
