import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";

const ACTION_LABEL: Record<string, string> = {
  login: "로그인",
  login_failed: "로그인 실패",
  logout: "로그아웃",
  create: "등록",
  update: "수정",
  view: "열람",
  stage_change: "단계 변경",
  needs_update: "니즈 변경",
  task_done: "할 일 완료",
  task_open: "할 일 재개",
  task_canceled: "할 일 취소",
  propose: "물건 제안",
  proposal_status: "제안 반응",
  import: "엑셀 가져오기",
};

const ENTITY_LABEL: Record<string, string> = {
  user: "직원",
  team: "팀",
  customer: "고객",
  property: "물건",
  task: "할 일",
};

export default async function AuditPage() {
  await requireRole("admin");
  const rows = await db
    .select({ a: auditLogs, userName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);

  return (
    <>
      <PageHeader title="감사 로그" description="최근 300건. 고객 정보 열람·수정, 로그인 기록이 남습니다." />
      <Table head={["일시", "직원", "행동", "대상", "상세", "IP"]}>
        {rows.map(({ a, userName }) => (
          <tr key={a.id}>
            <Td>{formatDateTime(a.createdAt)}</Td>
            <Td>{userName ?? "—"}</Td>
            <Td>{ACTION_LABEL[a.action] ?? a.action}</Td>
            <Td>
              {ENTITY_LABEL[a.entityType] ?? a.entityType}
              {a.entityId && <span className="ml-1 font-mono text-xs text-slate-400">{a.entityId.slice(0, 8)}</span>}
            </Td>
            <Td className="max-w-80 truncate font-mono text-xs">{a.detail ? JSON.stringify(a.detail) : ""}</Td>
            <Td className="text-xs">{a.ip ?? ""}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
