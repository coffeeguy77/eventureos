import Link from "next/link";
import { requireOrg, getMembers } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Kpi } from "@/components/records/kpi";
import { PipelineBoard, type BoardCard, type BoardColumn } from "./board";
import { PIPELINE_ENQUIRY_STAGES, PIPELINE_EVENT_STAGES } from "./stages";
import { enquiryNextAction, eventNextAction } from "@/lib/next-action";
import { ENQUIRY_STATUS, EVENT_STATUS } from "@/lib/status";
import { addDaysISO, compactMoney, daysBetween, fmtDate, relativeDay, todayISO } from "@/lib/format";
import type { EnquiryStatus, EventStatus, InvoiceStatus, QuoteStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "CRM" };

const WON_WINDOW_DAYS = 60;
const COMPLETED_WINDOW_DAYS = 60;

type QuoteLite = { event_id: string; status: QuoteStatus; has_unpublished_changes: boolean; version: { total: number } | null };

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ view?: string; owner?: string }> }) {
  const sp = await searchParams;
  const view: "enquiries" | "events" = sp.view === "events" ? "events" : "enquiries";
  const mine = sp.owner === "me";
  const { supabase, org, user } = await requireOrg();
  const tz = org.timezone;
  const today = todayISO(tz);
  const members = await getMembers(org.id);
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const nowMs = Date.now();
  const daysSince = (ts: string) => Math.max(0, Math.floor((nowMs - Date.parse(ts)) / 86400000));

  let columns: BoardColumn[];
  let cards: BoardCard[];

  if (view === "enquiries") {
    const wonSince = new Date(nowMs - WON_WINDOW_DAYS * 86400000).toISOString();
    let q = supabase.from("enquiries")
      .select("id, number, title, status, source, received_at, updated_at, event_date, budget, assigned_to, next_action, next_action_due, event_id, customer_id, contact_name, company, customer:customers(name), event:events!enquiries_event_id_organisation_id_fkey(id, name, event_date)")
      .eq("organisation_id", org.id)
      .or(`status.in.(new,needs_review,contacted,qualified,quote_required,quote_sent,negotiating),and(status.eq.won,updated_at.gte.${wonSince})`)
      .order("received_at", { ascending: false }).limit(500);
    if (mine) q = q.eq("assigned_to", user.id);
    const { data, error } = await q;
    if (error) throw new Error(`Could not load the pipeline: ${error.message}`);
    const rows = (data ?? []) as unknown as {
      id: string; number: number; title: string; status: EnquiryStatus; received_at: string; updated_at: string; event_date: string | null;
      budget: number | null; assigned_to: string | null; next_action: string | null; next_action_due: string | null; event_id: string | null;
      customer_id: string | null; contact_name: string | null; company: string | null; customer: { name: string } | null;
      event: { id: string; name: string; event_date: string | null } | null;
    }[];

    const eventIds = rows.map((r) => r.event_id).filter(Boolean) as string[];
    const [quotesRes, logsRes] = await Promise.all([
      eventIds.length
        ? supabase.from("quotes").select("event_id, status, has_unpublished_changes, version:quote_versions!quotes_current_version_id_organisation_id_fkey(total)").eq("organisation_id", org.id).in("event_id", eventIds).neq("status", "superseded")
        : Promise.resolve({ data: [], error: null }),
      rows.length
        ? supabase.from("activity_logs").select("enquiry_id, created_at").eq("organisation_id", org.id).in("enquiry_id", rows.map((r) => r.id))
          .in("action", ["enquiry.status_changed", "quote.sent", "enquiry.converted"]).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (quotesRes.error) throw new Error(`Could not load quotes: ${quotesRes.error.message}`);
    if (logsRes.error) throw new Error(`Could not load pipeline history: ${logsRes.error.message}`);
    const quoteByEvent = new Map<string, QuoteLite>();
    for (const qt of (quotesRes.data ?? []) as unknown as QuoteLite[]) if (!quoteByEvent.has(qt.event_id) || qt.version) quoteByEvent.set(qt.event_id, qt);
    const stageSince = new Map<string, string>();
    for (const l of (logsRes.data ?? []) as { enquiry_id: string; created_at: string }[]) if (!stageSince.has(l.enquiry_id)) stageSince.set(l.enquiry_id, l.created_at);

    columns = PIPELINE_ENQUIRY_STAGES.map((s) => ({
      key: s, label: ENQUIRY_STATUS[s].label, tone: ENQUIRY_STATUS[s].tone,
      hint: s === "won" ? `Last ${WON_WINDOW_DAYS} days` : s === "new" ? "Includes enquiries needing review" : undefined,
    }));
    cards = rows.map((r) => {
      const quote = r.event_id ? quoteByEvent.get(r.event_id) : undefined;
      const date = r.event?.event_date ?? r.event_date;
      const na = enquiryNextAction(r);
      return {
        id: r.id,
        column: r.status === "needs_review" ? "new" : r.status,
        status: r.status,
        statusLabel: r.status === "needs_review" ? "Needs review" : undefined,
        href: `/enquiries/${r.id}`,
        ref: `ENQ-${r.number}`,
        title: r.title,
        customer: r.customer?.name ?? r.company ?? r.contact_name ?? "Unknown sender",
        date: date ? fmtDate(date) : null,
        dateHint: date ? relativeDay(date, today) : null,
        value: quote?.version ? Number(quote.version.total) : r.budget != null ? Number(r.budget) : null,
        valueKind: quote?.version ? "quote" : r.budget != null ? "budget" : null,
        daysInStage: daysSince(stageSince.get(r.id) ?? r.received_at),
        owner: r.assigned_to ? names[r.assigned_to] ?? "Team member" : null,
        nextAction: r.status === "won" && r.event ? `Manage ${r.event.name}` : na.label,
        urgency: na.urgency,
      };
    });
  } else {
    const completedSince = addDaysISO(today, -COMPLETED_WINDOW_DAYS);
    let q = supabase.from("events")
      .select("id, number, name, status, event_date, created_at, budget, assigned_to, next_action, next_action_due, customer:customers(name)")
      .eq("organisation_id", org.id)
      .or(`status.in.(planning,quoted,awaiting_approval,confirmed),and(status.eq.completed,event_date.gte.${completedSince})`)
      .order("event_date", { ascending: true, nullsFirst: false }).limit(500);
    if (mine) q = q.eq("assigned_to", user.id);
    const { data, error } = await q;
    if (error) throw new Error(`Could not load events: ${error.message}`);
    const rows = (data ?? []) as unknown as {
      id: string; number: number; name: string; status: EventStatus; event_date: string | null; created_at: string; budget: number | null;
      assigned_to: string | null; next_action: string | null; next_action_due: string | null; customer: { name: string } | null;
    }[];
    const ids = rows.map((r) => r.id);
    const [quotesRes, invRes, logsRes] = await Promise.all([
      ids.length ? supabase.from("quotes").select("event_id, status, has_unpublished_changes, version:quote_versions!quotes_current_version_id_organisation_id_fkey(total)").eq("organisation_id", org.id).in("event_id", ids).neq("status", "superseded") : Promise.resolve({ data: [], error: null }),
      ids.length ? supabase.from("invoices").select("event_id, status, balance").eq("organisation_id", org.id).in("event_id", ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? supabase.from("activity_logs").select("event_id, created_at").eq("organisation_id", org.id).in("event_id", ids).eq("action", "event.status_changed").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [quotesRes, invRes, logsRes]) if (r.error) throw new Error(`Could not load event details: ${r.error.message}`);
    const quoteByEvent = new Map<string, QuoteLite>();
    for (const qt of (quotesRes.data ?? []) as unknown as QuoteLite[]) if (!quoteByEvent.has(qt.event_id) || qt.version) quoteByEvent.set(qt.event_id, qt);
    const invByEvent = new Map<string, { status: InvoiceStatus; balance: number }[]>();
    for (const i of (invRes.data ?? []) as { event_id: string; status: InvoiceStatus; balance: number }[]) invByEvent.set(i.event_id, [...(invByEvent.get(i.event_id) ?? []), i]);
    const stageSince = new Map<string, string>();
    for (const l of (logsRes.data ?? []) as { event_id: string; created_at: string }[]) if (!stageSince.has(l.event_id)) stageSince.set(l.event_id, l.created_at);

    columns = PIPELINE_EVENT_STAGES.map((s) => ({
      key: s, label: EVENT_STATUS[s].label, tone: EVENT_STATUS[s].tone,
      hint: s === "completed" ? `Last ${COMPLETED_WINDOW_DAYS} days` : undefined,
    }));
    cards = rows.map((r) => {
      const quote = quoteByEvent.get(r.id);
      const na = eventNextAction({ ...r, quote: quote ?? null, invoices: invByEvent.get(r.id) ?? [], daysUntil: r.event_date ? daysBetween(today, r.event_date) : null });
      return {
        id: r.id,
        column: r.status,
        status: r.status,
        href: `/events/${r.id}`,
        ref: `EV-${r.number}`,
        title: r.name,
        customer: r.customer?.name ?? "—",
        date: r.event_date ? fmtDate(r.event_date) : null,
        dateHint: r.event_date ? relativeDay(r.event_date, today) : null,
        value: quote?.version ? Number(quote.version.total) : r.budget != null ? Number(r.budget) : null,
        valueKind: quote?.version ? "quote" : r.budget != null ? "budget" : null,
        daysInStage: daysSince(stageSince.get(r.id) ?? r.created_at),
        owner: r.assigned_to ? names[r.assigned_to] ?? "Team member" : null,
        nextAction: na.label,
        urgency: na.urgency,
      };
    });
  }

  // Summary figures across the open part of the board
  const openCards = cards.filter((c) => (view === "enquiries" ? c.column !== "won" : c.column !== "completed"));
  const openValue = openCards.reduce((s, c) => s + (c.value ?? 0), 0);
  const stale = openCards.filter((c) => c.daysInStage >= 14).length;
  const closedCol = view === "enquiries" ? "won" : "confirmed";
  const closedValue = cards.filter((c) => c.column === closedCol).reduce((s, c) => s + (c.value ?? 0), 0);
  const unvalued = openCards.filter((c) => c.value == null).length;
  const href = (p: { view?: string; owner?: string }) => {
    const qs = new URLSearchParams();
    const v = p.view ?? view;
    const o = p.owner ?? (mine ? "me" : "");
    if (v === "events") qs.set("view", "events");
    if (o === "me") qs.set("owner", "me");
    const s = qs.toString();
    return s ? `/crm?${s}` : "/crm";
  };

  return (
    <div>
      <PageHeader title="CRM" subtitle="Your pipeline from first enquiry to confirmed booking. Drag a card to move it — every move is recorded."
        actions={<ButtonLink href="/enquiries/new" variant="primary">New enquiry</ButtonLink>} />

      <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <Segmented items={[
          { href: href({ view: "enquiries" }), label: "Enquiry pipeline", active: view === "enquiries" },
          { href: href({ view: "events" }), label: "Events by status", active: view === "events" },
        ]} />
        <Segmented items={[
          { href: href({ owner: "" }), label: "Everyone", active: !mine },
          { href: href({ owner: "me" }), label: "Assigned to me", active: mine },
        ]} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={view === "enquiries" ? "Open enquiries" : "Active events"} value={openCards.length} sub={unvalued ? `${unvalued} without a value yet` : "All have a value"} />
        <Kpi label="Open pipeline value" value={compactMoney(openValue, org.currency)} sub="Quote value, or budget if no quote" />
        <Kpi label={view === "enquiries" ? `Won · last ${WON_WINDOW_DAYS} days` : "Confirmed value"} value={compactMoney(closedValue, org.currency)}
          sub={`${cards.filter((c) => c.column === closedCol).length} ${view === "enquiries" ? "enquiries" : "events"}`} />
        <Kpi label="Stuck 14+ days" value={stale} alert={stale > 0} sub="In the same stage for two weeks or more" />
      </div>

      <PipelineBoard kind={view} columns={columns} cards={cards} currency={org.currency} />

      <p className="mt-2 text-[12px] text-ink-faint">
        {view === "enquiries"
          ? <>Lost and archived enquiries are hidden. Change those from the <Link href="/enquiries" className="text-brand-600 hover:text-brand-700">enquiry</Link> itself so a reason is captured.</>
          : <>Cancelled events are hidden. Moving an event here changes its status exactly as it would on the event page.</>}
      </p>
    </div>
  );
}

function Segmented({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav className="inline-flex shrink-0 rounded-lg bg-zinc-100 p-0.5">
      {items.map((i) => (
        <Link key={i.label} href={i.href} scroll={false} aria-current={i.active ? "page" : undefined}
          className={cn("whitespace-nowrap rounded-md px-3 py-2 text-[12.5px] font-medium sm:py-1.5", i.active ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
