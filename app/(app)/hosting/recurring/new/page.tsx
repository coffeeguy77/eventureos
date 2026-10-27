import { requireOrg } from "@/lib/context";
import { todayISO } from "@/lib/format";
import { RecurringEditor } from "@/components/hosting/recurring-editor";

export const dynamic = "force-dynamic";

export default async function NewRecurringPage() {
  const { supabase, org } = await requireOrg();
  const [{ data: clients }, { data: hosting }] = await Promise.all([
    supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").limit(3000),
    supabase.from("hosting_accounts").select("id, domain").eq("organisation_id", org.id).order("domain").limit(3000).then((x) => x, () => ({ data: [] })),
  ]);
  const today = todayISO(org.timezone);
  return <RecurringEditor id={null} today={today} clients={(clients ?? []) as { id: string; name: string }[]} hosting={(hosting ?? []) as { id: string; domain: string }[]}
    initial={{ customer_id: "", name: "", category: "hosting", status: "paused", every: 1, unit: "month", next_date: today, end_date: null, due_type: "days_after", due_days: 14, send_mode: "authorise", reference: "", line_items: [], hosting_account_id: null, notes: "" }} />;
}
