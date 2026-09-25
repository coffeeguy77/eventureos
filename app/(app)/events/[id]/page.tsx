import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, MapPin, Clock, Users } from "lucide-react";
import { requireOrg, getMembers } from "@/lib/context";
import { Card, CardHeader, EmptyState, Field } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Tabs } from "@/components/ui/tabs";
import { Conversation } from "@/components/records/conversation";
import { NotesPanel, type NoteRow } from "@/components/records/notes-panel";
import { TasksPanel } from "@/components/records/tasks-panel";
import { DocumentsList, type DocRow } from "@/components/records/documents-list";
import { ActivityFeed } from "@/components/records/activity-feed";
import { NextActionBanner } from "@/components/records/next-action";
import { EventTimeline } from "@/components/records/event-timeline";
import { EventDetailsEditor, EventStatusSelect } from "./controls";
import { addNote, createTask } from "@/app/(app)/record-actions";
import { eventNextAction } from "@/lib/next-action";
import { EVENT_STATUS, INVOICE_STATUS, QUOTE_STATUS } from "@/lib/status";
import { addDaysISO, daysBetween, fmtDate, fmtDateTime, money, relative, relativeDay, timeRange, todayISO, zonedMidnightUTC } from "@/lib/format";
import type { ActivityLog, EmailMessage, EmailThread, EventRecord, InvoiceStatus, QuoteStatus, Task } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Event" };

const TABS = ["overview", "communication", "quote", "schedule", "tasks", "documents", "invoice", "payments", "activity"] as const;
type TabKey = (typeof TABS)[number];

