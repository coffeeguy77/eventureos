import { requireOrg, getMembers } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { TicketForm } from "@/components/nerdherd/ticket-form";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ client?: string; site?: string; kind?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const [{ data: clients }, { data: sites }, members] = await Promise.all([
    supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").limit(5000),
    supabase.from("websites").select("id, domain, customer_id").eq("organisation_id", org.id).neq("status", "archived").order("domain").limit(5000),
    getMembers(org.id),
  ]);
  return (
    <Card className="max-w-3xl">
      <CardHeader title="New ticket" subtitle="A support request, a job or a project. Tickets also arrive by email and from the client portal." />
      <div className="border-t border-line px-5 py-4">
        <TicketForm
          clients={(clients ?? []) as { id: string; name: string }[]}
          sites={(sites ?? []) as { id: string; domain: string; customer_id: string | null }[]}
          members={members.map((m) => ({ id: m.id, name: m.full_name ?? m.email }))}
          initial={{ customer_id: sp.client ?? null, website_id: sp.site ?? null, kind: sp.kind === "maintenance" ? "maintenance" : "support" }}
        />
      </div>
    </Card>
  );
}
