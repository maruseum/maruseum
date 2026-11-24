import { ActionForm } from "@/components/action-form";
import { CustomerFields, NeedsFields } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { canReassign } from "@/lib/authz";
import { listStaff, staffOptions } from "@/lib/queries";
import { createCustomer } from "../actions";

export default async function NewCustomerPage() {
  const user = await requireUser();
  const staff = staffOptions(await listStaff());

  return (
    <>
      <PageHeader title="고객 등록" description="니즈는 지금 비워 두고 나중에 입력해도 됩니다." />
      <ActionForm action={createCustomer} submitLabel="등록" className="space-y-6">
        <Card title="기본 정보">
          <CustomerFields staff={staff} canAssign={canReassign(user)} defaultAssigneeId={user.id} />
        </Card>
        <Card title="매입 니즈">
          <NeedsFields />
        </Card>
      </ActionForm>
    </>
  );
}
