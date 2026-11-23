import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDate, money } from "@/lib/format";
import { describeSchedule, type Unit } from "@/lib/recurring/core";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Care Hub → Care plans: every client on a maintenance plan (standard or their own custom package), who bills it
 * (EventureOS or still Xero), the paid history that confirms it's a real recurring bill, and whether they can sign in
 * to their portal yet. Read-only — billing stays exactly as it is.
 */
type Plan = {
  id: string; customer_id: string; name: string; status: string; xero_status: string | null; source: string; every: number; unit: Unit; total: number; next_date: string;
  line_items: { description?: string; line_amount?: number }[] | null; customers: { name: string } | null; websites: { domain: string } | null;
};
type Inv = { customer_id: string; issue_date: string; total: number; status: string };

const STANDARD_INC = 132; // $120 + GST a check

export async function CarePlans({ db, orgId, currency, tz }: { db: SupabaseClient; orgId: string; currency: string; tz: string }) {
  void tz;
  const { data } = await db.from("recurring_invoices").select("id, customer_id, name, status, xero_status, source, every, unit, total, next_date, line_items, customers(name), websites(domain)")
    .eq("organisation_id", orgId).eq("category", "maintenance").neq("status", "ended").order("next_date");
  const plans = (data ?? []) as unknown as Plan[];
  if (!plans.length) return <Card><CardHeader title="Care plans" /><EmptyState title="No maintenance plans yet">Clients on a maintenance plan show here.</EmptyState></Card>;
  const ids = [...new Set(plans.map((p) => p.customer_id))];
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: invs }, { data: portal }] = await Promise.all([
    db.from("invoices").select("customer_id, issue_date, total, status").in("customer_id", ids).gte("issue_date", since).neq("status", "void"),
    db.from("contacts").select("customer_id").in("customer_id", ids).not("portal_user_id", "is", null),
  ]);
  const invoices = (invs ?? []) as Inv[];
  const canSignIn = new Set(((portal ?? []) as { customer_id: string }[]).map((c) => c.customer_id));

  const rows = plans.map((p) => {
    const amount = Number(p.total);
    const matching = invoices.filter((i) => i.customer_id === p.customer_id && Math.abs(Number(i.total) - amount) < 0.01);
    const paid = matching.filter((i) => i.status === "paid").length;
    const drafts = matching.filter((i) => i.status === "draft").length;
    const billedBy = p.status === "active" ? "EventureOS" : p.xero_status === "AUTHORISED" ? "Xero" : p.xero_status === "DRAFT" ? "Nobody" : "Paused";
    const custom = amount !== STANDARD_INC || /leased|websites\)|\(\d+ websites/i.test(p.name);
    const desc = (p.line_items?.[0]?.description ?? p.name).split("\n").map((l) => l.trim()).filter(Boolean);
    const included = desc.find((l) => /support/i.test(l) && /\d+\s*(min|minute|hour|hr)/i.test(l)) ?? null;
    return { p, amount, paid, drafts, billedBy, custom, title: desc[0] ?? p.name, included, portal: canSignIn.has(p.customer_id) };
  });
  const confirmed = rows.filter((r) => r.paid >= 2).length;

  return (
    <Card>
      <CardHeader title="Care plans" subtitle={`${rows.length} clients on a maintenance plan · ${confirmed} confirmed by their paid invoices over the last year. Billing isn't changed here.`} />
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[820px] text-[0.8125rem]">
          <thead className="text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint">
            <tr><th className="px-5 py-2 font-medium">Client</th><th className="px-3 py-2 font-medium">Package</th><th className="px-3 py-2 font-medium">Price</th><th className="px-3 py-2 font-medium">Billed by</th><th className="px-3 py-2 font-medium">Confirmed</th><th className="px-5 py-2 font-medium">Portal</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.p.id} className="align-top">
                <td className="px-5 py-2.5">
                  <Link href={`/clients/${r.p.customer_id}?tab=web`} className="font-medium text-ink hover:underline">{r.p.customers?.name ?? "Client"}</Link>
                  {r.p.websites?.domain && <span className="block text-ink-muted">{r.p.websites.domain}</span>}
                </td>
                <td className="max-w-[300px] px-3 py-2.5">
                  <span className="flex flex-wrap items-center gap-1.5"><span className="text-ink">{r.title.replace(/^Scheduled Regular /, "")}</span>{r.custom ? <Badge tone="brand">Custom</Badge> : <Badge tone="neutral">Standard</Badge>}</span>
                  {r.included && <span className="mt-0.5 block text-[0.75rem] text-ink-muted">Includes: {r.included}</span>}
                </td>
                <td className="px-3 py-2.5 text-ink">{money(r.amount, currency)}<span className="block text-ink-muted">{describeSchedule(r.p.every, r.p.unit).toLowerCase()}</span></td>
                <td className="px-3 py-2.5">
                  {r.billedBy === "EventureOS" ? <Badge tone="green">EventureOS</Badge> : r.billedBy === "Xero" ? <Badge tone="slate">Xero</Badge> : r.billedBy === "Nobody" ? <Badge tone="red">Not billed</Badge> : <Badge tone="neutral">Paused</Badge>}
                  <span className="mt-0.5 block text-[0.75rem] text-ink-muted">{r.billedBy === "Nobody" ? "Xero has it as a draft only" : `next ${fmtDate(r.p.next_date)}`}</span>
                </td>
                <td className="px-3 py-2.5">
                  {r.paid >= 2 ? <span className="text-emerald-700 dark:text-emerald-400">✓ {r.paid} paid</span> : r.paid === 1 ? <span className="text-amber-700 dark:text-amber-400">1 paid</span> : <span className="text-rose-600">None paid</span>}
                  {r.drafts > 0 && <span className="block text-[0.75rem] text-ink-muted">{r.drafts} never sent (draft)</span>}
                </td>
                <td className="px-5 py-2.5">{r.portal ? <Badge tone="green">Can sign in</Badge> : <Link href={`/clients/${r.p.customer_id}`} className="text-[0.75rem] font-medium text-brand-600 hover:underline">Not invited yet</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-[0.75rem] text-ink-muted">Standard = {money(STANDARD_INC, currency)} a check for one site. Custom = a different price, several sites, or a package (like a leased website) — shown with what it includes.</p>
    </Card>
  );
}
