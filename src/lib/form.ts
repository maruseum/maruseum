export type ActionState = { error?: string; ok?: string; at?: number } | null;

export function str(fd: FormData, name: string): string | null {
  const v = fd.get(name);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function required(fd: FormData, name: string, label: string): string {
  const v = str(fd, name);
  if (!v) throw new FormError(`${label}을(를) 입력해 주세요.`);
  return v;
}

export function oneOf<T extends string>(value: string | null, allowed: readonly T[], label: string): T {
  if (value && (allowed as readonly string[]).includes(value)) return value as T;
  throw new FormError(`${label} 값이 올바르지 않습니다.`);
}

/** 숫자 칸 검증. 빈 값은 null, 숫자가 아니거나 음수면 오류 */
export function nonNegative(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new FormError(`${label}은(는) 0 이상의 숫자로 입력해 주세요.`);
  return value;
}

/** 사용자에게 그대로 보여줘도 되는 입력 오류 */
export class FormError extends Error {}

/** 서버 액션 본문을 감싸 입력 오류를 ActionState 로 바꿉니다. redirect() 는 그대로 통과시킵니다. */
export async function handleForm(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: "저장했습니다.", at: Date.now() };
  } catch (e) {
    if (e instanceof FormError) return { error: e.message, at: Date.now() };
    throw e;
  }
}
