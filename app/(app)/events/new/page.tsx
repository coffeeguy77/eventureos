import { requireOrg, getMembers } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { NewEventForm } from "./form";

export const metadata = { title: "New event" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, user } = await requireOrg();
  const [members, { data: customers, error }] = await Promise.all([
    getMembers(org.id),
    supabase.from("customers").select("id, name, company").eq("organisation_id", org.id).order("name"),
  ]);
  if (error) throw new Error(`Could not load customers: ${error.message}`);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Events" title="New event" subtitle="For a customer you already work with. New leads should start as an enquiry." />
      <NewEventForm
        customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name }))}
        members={members.map((m) => ({ id: m.id, name: m.full_name ?? m.email }))}
        me={user.id}
        defaultCustomer={sp.customer}
      />
    </div>
  );
}
