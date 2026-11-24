import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CustomerFields } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { canReassign } from "@/lib/authz";
import { getCustomerFor, listStaff, staffOptions } from "@/lib/queries";
import { updateCustomer } from "../../actions";

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  const row = await getCustomerFor(user, id);
  if (!row) notFound();
  const staff = staffOptions(await listStaff());

  return (
    <>
      <PageHeader title={`${row.customer.name} 정보 수정`} />
      <Card>
        <ActionForm action={updateCustomer.bind(null, id)}>
          <CustomerFields customer={row.customer} staff={staff} canAssign={canReassign(user)} />
        </ActionForm>
      </Card>
    </>
  );
}
