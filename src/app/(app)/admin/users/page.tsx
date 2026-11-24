import { asc } from "drizzle-orm";
import { db } from "@/db";
import { teams, users } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireRole } from "@/lib/auth/dal";
import { entries, ROLE_LABEL } from "@/lib/labels";
import { createTeam, createUser, updateUser } from "./actions";

export default async function AdminUsersPage() {
  await requireRole("admin");
  const [staff, teamRows] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(teams).orderBy(asc(teams.name)),
  ]);
  const teamOptions: [string, string][] = teamRows.map((t) => [String(t.id), t.name]);
  const roleOptions = entries(ROLE_LABEL);

  return (
    <>
      <PageHeader
        title="직원 관리"
        description="직원은 본인 담당 고객만, 팀장은 팀원 고객까지, 관리자는 전체 고객을 볼 수 있습니다. 물건은 전 직원이 공유합니다."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {staff.map((u) => (
            <Card key={u.id}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-medium">{u.name}</span>
                <span className="text-sm text-slate-500">{u.email}</span>
                <Badge color={u.active ? "green" : "slate"}>{u.active ? "사용 중" : "비활성"}</Badge>
              </div>
              <ActionForm action={updateUser.bind(null, u.id)} className="flex flex-wrap items-end gap-3">
                <Field label="권한">
                  <Select name="role" options={roleOptions} defaultValue={u.role} />
                </Field>
                <Field label="팀">
                  <Select name="teamId" options={teamOptions} placeholder="없음" defaultValue={u.teamId ? String(u.teamId) : ""} />
                </Field>
                <Field label="새 비밀번호">
                  <Input name="password" type="password" placeholder="변경 시에만" autoComplete="new-password" />
                </Field>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={u.active} /> 사용
                </label>
              </ActionForm>
            </Card>
          ))}
        </div>
        <div className="space-y-6">
          <Card title="직원 추가">
            <ActionForm action={createUser} resetOnSuccess submitLabel="추가">
              <Field label="이름 *"><Input name="name" required /></Field>
              <Field label="이메일 (로그인 ID) *"><Input name="email" type="email" required /></Field>
              <Field label="연락처"><Input name="phone" type="tel" /></Field>
              <Field label="권한"><Select name="role" options={roleOptions} defaultValue="agent" /></Field>
              <Field label="팀"><Select name="teamId" options={teamOptions} placeholder="없음" /></Field>
              <Field label="임시 비밀번호 * (8자 이상)">
                <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
              </Field>
            </ActionForm>
          </Card>
          <Card title="팀">
            <ul className="mb-4 space-y-1 text-sm">
              {teamRows.map((t) => <li key={t.id}>{t.name}</li>)}
              {teamRows.length === 0 && <li className="text-slate-500">팀이 없습니다.</li>}
            </ul>
            <ActionForm action={createTeam} resetOnSuccess submitLabel="팀 추가">
              <Field label="팀 이름"><Input name="name" required /></Field>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
