// 지역 문자열 정규화: "경기도 화성시 장안면" 과 "경기 화성" 을 같은 지역으로 보기 위한 규칙

const PROVINCES: [RegExp, string][] = [
  [/^서울(특별시|시)?$/, "서울"],
  [/^부산(광역시|시)?$/, "부산"],
  [/^대구(광역시|시)?$/, "대구"],
  [/^인천(광역시|시)?$/, "인천"],
  [/^광주(광역시)?$/, "광주"],
  [/^대전(광역시|시)?$/, "대전"],
  [/^울산(광역시|시)?$/, "울산"],
  [/^세종(특별자치시|시)?$/, "세종"],
  [/^경기(도)?$/, "경기"],
  [/^강원(특별자치도|도)?$/, "강원"],
  [/^(충청북도|충북)$/, "충북"],
  [/^(충청남도|충남)$/, "충남"],
  [/^(전라북도|전북특별자치도|전북)$/, "전북"],
  [/^(전라남도|전남)$/, "전남"],
  [/^(경상북도|경북)$/, "경북"],
  [/^(경상남도|경남)$/, "경남"],
  [/^제주(특별자치도|도)?$/, "제주"],
];

function provinceOf(token: string): string | null {
  for (const [re, short] of PROVINCES) if (re.test(token)) return short;
  return null;
}

/** "화성시" → "화성", "처인구" → "처인", "중구" 처럼 두 글자는 그대로 */
export function normalizeRegionToken(token: string): string {
  const t = token.trim();
  const province = provinceOf(t);
  if (province) return province;
  if (t.length >= 3 && /[시군구읍면동리]$/.test(t)) return t.slice(0, -1);
  return t;
}

export function regionTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeRegionToken);
}

/** 희망 지역(예: "경기 화성")의 모든 단어가 대상(물건 지역+주소)에 들어 있으면 일치 */
export function regionMatches(need: string, target: string): boolean {
  const needTokens = regionTokens(need);
  if (needTokens.length === 0) return false;
  const targetTokens = new Set(regionTokens(target));
  return needTokens.every((t) => targetTokens.has(t));
}

/** 지번 주소에서 "시도 시군구" 를 뽑습니다. "경기도 화성시 장안면 …" → "경기 화성시" */
export function regionFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const tokens = address.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const province = provinceOf(tokens[0]);
  if (!province) return null;
  if (province === "세종") return "세종";
  return `${province} ${tokens[1]}`;
}
