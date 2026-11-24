import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/dal";
import { login } from "./actions";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">마루 중개 통합관리</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">직원 계정으로 로그인하세요.</p>
        <ActionForm action={login} submitLabel="로그인" pendingLabel="확인 중…" submitClassName="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          <Field label="이메일">
            <Input name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="비밀번호">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
        </ActionForm>
      </div>
    </main>
  );
}
