import Link from "next/link";
import { Plus } from "lucide-react";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { PLAN_LABEL, PLATFORM_LABEL, RATING, SITE_STATUS, TICKET_STATUS, type PlanCategory } from "@/lib/nerdherd/core";
import { describeSchedule } from "@/lib/recurring/core";
import type { ClientAccount } from "@/lib/nerdherd/account";
import { Card, CardHeader, EmptyState, Field } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

const ORDER: PlanCategory[] = ["hosting", "maintenance", "adwords", "domains", "other"];

/** A web client's whole account on one page: sites, hosting, plans, maintenance done, tickets, money and payment record. */
export function ClientWebAccount({ a, customerId, currency, tz }: { a: ClientAccount; customerId: string; currency: string; tz: string }) {
  const open = a.tickets.filter((t) => !["resolved", "closed"].includes(t.status));
  const has = (c: PlanCategory) => a.plans.some((p) => p.category === c && p.status !== "ended");
  const p = a.pay;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Websites" value={String(a.websites.filter((w) => w.status !== "archived").length)} sub={a.websites.some((w) => w.hosting?.suspended) ? "one is suspended" : undefined} alert={a.websites.some((w) => w.hosting?.suspended)} />
        <Stat label="Plans" value={money(a.monthlyValue, currency)} sub="a month, all plans" />
        <Stat label="Open tickets" value={String(open.length)} />
        {p ? <Stat label="Owing" value={money(p.owing, currency)} sub={p.overdue ? `${money(p.overdue, currency)} overdue` : "nothing overdue"} alert={p.overdue > 0} /> : <Stat label="Owing" value="—" sub="managers only" />}
        {p ? <Stat label="Lifetime paid" value={money(p.lifetimePaid, currency, { cents: false })} sub={`${p.paidInvoices} invoice${p.paidInvoices === 1 ? "" : "s"} paid`} /> : <Stat label="Lifetime paid" value="—" />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["hosting", "maintenance", "adwords", "domains"] as PlanCategory[]).map((c) => <Badge key={c} tone={has(c) ? "green" : "neutral"}>{has(c) ? "✓" : "✗"} {PLAN_LABEL[c]}</Badge>)}
        {p && <Badge tone={RATING[p.rating].tone}>{RATING[p.rating].label}</Badge>}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Websites" action={<ButtonLink href={`/nerd-herd/websites/new?client=${customerId}`} size="sm"><Plus className="h-3.5 w-3.5" />Add</ButtonLink>} />
          {a.websites.length ? (
            <div className="divide-y divide-line border-t border-line">
              {a.websites.map((w) => (
                <Link key={w.id} href={`/nerd-herd/websites/${w.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas">
                  <span className="min-w-0">
                    <span className="block truncate text-[0.8438rem] font-medium text-ink">{w.domain}</span>
                    <span className="block truncate text-[0.7188rem] text-ink-muted">{[PLATFORM_LABEL[w.platform] ?? w.platform, w.hosting ? `hosted on ${w.hosting.server ?? "our server"}` : "not hosted with us", w.hosting?.billing_status].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">{w.hosting?.suspended && <Badge tone="red">Suspended</Badge>}<Badge tone={SITE_STATUS[w.status]?.tone ?? "neutral"}>{SITE_STATUS[w.status]?.label ?? w.status}</Badge></span>
                </Link>
              ))}
            </div>
          ) : <div className="border-t border-line"><EmptyState title="No websites on file" /></div>}
        </Card>

        <Card>
          <CardHeader title="Plans and subscriptions" subtitle="Recurring invoices: hosting, maintenance, Google Ads and more" action={<Link href="/hosting/recurring/new" className="text-[0.75rem] font-medium text-brand-600">New plan</Link>} />
          {a.plans.length ? (
            <div className="divide-y divide-line border-t border-line">
              {[...a.plans].sort((x, y) => ORDER.indexOf(x.category) - ORDER.indexOf(y.category)).map((pl) => (
                <Link key={pl.id} href={`/hosting/recurring/${pl.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas">
                  <span className="min-w-0">
                    <span className="block truncate text-[0.8438rem] font-medium text-ink">{pl.name}</span>
                    <span className="block truncate text-[0.7188rem] text-ink-muted">{[PLAN_LABEL[pl.category], `${money(pl.total, currency)} ${describeSchedule(pl.every, pl.unit).toLowerCase()}`, pl.website, pl.status === "active" ? `next ${fmtDate(pl.next_date)}` : null, pl.creates_ticket ? "opens a maintenance job" : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Badge tone={pl.status === "active" ? "green" : pl.status === "paused" ? "amber" : "neutral"}>{pl.status === "active" ? "Active" : pl.status === "paused" ? "Paused" : "Ended"}</Badge>
                </Link>
              ))}
            </div>
          ) : <div className="border-t border-line"><EmptyState title="No plans" /></div>}
        </Card>

        <Card>
          <CardHeader title="Tickets" action={<ButtonLink href={`/nerd-herd/tickets/new?client=${customerId}`} size="sm"><Plus className="h-3.5 w-3.5" />New</ButtonLink>} />
          {a.tickets.length ? (
            <div className="divide-y divide-line border-t border-line">
              {a.tickets.slice(0, 10).map((t) => (
                <Link key={t.id} href={`/nerd-herd/tickets/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas">
                  <span className="min-w-0 truncate text-[0.8125rem] text-ink"><span className="text-ink-faint">#{t.number}</span> {t.subject}</span>
                  <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>
                </Link>
              ))}
            </div>
          ) : <div className="border-t border-line"><EmptyState title="No tickets yet" /></div>}
        </Card>

        <Card>
          <CardHeader title="Maintenance done" subtitle="Finished maintenance jobs and their checklists" />
          {a.maintenanceDone.length ? (
            <div className="divide-y divide-line border-t border-line">
              {a.maintenanceDone.slice(0, 12).map((t) => (
                <Link key={t.id} href={`/nerd-herd/tickets/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas">
                  <span className="min-w-0 truncate text-[0.8125rem] text-ink">{t.subject}{t.website ? <span className="text-ink-faint"> · {t.website}</span> : null}</span>
                  <span className="shrink-0 text-[0.75rem] text-ink-muted">{t.resolved_at ? fmtDateTime(t.resolved_at, tz, "date") : ""}</span>
                </Link>
              ))}
            </div>
          ) : <div className="border-t border-line"><EmptyState title="No maintenance recorded yet">Maintenance jobs finished in Nerd Herd show here.</EmptyState></div>}
        </Card>
      </div>

      {p && (
        <Card>
          <CardHeader title="Payment record" subtitle="We bill first and do the work once it's paid — this is how they pay" />
          <dl className="grid grid-cols-2 gap-4 border-t border-line px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Rating"><Badge tone={RATING[p.rating].tone}>{RATING[p.rating].label}</Badge></Field>
            <Field label="Pays on time">{p.onTimeRate === null ? "—" : `${Math.round(p.onTimeRate * 100)}%`}</Field>
            <Field label="Average days to pay">{p.avgDaysToPay ?? "—"}</Field>
            <Field label="Overdue">{p.overdueCount ? `${money(p.overdue, currency)} (${p.overdueCount}, oldest ${p.oldestOverdueDays} days)` : "Nothing"}</Field>
            <Field label="Last payment">{p.lastPaidAt ? fmtDateTime(p.lastPaidAt, tz, "date") : "—"}</Field>
            <Field label="Invoices">{p.invoices}</Field>
          </dl>
          {a.recentInvoices.length > 0 && (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-[0.8125rem]">
                <thead><tr className="text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint"><th className="px-5 py-2 font-medium">Invoice</th><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Due</th><th className="px-3 py-2 text-right font-medium">Total</th><th className="px-5 py-2 text-right font-medium">Owing</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {a.recentInvoices.map((i) => (
                    <tr key={i.id}>
                      <td className="px-5 py-2"><Link href={`/invoices/${i.id}`} className="text-brand-600 hover:underline">{i.number}</Link></td>
                      <td className="px-3 py-2 text-ink-muted">{fmtDate(i.issue_date)}</td>
                      <td className="px-3 py-2 text-ink-muted">{fmtDate(i.due_date)}</td>
                      <td className="tabular px-3 py-2 text-right">{money(i.total, currency)}</td>
                      <td className={`tabular px-5 py-2 text-right ${i.status === "overdue" ? "text-rose-700" : ""}`}>{i.status === "void" ? "void" : Number(i.balance ?? 0) > 0 ? money(i.balance ?? 0, currency) : "paid"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <div className="text-[0.7188rem] font-medium text-ink-muted">{label}</div>
      <div className={`mt-1 text-[1.25rem] font-semibold tracking-tight ${alert ? "text-rose-700" : "text-ink"}`}>{value}</div>
      {sub && <div className="truncate text-[0.7188rem] text-ink-faint">{sub}</div>}
    </div>
  );
}
