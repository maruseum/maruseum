import { ActionForm } from "@/components/action-form";
import { PropertyFields } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { listStaff, staffOptions } from "@/lib/queries";
import { createProperty } from "../actions";

export default async function NewPropertyPage() {
  await requireUser();
  const staff = staffOptions(await listStaff());
  return (
    <>
      <PageHeader title="물건 등록" description="공공데이터(토지이용계획·공시지가) 자동 조회는 다음 단계에서 붙습니다." />
      <Card>
        <ActionForm action={createProperty} submitLabel="등록">
          <PropertyFields staff={staff} />
        </ActionForm>
      </Card>
    </>
  );
}
