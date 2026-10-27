import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { fmtDate, money, todayISO } from "@/lib/format";
import type { Line } from "@/lib/recurring/core";
import { Card, CardHeader } from "@/components/ui/card";
import { RecurringEditor } from "@/components/hosting/recurring-editor";
import type { RecurringInput } from "../../recurring-actions";

export const dynamic = "force-dynamic";

export default async function RecurringItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: r } = await supabase.from("recurring_invoices").select("*, customers(id, name)").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!r) notFound();
  const [{ data: clients }, { data: hosting }, { data: invoices }] = await Promise.all([
    supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").limit(3000),
    supabase.from("hosting_accounts").select("id, domain").eq("organisation_id", org.id).order("domain").limit(3000).then((x) => x, () => ({ data: [] })),
    supabase.from("invoices").select("id, number, issue_date, total, status").eq("recurring_id", r.id).order("issue_date", { ascending: false }).limit(24),
  ]);
  const cust = r.customers as { id: string; name: string } | null;
  return (
    <div className="space-y-5">
      <div>
        <Link href="/hosting/recurring" className="text-[0.75rem] text-ink-muted hover:underline">← Recurring invoices</Link>
        <h2 className="mt-1 text-[1.125rem] font-semibold text-ink">{cust?.name} · {r.name}</h2>
        {r.source === "xero" && <p className="text-[0.75rem] text-ink-muted">Imported from Xero{r.xero_status ? ` (it was ${String(r.xero_status).toLowerCase()} there)` : ""}. Make sure it's deleted or ended in Xero before switching it on here.</p>}
        {r.last_error && <p className="mt-1 text-[0.75rem] text-rose-700">{r.last_error}</p>}
      </div>
      <RecurringEditor id={r.id as string} today={todayISO(org.timezone)} clients={(clients ?? []) as { id: string; name: string }[]} hosting={(hosting ?? []) as { id: string; domain: string }[]}
        initial={{ customer_id: cust?.id ?? "", customer_name: cust?.name ?? null, name: r.name, category: r.category, status: r.status, every: r.every, unit: r.unit, next_date: r.next_date, end_date: r.end_date,
          due_type: r.due_type, due_days: r.due_days, send_mode: r.send_mode, reference: r.reference, line_items: (r.line_items ?? []) as Line[], hosting_account_id: r.hosting_account_id, notes: r.notes } as RecurringInput & { customer_name: string | null }} />
      <Card>
        <CardHeader title="Invoices raised" />
        <ul className="divide-y divide-line border-t border-line">
          {(invoices ?? []).length ? (invoices ?? []).map((i) => (
            <li key={i.id as string}><Link href={`/invoices/${i.id}`} className="flex items-center justify-between px-5 py-2.5 text-[0.8125rem] hover:bg-canvas"><span>{i.number} · {fmtDate(i.issue_date as string)}</span><span className="tabular-nums">{money(Number(i.total), org.currency)} · {i.status}</span></Link></li>
          )) : <li className="px-5 py-3 text-[0.8125rem] text-ink-muted">None yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
