import Link from "next/link";
import { requireOrg, getMembers } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/records/filter-bar";
import { EVENT_STATUS, EVENT_STATUS_ORDER, QUOTE_STATUS } from "@/lib/status";
import { eventNextAction } from "@/lib/next-action";
import { daysBetween, fmtDate, money, relativeDay, timeRange, todayISO } from "@/lib/format";
import type { EventRecord, EventStatus, InvoiceStatus, QuoteStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Events" };

type Row = EventRecord & {
  customer: { name: string } | null;
  quotes: { status: QuoteStatus; has_unpublished_changes: boolean; version: { total: number } | null }[];
  invoices: { status: InvoiceStatus; balance: number }[];
};

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string; q?: string; assignee?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const members = await getMembers(org.id);
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const today = todayISO(org.timezone);
  const view = sp.status ? "status" : sp.view ?? "upcoming";

  let query = supabase
    .from("events")
    .select("*, customer:customers(name), quotes(status, has_unpublished_changes, version:quote_versions!quotes_current_version_id_organisation_id_fkey(total)), invoices(status, balance)")
    .eq("organisation_id", org.id)
    .limit(500);
  if (view === "upcoming") query = query.gte("event_date", today).neq("status", "cancelled").order("event_date").order("start_time");
  else if (view === "past") query = query.lt("event_date", today).order("event_date", { ascending: false });
  else query = query.order("event_date", { ascending: false });
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.assignee) query = query.eq("assigned_to", sp.assignee);
  if (sp.q) {
    const term = sp.q.replace(/[,()%"\\]/g, " ").trim();
    if (term) query = query.or(["name", "venue", "address", "event_type"].map((c) => `${c}.ilike."%${term}%"`).join(","));
  }
  const { data, error } = await query;
  if (error) throw new Error(`Could not load events: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];

  const pills = [
    { key: "upcoming", label: "Upcoming", href: "/events" },
    { key: "past", label: "Past", href: "/events?view=past" },
    { key: "all", label: "All", href: "/events?view=all" },
  ];

  return (
    <div>
      <PageHeader title="Events" subtitle="Every booking, from first enquiry to final payment." actions={<ButtonLink href="/events/new" variant="primary">New event</ButtonLink>} />
      <div className="mb-4 flex flex-wrap gap-1">
        {pills.map((p) => (
          <Link key={p.key} href={p.href} className={cn("rounded-full px-3 py-1.5 text-[12.5px] font-medium",
            view === p.key ? "bg-ink text-white" : "bg-white text-ink-muted ring-1 ring-inset ring-line hover:text-ink")}>{p.label}</Link>
        ))}
        <span className="mx-2 w-px self-stretch bg-line" />
        {EVENT_STATUS_ORDER.map((s) => (
          <Link key={s} href={`/events?status=${s}`} className={cn("rounded-full px-3 py-1.5 text-[12.5px] font-medium",
            sp.status === s ? "bg-ink text-white" : "text-ink-muted hover:bg-white hover:text-ink")}>{EVENT_STATUS[s].label}</Link>
        ))}
      </div>
      <Card>
        <div className="border-b border-line px-4 py-3">
          <FilterBar searchPlaceholder="Search event, venue, type…"
            filters={[{ key: "assignee", label: "Lead", options: members.map((m) => ({ value: m.id, label: m.full_name ?? m.email })) }]} />
        </div>
        {rows.length === 0 ? <EmptyState title="No events here" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-ink-faint">
                  {["Date", "Event", "Customer", "Venue", "Guests", "Status", "Quote", "Balance", "Lead", "Next action"].map((h) => (
                    <th key={h} className={cn("whitespace-nowrap px-4 py-2.5 font-medium", ["Quote", "Balance", "Guests"].includes(h) && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((e) => {
                  const s = EVENT_STATUS[e.status as EventStatus];
                  const quote = e.quotes[0];
                  const balance = e.invoices.reduce((a, i) => a + (i.status === "void" ? 0 : Number(i.balance)), 0);
                  const na = eventNextAction({ ...e, quote, invoices: e.invoices, daysUntil: e.event_date ? daysBetween(today, e.event_date) : null });
                  return (
                    <tr key={e.id} className="relative hover:bg-zinc-50/70">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="block text-ink">{fmtDate(e.event_date)}</span>
                        <span className="text-[12px] text-ink-faint">{relativeDay(e.event_date, today)}{e.start_time ? ` · ${timeRange(e.start_time, e.finish_time)}` : ""}</span>
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <Link href={`/events/${e.id}`} className="block truncate font-medium text-ink after:absolute after:inset-0">{e.name}</Link>
                        <span className="text-[12px] text-ink-faint">EV-{e.number}{e.event_type ? ` · ${e.event_type}` : ""}</span>
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-ink-muted">{e.customer?.name}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-ink-muted">{e.venue ?? "—"}</td>
                      <td className="tabular px-4 py-3 text-right text-ink-muted">{e.guest_count ?? "—"}</td>
                      <td className="px-4 py-3"><Badge tone={s.tone} dot>{s.label}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {quote ? (
                          <span className="flex items-center justify-end gap-2">
                            {quote.version && <span className="tabular text-ink">{money(quote.version.total, org.currency, { cents: false })}</span>}
                            <Badge tone={QUOTE_STATUS[quote.status].tone}>{QUOTE_STATUS[quote.status].label}</Badge>
                          </span>
                        ) : <span className="text-ink-faint">None</span>}
                      </td>
                      <td className={cn("tabular whitespace-nowrap px-4 py-3 text-right", e.invoices.some((i) => i.status === "overdue") ? "font-medium text-rose-700" : "text-ink")}>
                        {e.invoices.length ? money(balance, org.currency) : "—"}
                      </td>
                      <td className="px-4 py-3">{e.assigned_to && <span className="flex items-center gap-2 whitespace-nowrap text-ink-muted"><Avatar name={names[e.assigned_to]} size={20} />{names[e.assigned_to]?.split(" ")[0]}</span>}</td>
                      <td className="max-w-[220px] px-4 py-3">
                        <span className={cn("block truncate", na.urgency === "overdue" ? "font-medium text-rose-700" : na.urgency === "done" ? "text-ink-faint" : "text-ink")}>{na.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-faint">{rows.length} event{rows.length === 1 ? "" : "s"}</div>
      </Card>
    </div>
  );
}
