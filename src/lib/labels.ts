// DB enum 값 ↔ 화면 표시용 한국어 라벨

export const ROLE_LABEL = {
  admin: "관리자",
  manager: "팀장",
  agent: "직원",
} as const;

export const PROPERTY_TYPE_LABEL = {
  land: "토지",
  building: "건물",
  land_building: "토지+건물",
} as const;

export const PROPERTY_STATUS_LABEL = {
  available: "진행중",
  negotiating: "협상중",
  on_hold: "보류",
  sold: "거래완료",
  withdrawn: "철회",
} as const;

export const CUSTOMER_TYPE_LABEL = {
  individual: "개인",
  corporation: "법인",
} as const;

/** 영업 파이프라인 순서대로 */
export const CUSTOMER_STAGE_LABEL = {
  new: "신규",
  consulting: "상담",
  proposing: "물건 제안",
  site_visit: "임장",
  negotiating: "협상",
  contracted: "계약",
  closed: "잔금 완료",
  lost: "이탈",
} as const;

type Color = "slate" | "blue" | "green" | "amber" | "red" | "violet";

export const STAGE_COLOR: Record<keyof typeof CUSTOMER_STAGE_LABEL, Color> = {
  new: "blue",
  consulting: "blue",
  proposing: "violet",
  site_visit: "violet",
  negotiating: "amber",
  contracted: "green",
  closed: "green",
  lost: "slate",
};

export const PROPERTY_STATUS_COLOR: Record<keyof typeof PROPERTY_STATUS_LABEL, Color> = {
  available: "green",
  negotiating: "amber",
  on_hold: "slate",
  sold: "blue",
  withdrawn: "slate",
};

export const INTERACTION_KIND_LABEL = {
  call: "통화",
  meeting: "미팅",
  site_visit: "임장",
  message: "문자·카톡",
  memo: "메모",
} as const;

export const TASK_STATUS_LABEL = {
  open: "진행",
  done: "완료",
  canceled: "취소",
} as const;

export const NEEDS_SOURCE_LABEL = {
  manual: "직접 입력",
  call_summary: "통화 요약",
  import: "가져오기",
} as const;

export function entries<T extends Record<string, string>>(obj: T): [keyof T & string, string][] {
  return Object.entries(obj) as [keyof T & string, string][];
}
