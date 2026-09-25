import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { BarList, ChartFrame, DataTable, Funnel, Legend, SERIES, STATUS, Stat } from "./charts";
import { ColumnChart } from "./column-chart";
import { ENQUIRY_SOURCE } from "@/lib/status";
import { addDaysISO, daysBetween, fmtDate, money, todayISO, zonedMidnightUTC } from "@/lib/format";
import type { EnquirySource, EnquiryStatus, QuoteStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Reports" };

type Period = "month" | "3m" | "12m" | "custom";
const PRESETS: { key: Exclude<Period, "custom">; label: string }[] = [
  { key: "month", label: "This month" }, { key: "3m", label: "Last 3 months" }, { key: "12m", label: "Last 12 months" },
];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function monthStart(iso: string, back: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return d.toISOString().slice(0, 10);
}
function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let cur = from.slice(0, 7) + "-01";
  while (cur.slice(0, 7) <= to.slice(0, 7)) { out.push(cur.slice(0, 7)); cur = monthStart(cur, -1); }
  return out;
}
const monthLabel = (ym: string, withYear: boolean) =>
  new Intl.DateTimeFormat("en-AU", { month: "short", year: withYear ? "2-digit" : undefined, timeZone: "UTC" }).format(new Date(ym + "-01T00:00:00Z"));
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const hours = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h < 10 ? h.toFixed(1) : Math.round(h)} h` : `${(h / 24).toFixed(1)} days`);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const tz = org.timezone;
  const cur = org.currency;
  const today = todayISO(tz);

  // ---- Period (org-local calendar dates, inclusive) -----------------------
  let period: Period = (["month", "3m", "12m", "custom"] as const).includes(sp.period as Period) ? (sp.period as Period) : "3m";
  let from: string;
  let to = today;
  let rangeError: string | null = null;
  if (period === "custom") {
    const f = sp.from && ISO_RE.test(sp.from) ? sp.from : null;
    const t = sp.to && ISO_RE.test(sp.to) ? sp.to : null;
    if (!f || !t || f > t || daysBetween(f, t) > 366 * 3) {
      rangeError = "That custom range isn’t valid (the start must be before the end, up to three years). Showing the last 3 months.";
      period = "3m";
      from = monthStart(today, 2);
    } else { from = f; to = t; }
  } else {
    from = period === "month" ? monthStart(today, 0) : period === "3m" ? monthStart(today, 2) : monthStart(today, 11);
  }
  const startUTC = zonedMidnightUTC(from, tz);
  const endUTC = zonedMidnightUTC(addDaysISO(to, 1), tz);
  const months = monthsBetween(from, to);
  const multiYear = months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
  const localMonth = (ts: string) => todayISO(tz, new Date(ts)).slice(0, 7);

  // ---- Data ----------------------------------------------------------------
  const [enqRes, pubRes, payRes, acceptedRes, eventsRes, openInvRes, allPayRes] = await Promise.all([
    supabase.from("enquiries").select("id, source, status, received_at, event_id")
      .eq("organisation_id", org.id).gte("received_at", startUTC).lt("received_at", endUTC).limit(5000),
    supabase.from("quote_versions").select("id, quote_id, status, total, published_at, responded_at")
      .eq("organisation_id", org.id).gte("published_at", startUTC).lt("published_at", endUTC).limit(5000),
    supabase.from("payments").select("amount, paid_at").eq("organisation_id", org.id).gte("paid_at", startUTC).lt("paid_at", endUTC).limit(10000),
    supabase.from("quote_versions").select("total, quote:quotes!quote_versions_quote_id_organisation_id_fkey(event:events(event_date))")
      .eq("organisation_id", org.id).eq("status", "accepted").limit(10000),
    supabase.from("events").select("id, event_type, status").eq("organisation_id", org.id).gte("event_date", from).lte("event_date", to).neq("status", "cancelled").limit(5000),
    supabase.from("invoices").select("id, number, balance, due_date, status, customer:customers(id, name)")
      .eq("organisation_id", org.id).in("status", ["awaiting_payment", "part_paid", "overdue"]).gt("balance", 0).limit(5000),
    supabase.from("payments").select("amount, paid_at, invoice:invoices(customer:customers(id, name))").eq("organisation_id", org.id).limit(20000),
  ]);
  const enquiries = must<Row[]>(enqRes, "enquiries") as { id: string; source: EnquirySource; status: EnquiryStatus; received_at: string; event_id: string | null }[];
  const published = must<Row[]>(pubRes, "quotes") as { id: string; quote_id: string; status: QuoteStatus; total: number; published_at: string; responded_at: string | null }[];
  const payments = must<Row[]>(payRes, "payments") as { amount: number; paid_at: string }[];
  const accepted = must<Row[]>(acceptedRes, "accepted quotes") as { total: number; quote: { event: { event_date: string | null } | null } | null }[];
  const events = must<Row[]>(eventsRes, "events") as { id: string; event_type: string | null; status: string }[];
  const openInvoices = must<Row[]>(openInvRes, "invoices") as { id: string; number: string; balance: number; due_date: string | null; status: string; customer: { id: string; name: string } | null }[];
  const allPayments = must<Row[]>(allPayRes, "payments") as { amount: number; paid_at: string; invoice: { customer: { id: string; name: string } | null } | null }[];

  // Quote versions for the events these enquiries became, and first replies — both keyed off the enquiries.
  const enqEventIds = [...new Set(enquiries.map((e) => e.event_id).filter(Boolean) as string[])];
  const [enqVersionsRes, repliesRes, bookedEventsRes] = await Promise.all([
    enqEventIds.length
      ? supabase.from("quote_versions").select("status, quote:quotes!quote_versions_quote_id_organisation_id_fkey!inner(event_id)")
        .eq("organisation_id", org.id).in("quote.event_id", enqEventIds)
      : Promise.resolve({ data: [], error: null }),
    enquiries.length
      ? supabase.from("activity_logs").select("enquiry_id, created_at").eq("organisation_id", org.id).eq("action", "email.replied")
        .in("enquiry_id", enquiries.map((e) => e.id)).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    events.length
      ? supabase.from("quote_versions").select("total, quote:quotes!quote_versions_quote_id_organisation_id_fkey!inner(event_id)")
        .eq("organisation_id", org.id).eq("status", "accepted").in("quote.event_id", events.map((e) => e.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  const enqVersions = must<Row[]>(enqVersionsRes, "quote history") as { status: QuoteStatus; quote: { event_id: string } }[];
  const replies = must<Row[]>(repliesRes, "reply history") as { enquiry_id: string; created_at: string }[];
  const bookedByEvent = new Map<string, number>();
  for (const v of must<Row[]>(bookedEventsRes, "booked quotes") as { total: number; quote: { event_id: string } }[]) {
    bookedByEvent.set(v.quote.event_id, (bookedByEvent.get(v.quote.event_id) ?? 0) + Number(v.total));
  }

  // ---- Enquiries: source, funnel ------------------------------------------
  const quotedEvents = new Set(enqVersions.map((v) => v.quote.event_id));
  const acceptedEvents = new Set(enqVersions.filter((v) => v.status === "accepted").map((v) => v.quote.event_id));
  const isQuoted = (e: (typeof enquiries)[number]) => ["quote_sent", "negotiating", "won"].includes(e.status) || (e.event_id != null && quotedEvents.has(e.event_id));
  const isWon = (e: (typeof enquiries)[number]) => e.status === "won" || (e.event_id != null && acceptedEvents.has(e.event_id));
  const bySource = Object.keys(ENQUIRY_SOURCE).map((s) => {
    const list = enquiries.filter((e) => e.source === s);
    return { source: s as EnquirySource, count: list.length, won: list.filter(isWon).length };
  }).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const funnel = [
    { label: "Enquiries received", value: enquiries.length },
    { label: "Quoted", value: enquiries.filter(isQuoted).length },
    { label: "Accepted / won", value: enquiries.filter(isWon).length },
  ];

  // ---- Quotes: win rate & time to accept --------------------------------
  const decided = published.filter((v) => ["accepted", "declined", "expired"].includes(v.status));
  const acceptedInPeriod = published.filter((v) => v.status === "accepted");
  const awaiting = published.filter((v) => v.status === "sent" || v.status === "viewed");
  const acceptDays = acceptedInPeriod.filter((v) => v.responded_at).map((v) => (Date.parse(v.responded_at!) - Date.parse(v.published_at)) / 86400000);
  const avgAccept = acceptDays.length ? acceptDays.reduce((s, d) => s + d, 0) / acceptDays.length : null;

  // ---- Money by month ----------------------------------------------------
  const revenue = new Map(months.map((m) => [m, 0]));
  for (const p of payments) { const m = localMonth(p.paid_at); if (revenue.has(m)) revenue.set(m, revenue.get(m)! + Number(p.amount)); }
  const booked = new Map(months.map((m) => [m, 0]));
  for (const v of accepted) {
    const d = v.quote?.event?.event_date;
    if (d && d >= from && d <= to) booked.set(d.slice(0, 7), (booked.get(d.slice(0, 7)) ?? 0) + Number(v.total));
  }
  const revenueTotal = [...revenue.values()].reduce((s, n) => s + n, 0);
  const bookedTotal = [...booked.values()].reduce((s, n) => s + n, 0);
  const monthGroups = months.map((m) => ({ key: m, label: monthLabel(m, multiYear || months.length > 12), values: [revenue.get(m) ?? 0, booked.get(m) ?? 0] }));

  // ---- Events by type ------------------------------------------------------
  const typeMap = new Map<string, { count: number; value: number }>();
  for (const e of events) {
    const k = e.event_type ?? "Not set";
    const t = typeMap.get(k) ?? { count: 0, value: 0 };
    t.count += 1; t.value += bookedByEvent.get(e.id) ?? 0;
    typeMap.set(k, t);
  }
  const byType = [...typeMap.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.count - a.count);

  // ---- Aging (as of today, not period-bound) ------------------------------
  const buckets = [
    { key: "current", label: "Not yet due", color: STATUS.neutral, test: (d: number) => d <= 0 },
    { key: "0-30", label: "1–30 days overdue", color: STATUS.warning, test: (d: number) => d >= 1 && d <= 30 },
    { key: "31-60", label: "31–60 days overdue", color: STATUS.serious, test: (d: number) => d >= 31 && d <= 60 },
    { key: "60+", label: "60+ days overdue", color: STATUS.critical, test: (d: number) => d > 60 },
  ].map((b) => {
    const list = openInvoices.filter((i) => b.test(i.due_date ? daysBetween(i.due_date, today) : 0));
    return { ...b, count: list.length, value: list.reduce((s, i) => s + Number(i.balance), 0) };
  });
  const outstanding = openInvoices.reduce((s, i) => s + Number(i.balance), 0);
  const overdueTotal = buckets.slice(1).reduce((s, b) => s + b.value, 0);

  // ---- Top customers by lifetime value -------------------------------------
  const ltv = new Map<string, { id: string; name: string; total: number; period: number; last: string }>();
  for (const p of allPayments) {
    const c = p.invoice?.customer;
    if (!c) continue;
    const r = ltv.get(c.id) ?? { id: c.id, name: c.name, total: 0, period: 0, last: p.paid_at };
    r.total += Number(p.amount);
    if (p.paid_at >= startUTC && p.paid_at < endUTC) r.period += Number(p.amount);
    if (p.paid_at > r.last) r.last = p.paid_at;
    ltv.set(c.id, r);
  }
  const topCustomers = [...ltv.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  const topMax = topCustomers[0]?.total ?? 0;

  // ---- Response time -------------------------------------------------------
  const firstReply = new Map<string, number>();
  const receivedAt = new Map(enquiries.map((e) => [e.id, Date.parse(e.received_at)]));
  for (const r of replies) {
    const rec = receivedAt.get(r.enquiry_id);
    const t = Date.parse(r.created_at);
    if (rec == null || t < rec || firstReply.has(r.enquiry_id)) continue;
    firstReply.set(r.enquiry_id, (t - rec) / 3600000);
  }
  const responseHours = [...firstReply.values()];
  const respBuckets = [
    { label: "Under 1 hour", test: (h: number) => h < 1 },
    { label: "1–4 hours", test: (h: number) => h >= 1 && h < 4 },
    { label: "4–24 hours", test: (h: number) => h >= 4 && h < 24 },
    { label: "1–3 days", test: (h: number) => h >= 24 && h < 72 },
    { label: "Over 3 days", test: (h: number) => h >= 72 },
  ].map((b) => ({ label: b.label, value: responseHours.filter(b.test).length }));
  const unanswered = enquiries.filter((e) => !firstReply.has(e.id) && ["new", "needs_review"].includes(e.status)).length;
  const med = median(responseHours);

  const rangeLabel = `${fmtDate(from)} – ${fmtDate(to)}`;
  const m0 = (n: number) => money(n, cur, { cents: false });

  return (
    <div>
      <PageHeader title="Reports" subtitle="How the business is really going." />

      {/* One filter row scopes everything below it */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <nav className="inline-flex rounded-lg bg-zinc-100 p-0.5" aria-label="Report period">
          {PRESETS.map((p) => (
            <Link key={p.key} href={p.key === "3m" ? "/reports" : `/reports?period=${p.key}`} scroll={false} aria-current={period === p.key ? "page" : undefined}
              className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium", period === p.key ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
              {p.label}
            </Link>
          ))}
        </nav>
        <form action="/reports" className={cn("flex flex-wrap items-center gap-2 rounded-lg px-1 py-0.5", period === "custom" && "bg-brand-50/60 ring-1 ring-inset ring-brand-100")}>
          <input type="hidden" name="period" value="custom" />
          <label className="sr-only" htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={from} max={today} className={cn(inputClass, "h-8 w-[140px] py-0 text-[12.5px]")} />
          <span className="text-[12px] text-ink-faint">to</span>
          <label className="sr-only" htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={to} className={cn(inputClass, "h-8 w-[140px] py-0 text-[12.5px]")} />
          <Button size="sm" variant={period === "custom" ? "primary" : "secondary"}>Apply</Button>
        </form>
        <span className="text-[12px] text-ink-faint">{rangeLabel}</span>
      </div>
      {rangeError && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-inset ring-amber-100">{rangeError}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue received" value={m0(revenueTotal)} sub={`${payments.length} payment${payments.length === 1 ? "" : "s"}`} />
        <Stat label="Booked value" value={m0(bookedTotal)} sub="Accepted quotes, by event date" />
        <Stat label="Enquiries" value={enquiries.length} sub={`${pct(funnel[2].value, enquiries.length)} converted to won`} />
        <Stat label="Outstanding today" value={m0(outstanding)} alert={overdueTotal > 0} sub={overdueTotal > 0 ? `${m0(overdueTotal)} overdue` : "Nothing overdue"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartFrame className="xl:col-span-2" title="Revenue and booked value by month"
          subtitle="Revenue = payments received. Booked = accepted quotes, placed in the month of the event."
          action={<Legend items={[{ label: "Revenue received", color: SERIES[0] }, { label: "Booked value", color: SERIES[1] }]} />}
          table={<DataTable head={["Month", "Revenue received", "Booked value"]} align={["left", "right", "right"]}
            rows={[...monthGroups.map((g) => [monthLabel(g.key, true), m0(g.values[0]), m0(g.values[1])]), [<b key="t">Total</b>, <b key="r">{m0(revenueTotal)}</b>, <b key="b">{m0(bookedTotal)}</b>]]} />}>
          <ColumnChart groups={monthGroups} series={[{ label: "Revenue received", color: SERIES[0] }, { label: "Booked value", color: SERIES[1] }]} currency={cur} />
        </ChartFrame>

        <ChartFrame title="Enquiries by source" subtitle="How many came in from each channel, and how many were won"
          table={<DataTable head={["Source", "Enquiries", "Won", "Conversion"]} align={["left", "right", "right", "right"]}
            rows={bySource.map((r) => [ENQUIRY_SOURCE[r.source], r.count, r.won, pct(r.won, r.count)])} />}>
          <BarList rows={bySource.map((r) => ({ label: ENQUIRY_SOURCE[r.source], value: r.count, note: <span title="Won ÷ received">{r.won} won · {pct(r.won, r.count)}</span> }))} />
        </ChartFrame>

        <ChartFrame title="Pipeline conversion" subtitle="Enquiries received in the period and how far they got"
          table={<DataTable head={["Stage", "Enquiries", "% of received", "% of previous"]} align={["left", "right", "right", "right"]}
            rows={funnel.map((s, i) => [s.label, s.value, pct(s.value, funnel[0].value), i ? pct(s.value, funnel[i - 1].value) : "—"])} />}>
          <Funnel stages={funnel} />
        </ChartFrame>

        <ChartFrame title="Quote win rate" subtitle="Quote versions sent in the period">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Win rate" value={pct(acceptedInPeriod.length, decided.length)} sub={decided.length ? `${acceptedInPeriod.length} of ${decided.length} decided` : "No decisions yet"} />
            <Stat label="Average time to accept" value={avgAccept == null ? "—" : avgAccept < 1 ? `${Math.max(1, Math.round(avgAccept * 24))} h` : `${avgAccept.toFixed(1)} days`} sub={acceptDays.length ? `Across ${acceptDays.length} accepted` : "No accepted quotes"} />
            <Stat label="Sent" value={published.length} sub={`${m0(published.reduce((s, v) => s + Number(v.total), 0))} quoted`} />
            <Stat label="Awaiting reply" value={awaiting.length} sub={`${m0(awaiting.reduce((s, v) => s + Number(v.total), 0))} open`} />
          </div>
          <p className="mt-3 text-[11.5px] text-ink-faint">Win rate counts accepted ÷ (accepted + declined + expired). Versions replaced by a newer version are excluded.</p>
        </ChartFrame>

        <ChartFrame title="Events by type" subtitle="Events dated in the period (cancelled excluded), with accepted quote value"
          table={<DataTable head={["Type", "Events", "Booked value"]} align={["left", "right", "right"]} rows={byType.map((t) => [t.type, t.count, m0(t.value)])} />}>
          <BarList rows={byType.map((t) => ({ label: t.type, value: t.count, note: t.value ? m0(t.value) : "—" }))} empty="No events dated in this period." />
        </ChartFrame>

        <ChartFrame title="Outstanding and overdue" subtitle={`As of today · ${m0(outstanding)} across ${openInvoices.length} invoice${openInvoices.length === 1 ? "" : "s"}`}
          action={<Link href="/invoices" className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">Invoices</Link>}
          table={<DataTable head={["Age", "Invoices", "Balance"]} align={["left", "right", "right"]} rows={buckets.map((b) => [b.label, b.count, m0(b.value)])} />}>
          <BarList rows={buckets.map((b) => ({ label: b.label, value: b.value, color: b.color, note: `${b.count} inv.` }))} format={m0} empty="Nothing outstanding — every invoice is paid." />
          {openInvoices.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {[...openInvoices].filter((i) => i.due_date && i.due_date < today).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 4).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                  <span className="min-w-0 truncate">
                    {i.customer ? <Link href={`/clients/${i.customer.id}?tab=invoices`} className="font-medium text-ink hover:text-brand-700">{i.customer.name}</Link> : "—"}
                    <span className="text-ink-faint"> · <Link href={`/invoices/${i.id}`} className="hover:text-brand-700">{i.number}</Link> · {daysBetween(i.due_date!, today)} days overdue</span>
                  </span>
                  <span className="tabular shrink-0 font-medium text-ink">{money(i.balance, cur)}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartFrame>

        <ChartFrame title="Top customers by lifetime value" subtitle="All payments ever received; the period column shows this range only"
          table={<DataTable head={["Customer", "Lifetime value", "In period", "Last payment"]} align={["left", "right", "right", "right"]}
            rows={topCustomers.map((c) => [c.name, m0(c.total), m0(c.period), fmtDate(todayISO(tz, new Date(c.last)))])} />}>
          {topCustomers.length === 0 ? <p className="py-6 text-center text-[12.5px] text-ink-muted">No payments recorded yet.</p> : (
            <ol className="space-y-2">
              {topCustomers.map((c, i) => (
                <li key={c.id} className="grid grid-cols-[18px_minmax(90px,34%)_1fr] items-center gap-3 text-[12.5px]">
                  <span className="tabular text-ink-faint">{i + 1}</span>
                  <Link href={`/clients/${c.id}`} className="truncate text-ink hover:text-brand-700">{c.name}</Link>
                  <span className="flex min-w-0 items-center gap-2" title={`${c.name}: ${m0(c.total)} lifetime, ${m0(c.period)} in period`}>
                    <span className="block h-[14px] min-w-[2px] rounded-r-[4px]" style={{ width: `${(c.total / topMax) * 100}%`, background: SERIES[0] }} />
                    <span className="tabular shrink-0 font-medium text-ink">{m0(c.total)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </ChartFrame>

        <ChartFrame title="Response time" subtitle="From enquiry received to the first email reply"
          table={responseHours.length ? <DataTable head={["Time to first reply", "Enquiries"]} align={["left", "right"]} rows={respBuckets.map((b) => [b.label, b.value])} /> : undefined}>
          {responseHours.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-muted">
              No replies recorded for enquiries in this period yet. Response times appear once replies are sent or synced from Gmail.
            </p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <Stat label="Median" value={med == null ? "—" : hours(med)} />
                <Stat label="Within 4 hours" value={pct(responseHours.filter((h) => h < 4).length, responseHours.length)} />
                <Stat label="Still waiting" value={unanswered} alert={unanswered > 0} sub="New, no reply yet" />
              </div>
              <BarList rows={respBuckets} format={(n) => `${n}`} />
            </>
          )}
        </ChartFrame>
      </div>
      <p className="mt-6 text-[11.5px] text-ink-faint">
        Figures are calculated from records in EventureOS{org.currency ? ` in ${org.currency}` : ""}, using your organisation’s timezone ({tz}). Money figures include GST.
      </p>
    </div>
  );
}
