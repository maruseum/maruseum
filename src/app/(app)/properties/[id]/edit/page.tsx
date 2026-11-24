import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { properties } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { PropertyFields } from "@/components/forms";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { canEditProperty } from "@/lib/authz";
import { listStaff, staffOptions } from "@/lib/queries";
import { updateProperty } from "../../actions";

export default async function EditPropertyPage({ params }: PageProps<"/properties/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.select().from(properties).where(eq(properties.id, id));
  if (!p) notFound();
  if (!canEditProperty(user, p)) {
    return <Empty>이 물건을 수정할 권한이 없습니다. 담당자나 팀장에게 요청하세요.</Empty>;
  }
  const staff = staffOptions(await listStaff());

  return (
    <>
      <PageHeader title={`${p.title} 수정`} />
      <Card>
        <ActionForm action={updateProperty.bind(null, id)}>
          <PropertyFields property={p} staff={staff} />
        </ActionForm>
      </Card>
    </>
  );
}
