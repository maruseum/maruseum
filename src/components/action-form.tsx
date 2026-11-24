"use client";

import { useActionState, useEffect, useRef, startTransition, type ReactNode } from "react";
import type { ActionState } from "@/lib/form";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * 서버 액션 폼.
 * - 입력 오류가 나도 입력값이 지워지지 않도록 직접 dispatch 합니다.
 * - resetOnSuccess 를 주면 저장 성공 후 폼을 비웁니다 (한 화면에서 계속 추가하는 폼용).
 */
export function ActionForm({
  action,
  children,
  submitLabel = "저장",
  pendingLabel = "저장 중…",
  resetOnSuccess = false,
  className = "space-y-4",
  submitClassName,
}: {
  action: Action;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  submitClassName?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      {children}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={
            submitClassName ??
            "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          }
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        {state?.ok && !pending && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  );
}
