import { requireOrg, getMembers } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { NewEnquiryForm } from "./form";

export const metadata = { title: "New enquiry" };

export default async function NewEnquiryPage() {
  const { org, user } = await requireOrg();
  const members = await getMembers(org.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Enquiries" title="New enquiry" subtitle="Log a phone call, DM, walk-in or email. If the email matches an existing customer, we’ll link it automatically." />
      <NewEnquiryForm members={members.map((m) => ({ id: m.id, name: m.full_name ?? m.email }))} me={user.id} />
    </div>
  );
}
