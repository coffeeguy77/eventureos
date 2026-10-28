import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { money, todayISO } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/nerdherd/core";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Kpi } from "@/components/records/kpi";
import { TICKET_SELECT, TicketRow, type TicketListRow } from "@/components/nerdherd/ticket-row";

export const dynamic = "force-dynamic";

/** The help desk: what needs doing now, what's waiting on payment, and who owes money. */
export default async function NerdHerdDesk() {
  const { supabase, org, user, role } = await requireOrg();
  const today = todayISO(org.timezone);
  const [{ data: open, error }, sites, plans, { data: owing }] = await Promise.all([
    supabase.from("support_tickets").select(TICKET_SELECT).eq("organisation_id", org.id).in("status", OPEN_STATUSES).order("last_activity_at", { ascending: false }).limit(500),
    supabase.from("websites").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).neq("status", "archived"),
    supabase.from("recurring_invoices").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "active"),
    // money is for managers (RLS hides invoices from everyone else — the list is then simply empty)
    supabase.from("invoices").select("customer_id, balance, due_date, customers(name)").eq("organisation_id", org.id).in("status", ["awaiting_payment", "overdue"]).gt("balance", 0).lt("due_date", today).limit(5000),
  ]);
  if (error) throw new Error(`Couldn't load tickets: ${error.message}`);
  const all = (open ?? []) as unknown as TicketListRow[];
  const ready = all.filter((r) => r.status === "open" || r.status === "in_progress" || r.status === "scheduled");
  const fresh = all.filter((r) => r.status === "new");
  const waitingPay = all.filter((r) => r.status === "awaiting_payment");
  const waitingClient = all.filter((r) => r.status === "waiting_customer");
  const mine = all.filter((r) => r.assigned_to === user.id);
  const late = all.filter((r) => r.due_date && r.due_date < today && r.status !== "awaiting_payment");

  const debts = new Map<string, { name: string; amount: number; oldest: string }>();
  for (const i of (owing ?? []) as unknown as { customer_id: string; balance: number; due_date: string; customers: { name: string } | null }[]) {
    const d = debts.get(i.customer_id) ?? { name: i.customers?.name ?? "Client", amount: 0, oldest: i.due_date };
    d.amount += Number(i.balance); if (i.due_date < d.oldest) d.oldest = i.due_date;
    debts.set(i.customer_id, d);
  }
  const debtList = [...debts.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const overdueTotal = debtList.reduce((a, [, d]) => a + d.amount, 0);

  const list = (title: string, rows: TicketListRow[], empty: string, subtitle?: string) => (
    <Card>
      <CardHeader title={`${title} (${rows.length})`} subtitle={subtitle} />
      {rows.length ? <div className="divide-y divide-line border-t border-line">{rows.slice(0, 12).map((r) => <TicketRow key={r.id} r={r} today={today} />)}</div>
        : <div className="border-t border-line"><EmptyState title={empty} /></div>}
      {rows.length > 12 && <Link href="/nerd-herd/tickets" className="block border-t border-line px-5 py-2.5 text-[0.7812rem] font-medium text-brand-600">See all {rows.length}</Link>}
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-ink-muted">{fresh.length ? <><strong className="text-ink">{fresh.length} new ticket{fresh.length === 1 ? "" : "s"}</strong> to look at first.</> : "No new tickets waiting."}</p>
        <ButtonLink href="/nerd-herd/tickets/new" variant="primary"><Plus className="h-4 w-4" />New ticket</ButtonLink>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="New" value={fresh.length} href="/nerd-herd/tickets?v=new" alert={fresh.length > 0} />
        <Kpi label="Ready to do" value={ready.length} sub="paid or ready to start" href="/nerd-herd/tickets?v=ready" />
        <Kpi label="Awaiting payment" value={waitingPay.length} sub="work starts when paid" href="/nerd-herd/maintenance" />
        <Kpi label="Past due date" value={late.length} href="/nerd-herd/tickets?v=late" alert={late.length > 0} />
        <Kpi label="Websites" value={sites.count ?? 0} sub={`${plans.count ?? 0} active plan${plans.count === 1 ? "" : "s"}`} href="/nerd-herd/websites" />
        <Kpi label="Overdue" value={money(overdueTotal, org.currency, { cents: false })} sub={`${debtList.length} client${debtList.length === 1 ? "" : "s"}`} href="/accounts" alert={overdueTotal > 0} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {list("New", fresh, "No new tickets", "Read, set a priority and assign")}
          {list("Ready to do", ready, "Nothing waiting to be worked on", "Paid maintenance and open support jobs")}
          {mine.length > 0 && list("Assigned to me", mine, "Nothing assigned to you")}
          {list("Waiting on the client", waitingClient, "Not waiting on anyone")}
        </div>
        <div className="space-y-5">
          {list("Awaiting payment", waitingPay, "No maintenance waiting on payment", "Billed first — moves to Ready to do when paid")}
          {role !== "sales" && (
            <Card>
              <CardHeader title="Overdue clients" subtitle={debtList.length ? `${money(overdueTotal, org.currency)} past due` : undefined} />
              {debtList.length ? (
                <div className="divide-y divide-line border-t border-line">
                  {debtList.slice(0, 10).map(([id, d]) => (
                    <Link key={id} href={`/clients/${id}?tab=web`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[0.8125rem] hover:bg-canvas">
                      <span className="min-w-0 truncate text-ink">{d.name}</span>
                      <span className="shrink-0 tabular text-rose-700">{money(d.amount, org.currency)}</span>
                    </Link>
                  ))}
                </div>
              ) : <div className="border-t border-line"><EmptyState title="Nobody is overdue" /></div>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
