import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { addDaysISO, fmtDate, money, todayISO } from "@/lib/format";
import { readChecklist } from "@/lib/nerdherd/core";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type T = {
  id: string; number: number; subject: string; status: string; due_date: string | null; checklist: unknown; resolved_at: string | null;
  customers: { id: string; name: string } | null; websites: { domain: string } | null;
  invoices: { id: string; number: string | null; status: string; balance: number | null; due_date: string | null } | null;
};

/** Maintenance: billed first, done once paid. What's waiting on payment, what's ready, what's coming up. */
export default async function MaintenancePage() {
  const { supabase, org } = await requireOrg();
  const today = todayISO(org.timezone);
  const since = addDaysISO(today, -45);
  const [{ data, error }, { data: upcoming }] = await Promise.all([
    supabase.from("support_tickets").select("id, number, subject, status, due_date, checklist, resolved_at, customers(id, name), websites(domain), invoices!support_tickets_invoice_id_fkey(id, number, status, balance, due_date)")
      .eq("organisation_id", org.id).eq("kind", "maintenance").or(`status.not.in.(resolved,closed),resolved_at.gte.${since}`).order("created_at", { ascending: false }).limit(1000),
    supabase.from("recurring_invoices").select("id, name, status, next_date, total, creates_ticket, customers(name), websites(domain)").eq("organisation_id", org.id).eq("creates_ticket", true).neq("status", "ended").order("next_date").limit(500),
  ]);
  if (error) throw new Error(`Couldn't load maintenance: ${error.message}`);
  const all = (data ?? []) as unknown as T[];
  const col = (title: string, hint: string, rows: T[], tone: "amber" | "blue" | "brand" | "green") => (
    <Card>
      <CardHeader title={`${title} (${rows.length})`} subtitle={hint} />
      {rows.length ? (
        <div className="divide-y divide-line border-t border-line">
          {rows.map((t) => {
            const cl = readChecklist(t.checklist);
            const done = cl.filter((x) => x.done).length;
            return (
              <Link key={t.id} href={`/nerd-herd/tickets/${t.id}`} className="block px-4 py-2.5 hover:bg-canvas">
                <p className="truncate text-[0.8125rem] font-medium text-ink">{t.customers?.name ?? "No client"}{t.websites ? <span className="font-normal text-ink-muted"> · {t.websites.domain}</span> : null}</p>
                <p className="truncate text-[0.7188rem] text-ink-muted">#{t.number} {t.subject}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {t.invoices && t.status === "awaiting_payment" && <Badge tone={t.invoices.status === "overdue" ? "red" : "amber"}>{t.invoices.number} · {money(t.invoices.balance ?? 0, org.currency)} {t.invoices.status === "overdue" ? "overdue" : "unpaid"}</Badge>}
                  {cl.length > 0 && t.status !== "awaiting_payment" && <Badge tone={tone}>{done}/{cl.length} checks</Badge>}
                  {t.resolved_at && <span className="text-[0.6875rem] text-ink-faint">done {fmtDate(t.resolved_at)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      ) : <div className="border-t border-line"><EmptyState title="Nothing here" /></div>}
    </Card>
  );
  type U = { id: string; name: string; status: string; next_date: string; total: number; customers: { name: string } | null; websites: { domain: string } | null };
  const soon = ((upcoming ?? []) as unknown as U[]).filter((u) => u.next_date <= addDaysISO(today, 45));

  return (
    <div className="space-y-5">
      <p className="text-[0.8125rem] text-ink-muted">When a maintenance plan's invoice is raised, its job appears under <strong className="text-ink">Awaiting payment</strong>. The moment the invoice is paid (by card, or in Xero) it moves to <strong className="text-ink">Ready to do</strong> and the team is notified.</p>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        {col("Awaiting payment", "Billed — waiting for the money", all.filter((t) => t.status === "awaiting_payment"), "amber")}
        {col("Ready to do", "Paid — do the checks", all.filter((t) => ["open", "new", "scheduled"].includes(t.status)), "blue")}
        {col("In progress", "Checks under way", all.filter((t) => ["in_progress", "waiting_customer"].includes(t.status)), "brand")}
        {col("Done", "Last 45 days", all.filter((t) => t.status === "resolved"), "green")}
      </div>
      <Card>
        <CardHeader title="Coming up" subtitle="Maintenance plans due in the next 45 days — each raises its invoice and opens a job on the day" action={<Link href="/nerd-herd/plans" className="text-[0.75rem] font-medium text-brand-600">All plans</Link>} />
        {soon.length ? (
          <div className="divide-y divide-line border-t border-line">
            {soon.map((u) => (
              <Link key={u.id} href={`/hosting/recurring/${u.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas">
                <span className="min-w-0 truncate text-[0.8125rem] text-ink">{u.customers?.name ?? "—"}{u.websites ? <span className="text-ink-muted"> · {u.websites.domain}</span> : null}</span>
                <span className="flex shrink-0 items-center gap-2 text-[0.75rem] text-ink-muted">{fmtDate(u.next_date)} · {money(u.total, org.currency)}{u.status !== "active" && <Badge tone="amber">Paused — won't run</Badge>}</span>
              </Link>
            ))}
          </div>
        ) : <div className="border-t border-line"><EmptyState title="No maintenance plans due soon">Turn on “Opens a maintenance job” for a plan in Plans.</EmptyState></div>}
      </Card>
    </div>
  );
}