interface QuoteRow {
  id: string; number: number; title: string; status: QuoteStatus; issue_date: string; expiry_date: string | null;
  has_unpublished_changes: boolean; current_version_id: string | null; notes: string | null; terms: string | null;
}
interface VersionRow {
  id: string; quote_id: string; version_number: number; status: QuoteStatus; total: number; subtotal: number; tax_total: number;
  published_at: string; viewed_at: string | null; responded_at: string | null; accepted_by_name: string | null; acceptance_ip: string | null;
  snapshot: { sections: { title: string; items: { name: string; description: string | null; quantity: number; unit: string | null; unit_price: number; line_total: number; optional: boolean }[] }[] };
}
interface InvoiceRow { id: string; number: string; kind: string; issue_date: string; due_date: string | null; total: number; amount_paid: number; balance: number; status: InvoiceStatus; xero_invoice_id: string | null; xero_synced_at: string | null }
interface PaymentRow { id: string; invoice_id: string; amount: number; paid_at: string; method: string | null; reference: string | null }

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tab: TabKey = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as TabKey) : "overview";
  const { supabase, org } = await requireOrg();
  const tz = org.timezone;
  const cur = org.currency;

  const { data: ev, error } = await supabase
    .from("events")
    .select("*, customer:customers(id, name, company, email, phone, kind, customer_since), contact:contacts!events_primary_contact_id_organisation_id_fkey(first_name, last_name, email, phone, position)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Could not load event: ${error.message}`);
  if (!ev) notFound();
  const e = ev as EventRecord & {
    customer: { id: string; name: string; company: string | null; email: string | null; phone: string | null; kind: string; customer_since: string };
    contact: { first_name: string; last_name: string | null; email: string | null; phone: string | null; position: string | null } | null;
  };

  const threadFilter = [`event_id.eq.${e.id}`, e.enquiry_id ? `enquiry_id.eq.${e.enquiry_id}` : null].filter(Boolean).join(",");
  const noteFilter = threadFilter;
  const dayStart = e.event_date ? zonedMidnightUTC(e.event_date, tz) : null;
  const dayEnd = e.event_date ? zonedMidnightUTC(addDaysISO(e.event_date, 1), tz) : null;

  const [quotesRes, versionsRes, invoicesRes, paymentsRes, threadsRes, notesRes, tasksRes, docsRes, activityRes, members, calRes, sameDayRes, gmailRes] = await Promise.all([
    supabase.from("quotes").select("*").eq("organisation_id", org.id).eq("event_id", e.id).order("created_at"),
    supabase.from("quote_versions").select("*, quote:quotes!quote_versions_quote_id_organisation_id_fkey!inner(event_id)").eq("organisation_id", org.id).eq("quote.event_id", e.id).order("version_number", { ascending: false }),
    supabase.from("invoices").select("*").eq("organisation_id", org.id).eq("event_id", e.id).order("issue_date"),
    supabase.from("payments").select("*, invoice:invoices!inner(event_id, number)").eq("organisation_id", org.id).eq("invoice.event_id", e.id).order("paid_at", { ascending: false }),
    supabase.from("email_threads").select("*").eq("organisation_id", org.id).or(threadFilter).order("last_message_at", { ascending: false }),
    supabase.from("notes").select("id, body, created_at, created_by").eq("organisation_id", org.id).or(noteFilter).order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("organisation_id", org.id).eq("event_id", e.id).order("due_at", { nullsFirst: false }),
    supabase.from("documents").select("id, name, size_bytes, visibility, requested_from_customer, created_at").eq("organisation_id", org.id).eq("event_id", e.id),
    supabase.from("activity_logs").select("*").eq("organisation_id", org.id).or(threadFilter).order("created_at", { ascending: false }).limit(200),
    getMembers(org.id),
    supabase.from("calendar_events").select("id, title, starts_at, ends_at, event_id, kind, sync_status, calendar_connection_id, calendar:calendar_connections(name, colour, provider)").eq("organisation_id", org.id).eq("event_id", e.id).order("starts_at"),
    dayStart && dayEnd
      ? supabase.from("calendar_events").select("id, title, starts_at, ends_at, event_id, calendar_connection_id, calendar:calendar_connections(name, colour)").eq("organisation_id", org.id).lt("starts_at", dayEnd).gt("ends_at", dayStart).neq("event_id", e.id)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("integrations").select("provider, status").eq("organisation_id", org.id),
  ]);
  for (const r of [quotesRes, versionsRes, invoicesRes, paymentsRes, threadsRes, notesRes, tasksRes, docsRes, activityRes, calRes, sameDayRes]) {
    if (r.error) throw new Error(`Could not load event details: ${r.error.message}`);
  }
  const quotes = (quotesRes.data ?? []) as QuoteRow[];
  const versions = (versionsRes.data ?? []) as unknown as VersionRow[];
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const payments = (paymentsRes.data ?? []) as unknown as (PaymentRow & { invoice: { number: string } })[];
  const threads = (threadsRes.data ?? []) as EmailThread[];
  const tasks = (tasksRes.data ?? []) as Task[];
  const activity = (activityRes.data ?? []) as ActivityLog[];
  const cal = (calRes.data ?? []) as unknown as { id: string; title: string; starts_at: string; ends_at: string; kind: string; sync_status: string; calendar_connection_id: string; calendar: { name: string; colour: string; provider: string } | null }[];
  const sameDay = (sameDayRes.data ?? []) as unknown as { id: string; title: string; starts_at: string; ends_at: string; event_id: string | null; calendar_connection_id: string; calendar: { name: string; colour: string } | null }[];
  const integrations = Object.fromEntries((gmailRes.data ?? []).map((i) => [i.provider, i.status]));

  const { data: msgs, error: mErr } = threads.length
    ? await supabase.from("email_messages").select("*").in("thread_id", threads.map((t) => t.id))
    : { data: [], error: null };
  if (mErr) throw new Error(`Could not load messages: ${mErr.message}`);

  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const memberOpts = members.map((m) => ({ id: m.id, name: m.full_name ?? m.email }));
  const today = todayISO(tz);
  const quote = quotes.find((q) => q.status !== "superseded") ?? quotes[0] ?? null;
  const currentVersion = versions.find((v) => v.id === quote?.current_version_id) ?? null;
  const na = eventNextAction({ ...e, quote, invoices, daysUntil: e.event_date ? daysBetween(today, e.event_date) : null });
  const invoiced = invoices.filter((i) => i.status !== "void").reduce((s, i) => s + Number(i.total), 0);
  const paid = invoices.filter((i) => i.status !== "void").reduce((s, i) => s + Number(i.amount_paid), 0);
  const conflicts = sameDay.filter((o) => cal.some((c) => c.calendar_connection_id === o.calendar_connection_id && c.starts_at < o.ends_at && o.starts_at < c.ends_at));
  const s = EVENT_STATUS[e.status];
  const openTasks = tasks.filter((t) => t.status !== "done").length;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "communication", label: "Communication", count: threads.length },
    { key: "quote", label: "Quote", count: versions.length },
    { key: "schedule", label: "Schedule", count: conflicts.length || undefined },
    { key: "tasks", label: "Tasks", count: openTasks },
    { key: "documents", label: "Documents", count: docsRes.data?.length },
    { key: "invoice", label: "Invoice", count: invoices.length },
    { key: "payments", label: "Payments", count: payments.length },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-faint">
            <Link href="/events" className="hover:text-ink">Events</Link><span>/</span><span>EV-{e.number}</span>
            {e.enquiry_id && <><span>·</span><Link href={`/enquiries/${e.enquiry_id}`} className="hover:text-ink">From enquiry</Link></>}
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{e.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
            <Badge tone={s.tone} dot>{s.label}</Badge>
            <Link href={`/clients/${e.customer.id}`} className="font-medium text-ink hover:text-brand-700">{e.customer.name}</Link>
            {e.event_date && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-ink-faint" />{fmtDate(e.event_date, "weekday")}{e.start_time ? `, ${timeRange(e.start_time, e.finish_time)}` : ""} <span className="text-ink-faint">· {relativeDay(e.event_date, today)}</span></span>}
            {e.venue && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-ink-faint" />{e.venue}</span>}
            {e.guest_count != null && <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-ink-faint" />{e.guest_count} guests</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EventStatusSelect id={e.id} status={e.status} />
        </div>
      </div>

      <NextActionBanner action={na} />

      <div className="mt-6"><Tabs tabs={tabs} active={tab} baseHref={`/events/${e.id}`} /></div>

      <div className="mt-6">
        {tab === "overview" && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader title="Event details" />
                <EventDetailsEditor event={e} members={memberOpts} view={
                  <div className="px-5 pb-5">
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <Field label="Event type">{e.event_type ?? "—"}</Field>
                      <Field label="Date">{fmtDate(e.event_date)}</Field>
                      <Field label="Time">{timeRange(e.start_time, e.finish_time) || "—"}</Field>
                      <Field label="Venue">{e.venue ?? "—"}</Field>
                      <Field label="Address">{e.address ?? "—"}</Field>
                      <Field label="Guests">{e.guest_count ?? "—"}</Field>
                      <Field label="Budget">{e.budget ? money(e.budget, cur, { cents: false }) : "—"}</Field>
                      <Field label="Lead">{e.assigned_to ? names[e.assigned_to] : "Unassigned"}</Field>
                      <Field label="Staff">
                        {e.assigned_staff.length ? (
                          <span className="flex -space-x-1.5">{e.assigned_staff.map((u) => <Avatar key={u} name={names[u]} size={24} className="ring-2 ring-white" />)}</span>
                        ) : "—"}
                      </Field>
                    </dl>
                    <div className="mt-5 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
                      <Field label="Services">{e.services.length ? <span className="flex flex-wrap gap-1.5">{e.services.map((x) => <Badge key={x}>{x}</Badge>)}</span> : "—"}</Field>
                      <Field label="Equipment">{e.equipment.length ? <span className="flex flex-wrap gap-1.5">{e.equipment.map((x) => <Badge key={x} tone="slate">{x}</Badge>)}</span> : "—"}</Field>
                      <Field label="Requirements" className="sm:col-span-2"><span className="whitespace-pre-line">{e.requirements ?? "—"}</span></Field>
                      <Field label="Customer notes"><span className="whitespace-pre-line">{e.customer_notes ?? "—"}</span></Field>
                      <Field label="Internal notes"><span className="whitespace-pre-line">{e.internal_notes ?? "—"}</span></Field>
                    </div>
                  </div>
                } />
              </Card>
              <Card>
                <CardHeader title="Notes" />
                <NotesPanel notes={(notesRes.data ?? []) as NoteRow[]} names={names} action={addNote.bind(null, { eventId: e.id, customerId: e.customer_id })} />
              </Card>
              <Card>
                <CardHeader title="Recent activity" action={<Link href={`/events/${e.id}?tab=activity`} className="text-[12.5px] font-medium text-brand-600">See all</Link>} />
                <ActivityFeed items={activity.slice(0, 6)} names={names} tz={tz} />
              </Card>
            </div>
            <div className="space-y-6">
              <Card>
                <CardHeader title="Customer" action={<Link href={`/clients/${e.customer.id}`} className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">View record</Link>} />
                <div className="px-5 pb-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={e.customer.name} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-ink">{e.customer.name}</p>
                      <p className="truncate text-[12.5px] text-ink-muted">{e.contact ? `${e.contact.first_name} ${e.contact.last_name ?? ""}`.trim() + (e.contact.position ? ` · ${e.contact.position}` : "") : "No primary contact"}</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2 text-[13px] text-ink">
                    {(e.contact?.email ?? e.customer.email) && <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-ink-faint" />{e.contact?.email ?? e.customer.email}</li>}
                    {(e.contact?.phone ?? e.customer.phone) && <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-faint" />{e.contact?.phone ?? e.customer.phone}</li>}
                  </ul>
                </div>
              </Card>
              <Card>
                <CardHeader title="Money" action={<span className="text-[11.5px] text-ink-faint">{integrations.xero === "connected" ? "Synced with Xero" : "Xero not connected"}</span>} />
                <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
                  <Field label="Quote">{currentVersion ? money(currentVersion.total, cur) : quote ? "Draft" : "—"}</Field>
                  <Field label="Invoiced">{money(invoiced, cur)}</Field>
                  <Field label="Paid">{money(paid, cur)}</Field>
                  <Field label="Balance"><span className={cn(invoices.some((i) => i.status === "overdue") && "font-semibold text-rose-700")}>{money(invoiced - paid, cur)}</span></Field>
                </dl>
              </Card>
              <Card>
                <CardHeader title="Event timeline" subtitle="The whole journey, from first enquiry to final payment" />
                <EventTimeline activity={activity} tz={tz} cancelled={e.status === "cancelled"} />
              </Card>
            </div>
          </div>
        )}

        {tab === "communication" && (
          <Card>
            <CardHeader title="Email conversation" subtitle="Synced copies — Gmail stays the source of truth" />
            <Conversation threads={threads} messages={(msgs ?? []) as EmailMessage[]} tz={tz} orgName={org.name} gmailConnected={integrations.gmail === "connected"} />
          </Card>
        )}

        {tab === "quote" && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title={quote ? `Quote Q-${quote.number} · ${quote.title}` : "Quote"}
                subtitle={quote ? `Issued ${fmtDate(quote.issue_date)}${quote.expiry_date ? ` · expires ${fmtDate(quote.expiry_date)}` : ""}` : undefined}
                action={quote && <Badge tone={QUOTE_STATUS[quote.status].tone} dot>{QUOTE_STATUS[quote.status].label}</Badge>}
              />
              {!quote && <EmptyState title="No quote yet">The quote builder arrives in the next build. Quotes will belong to this event, with draft versions and immutable sent versions.</EmptyState>}
              {quote && quote.has_unpublished_changes && (
                <p className="mx-5 mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-inset ring-amber-100">
                  {currentVersion ? "The draft has changes the customer hasn’t seen. They still see version " + currentVersion.version_number + "." : "Draft — not yet sent. The customer can’t see it until it’s published."}
                </p>
              )}
              {currentVersion ? (
                <QuoteSnapshot v={currentVersion} cur={cur} />
              ) : quote ? (
                <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Editing drafts arrives with the quote builder in the next build.</p>
              ) : null}
            </Card>
            <Card>
              <CardHeader title="Version history" subtitle="Sent versions are locked and can never change" />
              {versions.length === 0 ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Nothing published yet.</p> : (
                <ol className="divide-y divide-line border-t border-line">
                  {versions.map((v) => (
                    <li key={v.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-ink">Version {v.version_number}</span>
                        <Badge tone={QUOTE_STATUS[v.status].tone}>{QUOTE_STATUS[v.status].label}</Badge>
                      </div>
                      <p className="tabular mt-0.5 text-[13px] text-ink">{money(v.total, cur)}</p>
                      <ul className="mt-1 space-y-0.5 text-[12px] text-ink-muted">
                        <li>Sent {fmtDateTime(v.published_at, tz)}</li>
                        {v.viewed_at && <li>Viewed {fmtDateTime(v.viewed_at, tz)}</li>}
                        {v.accepted_by_name && <li className="text-emerald-700">Accepted by {v.accepted_by_name} · {fmtDateTime(v.responded_at, tz)}{v.acceptance_ip ? ` · IP ${v.acceptance_ip}` : ""}</li>}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        )}

        {tab === "schedule" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Calendar entries" action={<span className="text-[11.5px] text-ink-faint">{integrations.google_calendar === "connected" ? "Google Calendar connected" : "Google Calendar not connected"}</span>} />
              {cal.length === 0 ? <EmptyState title="Not on the calendar yet">Confirmed events are added to a calendar automatically.</EmptyState> : (
                <ul className="divide-y divide-line border-t border-line">
                  {cal.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="h-8 w-1 rounded-full" style={{ background: c.calendar?.colour ?? "#6D4AFF" }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-ink">{c.calendar?.name}</p>
                        <p className="text-[12px] text-ink-muted">{fmtDateTime(c.starts_at, tz)} – {fmtDateTime(c.ends_at, tz, "time")}</p>
                      </div>
                      <Badge tone={c.sync_status === "synced" ? "green" : "neutral"}>{c.sync_status === "synced" ? "Synced" : "Local only"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Same-day bookings" subtitle={e.event_date ? fmtDate(e.event_date, "long") : "No date set"} />
              {conflicts.length > 0 && (
                <p className="mx-5 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-800 ring-1 ring-inset ring-rose-100">
                  Scheduling conflict: {conflicts.length} booking{conflicts.length > 1 ? "s" : ""} overlap on the same resource.
                </p>
              )}
              {sameDay.length === 0 ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Nothing else booked that day.</p> : (
                <ul className="divide-y divide-line border-t border-line">
                  {sameDay.map((o) => (
                    <li key={o.id} className={cn("flex items-center gap-3 px-5 py-3", conflicts.includes(o) && "bg-rose-50/50")}>
                      <span className="h-2 w-2 rounded-full" style={{ background: o.calendar?.colour ?? "#999" }} />
                      <div className="min-w-0 flex-1">
                        {o.event_id ? <Link href={`/events/${o.event_id}?tab=schedule`} className="text-[13px] text-ink hover:text-brand-700">{o.title}</Link> : <span className="text-[13px] text-ink">{o.title}</span>}
                        <p className="text-[12px] text-ink-muted">{fmtDateTime(o.starts_at, tz, "time")}–{fmtDateTime(o.ends_at, tz, "time")} · {o.calendar?.name}</p>
                      </div>
                      {conflicts.includes(o) && <Badge tone="red">Conflict</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === "tasks" && (
          <Card className="max-w-3xl">
            <CardHeader title="Tasks" subtitle={`${openTasks} open`} />
            <TasksPanel tasks={tasks} members={memberOpts} action={createTask.bind(null, { eventId: e.id, customerId: e.customer_id })} />
          </Card>
        )}

        {tab === "documents" && (
          <Card className="max-w-3xl">
            <CardHeader title="Documents" />
            <DocumentsList docs={(docsRes.data ?? []) as DocRow[]} />
          </Card>
        )}

        {tab === "invoice" && (
          <Card>
            <CardHeader title="Invoices" subtitle="Xero will be the accounting source of truth once connected"
              action={<span className="text-[11.5px] text-ink-faint">{integrations.xero === "connected" ? "Synced with Xero" : "Xero not connected · demo invoices"}</span>} />
            {invoices.length === 0 ? <EmptyState title="No invoices yet">When the quote is accepted, EventureOS can raise a deposit or full invoice automatically.</EmptyState> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[13px]">
                  <thead><tr className="border-y border-line text-[11.5px] uppercase tracking-wide text-ink-faint">
                    {["Invoice", "Type", "Date", "Due", "Amount", "Paid", "Balance", "Status"].map((h) => <th key={h} className={cn("px-5 py-2.5 font-medium", ["Amount", "Paid", "Balance"].includes(h) && "text-right")}>{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {invoices.map((i) => (
                      <tr key={i.id}>
                        <td className="px-5 py-3 font-medium text-ink">{i.number}</td>
                        <td className="px-5 py-3 capitalize text-ink-muted">{i.kind}</td>
                        <td className="px-5 py-3 text-ink-muted">{fmtDate(i.issue_date)}</td>
                        <td className={cn("px-5 py-3", i.status === "overdue" ? "font-medium text-rose-700" : "text-ink-muted")}>{fmtDate(i.due_date)}</td>
                        <td className="tabular px-5 py-3 text-right text-ink">{money(i.total, cur)}</td>
                        <td className="tabular px-5 py-3 text-right text-ink-muted">{money(i.amount_paid, cur)}</td>
                        <td className="tabular px-5 py-3 text-right font-medium text-ink">{money(i.balance, cur)}</td>
                        <td className="px-5 py-3"><Badge tone={INVOICE_STATUS[i.status].tone} dot>{INVOICE_STATUS[i.status].label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {tab === "payments" && (
          <Card className="max-w-3xl">
            <CardHeader title="Payments" subtitle={`${money(paid, cur)} received`} />
            {payments.length === 0 ? <EmptyState title="No payments yet" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-ink">{p.invoice.number}</p>
                      <p className="text-[12px] text-ink-muted">{fmtDateTime(p.paid_at, tz, "date")} · {p.method ?? "Payment"}{p.reference ? ` · ref ${p.reference}` : ""}</p>
                    </div>
                    <span className="tabular text-[13.5px] font-medium text-emerald-700">{money(p.amount, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "activity" && (
          <Card className="max-w-3xl">
            <CardHeader title="Activity & audit trail" subtitle="Every change, by whom and when" />
            <ActivityFeed items={activity} names={names} tz={tz} />
          </Card>
        )}
      </div>
      <p className="mt-8 text-[11.5px] text-ink-faint">Last updated {relative((ev as { updated_at: string }).updated_at)}</p>
    </div>
  );
}

function QuoteSnapshot({ v, cur }: { v: VersionRow; cur: string }) {
  return (
    <div className="px-5 pb-5">
      {v.snapshot.sections.map((s) => (
        <div key={s.title} className="mb-4">
          <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">{s.title}</p>
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-line">
              {s.items.map((it, idx) => (
                <tr key={idx} className={cn(it.optional && "text-ink-faint")}>
                  <td className="py-2 pr-3">
                    <span className="text-ink">{it.name}</span>{it.optional && <Badge className="ml-2">Optional</Badge>}
                    {it.description && <span className="block text-[12px] text-ink-muted">{it.description}</span>}
                  </td>
                  <td className="tabular whitespace-nowrap py-2 pr-3 text-right text-ink-muted">{Number(it.quantity)} {it.unit ?? ""} × {money(it.unit_price, cur)}</td>
                  <td className="tabular whitespace-nowrap py-2 text-right text-ink">{money(it.line_total, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <dl className="ml-auto mt-2 w-full max-w-[260px] space-y-1 border-t border-line pt-3 text-[13px]">
        <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd className="tabular">{money(v.subtotal, cur)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-muted">GST</dt><dd className="tabular">{money(v.tax_total, cur)}</dd></div>
        <div className="flex justify-between text-[14px] font-semibold"><dt>Total</dt><dd className="tabular">{money(v.total, cur)}</dd></div>
      </dl>
    </div>
  );
}
