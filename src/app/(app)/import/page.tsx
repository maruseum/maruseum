import { ImportWizard } from "@/components/import-wizard";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { CUSTOMER_FIELDS, PROPERTY_FIELDS } from "@/lib/import/fields";

export default async function ImportPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        title="엑셀 가져오기"
        description={
          user.role === "agent"
            ? "지금 쓰는 엑셀 목록을 그대로 올리세요. 고객은 모두 본인 담당으로 들어갑니다."
            : "지금 쓰는 엑셀 목록을 그대로 올리세요. 담당자 열에 직원 이름이 있으면 그 직원에게, 없으면 본인에게 배정됩니다."
        }
      />
      <ImportWizard fields={{ customers: CUSTOMER_FIELDS, properties: PROPERTY_FIELDS }} />
    </>
  );
}
