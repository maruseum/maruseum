// 갤럭시 통화 녹음 파일명 해석
//   "통화 녹음 홍길동_231124_143012.m4a"
//   "Call recording 010-1234-5678_231124_143012.m4a"
//   "통화 녹음 01012345678_20231124143012.m4a" (예전 형식)
//   "홍길동_231124_143012.m4a"
import { formatPhone, phoneDigits } from "../import/values";

export interface ParsedCallFile {
  /** 파일명에 적힌 상대 (연락처에 저장된 이름 또는 번호) */
  contact: string | null;
  /** 상대가 번호면 010-0000-0000 형식 */
  phone: string | null;
  /** 상대가 이름이면 이름 */
  name: string | null;
  /** 통화 시각 (서울 기준) */
  recordedAt: Date | null;
}

const PREFIX = /^(통화\s*녹음|call\s*recording|recording|녹음)[\s_-]*/i;

function seoulDate(y: number, mo: number, d: number, h: number, mi: number, s: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, h - 9, mi, s));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseCallFileName(fileName: string): ParsedCallFile {
  let base = fileName.replace(/\.[a-z0-9]{2,4}$/i, "").trim();
  base = base.replace(PREFIX, "");

  let recordedAt: Date | null = null;
  // _YYMMDD_HHMMSS | _YYYYMMDD_HHMMSS | _YYYYMMDDHHMMSS | " YYYY-MM-DD HH-MM-SS"
  const patterns: [RegExp, (m: RegExpMatchArray) => Date | null][] = [
    [/[_\s](\d{4})-(\d{2})-(\d{2})[_\s](\d{2})[-:.](\d{2})[-:.](\d{2})$/, (m) => seoulDate(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6])],
    [/[_\s](\d{4})(\d{2})(\d{2})[_\s]?(\d{2})(\d{2})(\d{2})$/, (m) => seoulDate(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6])],
    [/[_\s](\d{2})(\d{2})(\d{2})[_\s](\d{2})(\d{2})(\d{2})$/, (m) => seoulDate(2000 + +m[1], +m[2], +m[3], +m[4], +m[5], +m[6])],
  ];
  for (const [re, toDate] of patterns) {
    const m = base.match(re);
    if (m) {
      recordedAt = toDate(m);
      base = base.slice(0, m.index).trim();
      break;
    }
  }

  const contact = base.replace(/[_\s-]+$/, "").trim() || null;
  if (!contact) return { contact: null, phone: null, name: null, recordedAt };

  const digits = phoneDigits(contact);
  const looksLikePhone = /^[\d\s()+-]+$/.test(contact) && digits.length >= 8;
  if (looksLikePhone) {
    const normalized = digits.startsWith("82") ? `0${digits.slice(2)}` : digits;
    return { contact, phone: formatPhone(normalized), name: null, recordedAt };
  }
  return { contact, phone: null, name: contact, recordedAt };
}
