import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/records/filter-bar";
import { quoteNextAction } from "@/components/quotes/next-action";
import { quoteTotals } from "@/components/quotes/calc";
import { QUOTE_STATUS } from "@/lib/status";
import { fmtDate, fmtDateTime, money, relativeDay, todayISO } from "@/lib/format";
import type { QuoteStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Quotes" };

const FILTERS: QuoteStatus[] = ["draft", "sent", "viewed", "accepted", "declined", "expired"];

interface Row {
  id: string; number: number; title: string; status: QuoteStatus; expiry_date: string | null; created_at: string;
  has_unpublished_changes: boolean; current_version_id: string | null;
  customer: { id: string; name: string } | null;
  event: { id: string; number: number; name: string; event_date: string | null } | null;
  version: { version_number: number; total: number; published_at: string } | null;
  sections: { id: string; is_optional: boolean }[];
  items: { section_id: string; quantity: number; unit_price: number; discount_percent: number; tax_rate: number; is_optional: boolean }[];
}

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const tz = org.timezone;
  const today = todayISO(tz);
  const followUp = Number((org.settings as { quote_follow_up_days?: number })?.quote_follow_up_days ?? 3);

  const { data, error } = await supabase
    .from("quotes")
    .select("id, number, title, status, expiry_date, created_at, has_unpublished_changes, current_version_id, customer:customers(id, name), event:events(id, number, name, event_date), version:quote_versions!quotes_current_version_id_organisation_id_fkey(version_number, total, published_at), sections:quote_sections!quote_sections_quote_id_organisation_id_fkey(id, is_optional), items:quote_items!quote_items_quote_id_organisation_id_fkey(section_id, quantity, unit_price, discount_percent, tax_rate, is_optional)")
    .eq("organisation_id", org.id)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`Could not load quotes: ${error.message}`);
  const all = (data ?? []) as unknown as Row[];

  const counts = Object.fromEntries(FILTERS.map((s) => [s, all.filter((r) => r.status === s).length])) as Record<QuoteStatus, number>;
  const status = FILTERS.includes(sp.status as QuoteStatus) ? (sp.status as QuoteStatus) : null;
  const term = (sp.q ?? "").trim().toLowerCase().replace(/^q-/, "");
  const rows = all.filter((r) => {
    if (status && r.status !== status) return false;
    if (!term) return true;
    return [String(r.number), r.title, r.customer?.name, r.event?.name, r.event ? `ev-${r.event.number}` : ""]
      .some((f) => (f ?? "").toLowerCase().includes(term));
  });

  const qs = (s: string | null) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (sp.q) p.set("q", sp.q);
    const str = p.toString();
    return str ? `/quotes?${str}` : "/quotes";
  };

  return (
    <div>
      <PageHeader title="Quotes" subtitle="Draft privately, publish locked versions, and see where every proposal stands."
        actions={<ButtonLink href="/quotes/new" variant="primary">New quote</ButtonLink>} />
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
        <Link href={qs(null)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium",
          !status ? "bg-ink text-white" : "bg-white text-ink-muted ring-1 ring-inset ring-line hover:text-ink")}>
          All <span className={cn("rounded-full px-1.5 text-[10.5px] font-semibold", !status ? "bg-white/20" : "bg-zinc-100 text-ink-faint")}>{all.length}</span>
        </Link>
        {FILTERS.map((s) => (
          <Link key={s} href={qs(s)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium",
            status === s ? "bg-ink text-white" : "text-ink-muted hover:bg-white hover:text-ink")}>
            {QUOTE_STATUS[s].label}
            <span className={cn("tabular rounded-full px-1.5 text-[10.5px] font-semibold",
              status === s ? "bg-white/20 text-white" : counts[s] > 0 ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-ink-faint")}>{counts[s]}</span>
          </Link>
        ))}
      </div>
      <Card>
        <div className="border-b border-line px-4 py-3">
          <FilterBar searchPlaceholder="Search quote #, title, customer, event…" filters={[]} />
        </div>
        {rows.length === 0 ? (
          all.length === 0 ? (
            <EmptyState title="No quotes yet" action={<ButtonLink href="/quotes/new" variant="primary">Create your first quote</ButtonLink>}>
              Quotes belong to an event. Pick an event and build the proposal — the customer only sees it once you publish.
            </EmptyState>
          ) : <EmptyState title="No quotes match">Try a different status or search.</EmptyState>
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((r) => {
              const s = QUOTE_STATUS[r.status];
              const draftTotal = r.version ? null : quoteTotals(
                r.items.map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount_percent: Number(i.discount_percent), tax_rate: Number(i.tax_rate) })),
                new Set(r.sections.filter((x) => x.is_optional).map((x) => x.id))
              ).total;
              return (
                <li key={r.id}>
                  <Link href={`/quotes/${r.id}`} className="flex min-h-[56px] items-start gap-3 px-4 py-3 active:bg-zinc-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink"><span className="tabular text-ink-faint">Q-{r.number}</span> · {r.title}</div>
                      <div className="truncate text-[12.5px] text-ink-muted">{r.customer?.name ?? "—"}{r.event ? ` · ${r.event.name}` : ""}</div>
                      <div className="mt-0.5 truncate text-[12px] text-ink-faint">
                        {r.event?.event_date ? `${fmtDate(r.event.event_date)} · ${relativeDay(r.event.event_date, today)}` : "No event date"}
                        {r.has_unpublished_changes && r.version ? <span className="text-amber-700"> · Unpublished changes</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={s.tone} dot>{s.label}</Badge>
                      <span className={cn("tabular text-[12.5px]", r.version ? "text-ink" : "text-ink-muted")}>{money(r.version ? r.version.total : draftTotal, org.currency)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1180px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-ink-faint">
                  {["Quote", "Title", "Customer", "Event", "Event date", "Total", "Status", "Last sent", "Expiry", "Next action"].map((h) => (
                    <th key={h} className={cn("whitespace-nowrap px-4 py-2.5 font-medium", h === "Total" && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const s = QUOTE_STATUS[r.status];
                  const na = quoteNextAction({ ...r, itemCount: r.items.length }, r.version?.published_at ?? null, today, followUp);
                  const draftTotal = r.version ? null : quoteTotals(
                    r.items.map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount_percent: Number(i.discount_percent), tax_rate: Number(i.tax_rate) })),
                    new Set(r.sections.filter((x) => x.is_optional).map((x) => x.id))
                  ).total;
                  const expiring = r.expiry_date && ["sent", "viewed"].includes(r.status) ? r.expiry_date : null;
                  return (
                    <tr key={r.id} className="relative hover:bg-zinc-50/70">
                      <td className="tabular whitespace-nowrap px-4 py-3 font-medium text-ink">
                        <Link href={`/quotes/${r.id}`} className="after:absolute after:inset-0 hover:text-brand-700">Q-{r.number}</Link>
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <span className="block truncate text-ink">{r.title}</span>
                        {r.has_unpublished_changes && r.version && <span className="text-[11.5px] text-amber-700">Unpublished changes</span>}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-ink-muted">{r.customer?.name ?? "—"}</td>
                      <td className="max-w-[200px] px-4 py-3">
                        {r.event ? (
                          <Link href={`/events/${r.event.id}?tab=quote`} className="relative z-10 block truncate text-ink-muted hover:text-brand-700">{r.event.name}</Link>
                        ) : "—"}
                        {r.event && <span className="tabular text-[11.5px] text-ink-faint">EV-{r.event.number}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="block text-ink">{fmtDate(r.event?.event_date)}</span>
                        {r.event?.event_date && <span className="text-[11.5px] text-ink-faint">{relativeDay(r.event.event_date, today)}</span>}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right">
                        {r.version ? (
                          <>
                            <span className="block text-ink">{money(r.version.total, org.currency)}</span>
                            <span className="text-[11.5px] text-ink-faint">v{r.version.version_number}</span>
                          </>
                        ) : (
                          <>
                            <span className="block text-ink-muted">{money(draftTotal, org.currency)}</span>
                            <span className="text-[11.5px] text-ink-faint">draft</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3"><Badge tone={s.tone} dot>{s.label}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{r.version ? fmtDateTime(r.version.published_at, tz, "date") : <span className="text-ink-faint">Not sent</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={cn("block", expiring && expiring < today ? "font-medium text-rose-700" : "text-ink-muted")}>{fmtDate(r.expiry_date)}</span>
                        {expiring && <span className="text-[11.5px] text-ink-faint">{relativeDay(expiring, today)}</span>}
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <span className={cn("block truncate", na.urgency === "overdue" ? "font-medium text-rose-700" : na.urgency === "soon" ? "font-medium text-amber-800" : na.urgency === "done" ? "text-ink-faint" : "text-ink")}>{na.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-faint">{rows.length} quote{rows.length === 1 ? "" : "s"}{status || term ? ` of ${all.length}` : ""}</div>
      </Card>
    </div>
  );
}
