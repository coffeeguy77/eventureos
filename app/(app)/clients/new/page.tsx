import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { NewClientForm } from "./form";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireOrg();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Clients" title="New client"
        subtitle="We’ll check for an existing client with the same email, phone or name before creating anything. New leads usually start as an enquiry instead." />
      <NewClientForm />
    </div>
  );
}
