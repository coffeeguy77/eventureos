import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, Link2, Mail, MapPin, Phone, User } from "lucide-react";
import { requireOrg, getMembers, canManage } from "@/lib/context";
import { Card, CardHeader, EmptyState, Field } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { ActivityFeed } from "@/components/records/activity-feed";
import { Conversation } from "@/components/records/conversation";
import { DocumentsList, type DocRow } from "@/components/records/documents-list";
import { NotesPanel, type NoteRow } from "@/components/records/notes-panel";
import { NextActionBanner } from "@/components/records/next-action";
import { addNote } from "@/app/(app)/record-actions";
import { ContactsManager, CustomerDetailsEditor, type ContactRow } from "./controls";
import { enquiryNextAction, type NextAction } from "@/lib/next-action";
import { CLASSIFICATION, ENQUIRY_SOURCE, ENQUIRY_STATUS, EVENT_STATUS, INVOICE_STATUS, OPEN_ENQUIRY_STATUSES, QUOTE_STATUS } from "@/lib/status";
import { daysBetween, fmtDate, fmtDateTime, money, relative, relativeDay, todayISO } from "@/lib/format";
import type { ActivityLog, EmailMessage, EmailThread, EnquirySource, EnquiryStatus, EventStatus, InvoiceStatus, QuoteStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Client" };

const TABS = ["overview", "events", "emails", "quotes", "invoices", "payments", "documents", "notes", "activity"] as const;
type TabKey = (typeof TABS)[number];

interface CustomerRow {
  id: string; kind: "individual" | "company"; name: string; company: string | null; email: string | null; phone: string | null;
  address: string | null; notes: string | null; source: EnquirySource | null; tags: string[]; customer_since: string;
  xero_contact_id: string | null; created_at: string; updated_at: string;
}
interface EventRow {
  id: string; number: number; name: string; event_date: string | null; status: EventStatus; venue: string | null;
  event_type: string | null; guest_count: number | null; budget: number | null; enquiry_id: string | null;
}
interface EnquiryRow {
  id: string; number: number; title: string; status: EnquiryStatus; source: EnquirySource; received_at: string;
  event_date: string | null; budget: number | null; event_id: string | null; customer_id: string | null;
  next_action: string | null; next_action_due: string | null;
}
interface VersionLite { id: string; version_number: number; status: QuoteStatus; total: number; published_at: string; viewed_at: string | null; responded_at: string | null; accepted_by_name: string | null }
interface QuoteRow {
  id: string; number: number; title: string; status: QuoteStatus; event_id: string; issue_date: string; expiry_date: string | null;
  current_version_id: string | null; has_unpublished_changes: boolean; created_at: string;
  event: { name: string; event_date: string | null } | null;
  versions: VersionLite[];
}
interface InvoiceRow {
  id: string; number: string; kind: string; issue_date: string; due_date: string | null; total: number; amount_paid: number;
  balance: number; status: InvoiceStatus; event_id: string | null; xero_invoice_id: string | null; event: { name: string } | null;
}
interface PaymentRow { id: string; amount: number; paid_at: string; method: string | null; reference: string | null; xero_payment_id: string | null; invoice: { id: string; number: string; event_id: string | null } }

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tab: TabKey = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as TabKey) : "overview";
  const { supabase, org, role } = await requireOrg();
  const tz = org.timezone;
  const cur = org.currency;

  const { data: cRow, error } = await supabase.from("customers").select("*").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Could not load client: ${error.message}`);
  if (!cRow) notFound();
  const c = cRow as CustomerRow;

  // Events and enquiries first — their ids scope emails, documents and activity.
  const [eventsRes, enquiriesRes] = await Promise.all([
    supabase.from("events").select("id, number, name, event_date, status, venue, event_type, guest_count, budget, enquiry_id")
      .eq("organisation_id", org.id).eq("customer_id", id).order("event_date", { ascending: false, nullsFirst: true }),
    supabase.from("enquiries").select("id, number, title, status, source, received_at, event_date, budget, event_id, customer_id, next_action, next_action_due")
      .eq("organisation_id", org.id).eq("customer_id", id).order("received_at", { ascending: false }),
  ]);
  if (eventsRes.error) throw new Error(`Could not load client events: ${eventsRes.error.message}`);
  if (enquiriesRes.error) throw new Error(`Could not load client enquiries: ${enquiriesRes.error.message}`);
  const events = (eventsRes.data ?? []) as EventRow[];
  const enquiries = (enquiriesRes.data ?? []) as EnquiryRow[];
  const scope = [
    `customer_id.eq.${id}`,
    events.length ? `event_id.in.(${events.map((e) => e.id).join(",")})` : null,
    enquiries.length ? `enquiry_id.in.(${enquiries.map((e) => e.id).join(",")})` : null,
  ].filter(Boolean).join(",");
  const docScope = [`customer_id.eq.${id}`, events.length ? `event_id.in.(${events.map((e) => e.id).join(",")})` : null].filter(Boolean).join(",");

  const [contactsRes, quotesRes, invoicesRes, paymentsRes, threadsRes, notesRes, docsRes, activityRes, integRes, members] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, email, phone, position, is_primary, portal_user_id")
      .eq("organisation_id", org.id).eq("customer_id", id).order("is_primary", { ascending: false }).order("created_at"),
    supabase.from("quotes")
      .select("id, number, title, status, event_id, issue_date, expiry_date, current_version_id, has_unpublished_changes, created_at, event:events(name, event_date), versions:quote_versions!quote_versions_quote_id_organisation_id_fkey(id, version_number, status, total, published_at, viewed_at, responded_at, accepted_by_name)")
      .eq("organisation_id", org.id).eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("id, number, kind, issue_date, due_date, total, amount_paid, balance, status, event_id, xero_invoice_id, event:events(name)")
      .eq("organisation_id", org.id).eq("customer_id", id).order("issue_date", { ascending: false }),
    supabase.from("payments").select("id, amount, paid_at, method, reference, xero_payment_id, invoice:invoices!inner(id, number, event_id, customer_id)")
      .eq("organisation_id", org.id).eq("invoice.customer_id", id).order("paid_at", { ascending: false }),
    supabase.from("email_threads").select("*").eq("organisation_id", org.id).or(scope).order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("notes").select("id, body, created_at, created_by").eq("organisation_id", org.id).or(scope).order("created_at", { ascending: false }),
    supabase.from("documents").select("id, name, size_bytes, visibility, requested_from_customer, created_at").eq("organisation_id", org.id).or(docScope).order("created_at", { ascending: false }),
    supabase.from("activity_logs").select("*").eq("organisation_id", org.id).or(scope).order("created_at", { ascending: false }).limit(300),
    supabase.from("integrations").select("provider, status").eq("organisation_id", org.id),
    getMembers(org.id),
  ]);
  for (const r of [contactsRes, quotesRes, invoicesRes, paymentsRes, threadsRes, notesRes, docsRes, activityRes]) {
    if (r.error) throw new Error(`Could not load client details: ${r.error.message}`);
  }
  const contacts = (contactsRes.data ?? []) as ContactRow[];
  const quotes = (quotesRes.data ?? []) as unknown as QuoteRow[];
  const invoices = (invoicesRes.data ?? []) as unknown as InvoiceRow[];
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[];
  const threads = (threadsRes.data ?? []) as EmailThread[];
  const notes = (notesRes.data ?? []) as NoteRow[];
  const docs = (docsRes.data ?? []) as DocRow[];
  const activity = (activityRes.data ?? []) as ActivityLog[];
  const integrations = Object.fromEntries((integRes.data ?? []).map((i) => [i.provider, i.status]));

  const { data: msgData, error: mErr } = threads.length
    ? await supabase.from("email_messages").select("*").eq("organisation_id", org.id).in("thread_id", threads.map((t) => t.id)).order("sent_at", { ascending: false })
    : { data: [], error: null };
  if (mErr) throw new Error(`Could not load messages: ${mErr.message}`);
  const messages = (msgData ?? []) as EmailMessage[];

  // ---- Derived facts -----------------------------------------------------
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const today = todayISO(tz);
  const live = invoices.filter((i) => i.status !== "void");
  const lifetime = payments.reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = live.reduce((s, i) => s + Number(i.balance), 0);
  const overdue = live.filter((i) => Number(i.balance) > 0 && (i.status === "overdue" || (i.due_date != null && i.due_date < today && i.status !== "draft")))
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const openInvoices = live.filter((i) => Number(i.balance) > 0 && i.status !== "draft");
  const upcoming = events.filter((e) => e.event_date && e.event_date >= today && e.status !== "cancelled" && e.status !== "completed")
    .sort((a, b) => a.event_date!.localeCompare(b.event_date!));
  const nextEvent = upcoming[0] ?? null;
  const currentVersion = (q: QuoteRow) => q.versions.find((v) => v.id === q.current_version_id) ?? null;
  const awaitingQuotes = quotes.filter((q) => q.status === "sent" || q.status === "viewed");
  const openQuote = awaitingQuotes[0] ?? quotes.find((q) => q.status === "draft") ?? null;
  const openEnquiries = enquiries.filter((e) => OPEN_ENQUIRY_STATUSES.includes(e.status) && !e.event_id);
  const allVersions = quotes.flatMap((q) => q.versions);
  const primary = contacts.find((ct) => ct.is_primary) ?? contacts[0] ?? null;
  const firstEnquiry = enquiries[enquiries.length - 1] ?? null;
  const lastContact = messages[0]?.sent_at ?? null;
  const acceptedValue = quotes.reduce((s, q) => s + Number(q.versions.find((v) => v.status === "accepted")?.total ?? 0), 0);

  // ---- Next action (most urgent first) -----------------------------------
  let na: NextAction;
  let naLink: { href: string; label: string } | null = null;
  if (overdue.length) {
    const i = overdue[0];
    const late = i.due_date ? daysBetween(i.due_date, today) : 0;
    na = {
      label: overdue.length > 1 ? `Chase ${overdue.length} overdue invoices` : `Chase overdue invoice ${i.number}`,
      detail: `${money(overdue.reduce((s, x) => s + Number(x.balance), 0), cur)} outstanding${late > 0 ? ` · oldest ${late} day${late === 1 ? "" : "s"} overdue` : ""}`,
      urgency: "overdue",
    };
    naLink = overdue.length === 1 ? { href: `/invoices/${i.id}`, label: "Open invoice" } : { href: `/clients/${id}?tab=invoices`, label: "View invoices" };
  } else if (awaitingQuotes.length) {
    const q = awaitingQuotes[0];
    const v = currentVersion(q);
    na = {
      label: `Follow up quote Q-${q.number}`,
      detail: [q.event?.name ?? q.title, v ? money(v.total, cur) : null, v?.viewed_at ? `viewed ${relative(v.viewed_at)}` : v ? `sent ${relative(v.published_at)}, not yet opened` : null].filter(Boolean).join(" · "),
      urgency: q.status === "viewed" ? "soon" : "normal",
    };
    naLink = { href: `/quotes/${q.id}`, label: "Open quote" };
  } else if (nextEvent) {
    const n = daysBetween(today, nextEvent.event_date!);
    na = {
      label: `Prepare for ${nextEvent.name}`,
      detail: [relativeDay(nextEvent.event_date, today), fmtDate(nextEvent.event_date, "weekday"), nextEvent.venue, EVENT_STATUS[nextEvent.status].label].filter(Boolean).join(" · "),
      urgency: n <= 7 ? "soon" : "normal",
    };
    naLink = { href: `/events/${nextEvent.id}`, label: "Open event" };
  } else if (openEnquiries.length) {
    const e = openEnquiries[0];
    const base = enquiryNextAction(e);
    na = { ...base, label: e.status === "new" ? "Reply to their enquiry" : base.label, detail: `ENQ-${e.number} · ${e.title} · received ${relative(e.received_at)}` };
    naLink = { href: `/enquiries/${e.id}`, label: "Open enquiry" };
  } else {
    na = { label: "No action needed", detail: "No overdue invoices, open quotes, upcoming events or open enquiries.", urgency: "done" };
  }

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "events", label: "Events", count: events.length },
    { key: "emails", label: "Emails", count: threads.length },
    { key: "quotes", label: "Quotes", count: quotes.length },
    { key: "invoices", label: "Invoices", count: invoices.length },
    { key: "payments", label: "Payments", count: payments.length },
    { key: "documents", label: "Documents", count: docs.length },
    { key: "notes", label: "Notes", count: notes.length },
    { key: "activity", label: "Activity" },
  ];
  const xeroConnected = integrations.xero === "connected";
  const gmailConnected = integrations.gmail === "connected";

  return (
    <div>
      <div className="mb-1 flex min-w-0 items-center gap-2 text-[12px] text-ink-faint">
        <Link href="/clients" className="hover:text-ink">Clients</Link><span>/</span><span className="truncate">{c.name}</span>
      </div>

      {/* ---- Header ---------------------------------------------------- */}
      <Card className="mb-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4 sm:gap-5">
          <Avatar name={c.name} size={52} />
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-[20px] font-semibold tracking-tight text-ink sm:text-[22px]">{c.name}</h1>
              <Badge tone="slate">{c.kind === "company" ? "Company" : "Individual"}</Badge>
              {c.tags.map((t) => <Badge key={t}>{t}</Badge>)}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
              {c.company && c.company !== c.name && <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-ink-faint" />{c.company}</span>}
              {primary && c.kind === "company" && <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-ink-faint" />{primary.first_name} {primary.last_name}{primary.position ? ` · ${primary.position}` : ""}</span>}
              {c.email && <a href={`mailto:${c.email}`} className="flex min-w-0 items-center gap-1.5 hover:text-brand-700"><Mail className="h-3.5 w-3.5 shrink-0 text-ink-faint" /><span className="min-w-0 break-all">{c.email}</span></a>}
              {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:text-brand-700"><Phone className="h-3.5 w-3.5 text-ink-faint" />{c.phone}</a>}
              {c.address && <span className="flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" /><span className="min-w-0 break-words">{c.address}</span></span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
              {c.xero_contact_id ? (
                <span className="inline-flex items-center gap-1 text-emerald-700"><Link2 className="h-3.5 w-3.5" />Linked to Xero contact</span>
              ) : (
                <span className="text-ink-faint">{xeroConnected ? "Not linked to a Xero contact yet" : "Xero not connected"}</span>
              )}
              {lastContact && <span className="text-ink-faint">· Last email {relative(lastContact)}</span>}
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <ButtonLink href={`/events/new?customer=${c.id}`} variant="primary" className="h-10 flex-1 sm:h-9 sm:flex-none">New event for this client</ButtonLink>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-5 sm:grid-cols-4">
          <HeaderStat label="Customer since" value={fmtDate(c.customer_since)} sub={firstEnquiry ? `First enquiry via ${ENQUIRY_SOURCE[firstEnquiry.source]}` : c.source ? `Via ${ENQUIRY_SOURCE[c.source]}` : undefined} />
          <HeaderStat label="Lifetime value" value={money(lifetime, cur)} sub={`${payments.length} payment${payments.length === 1 ? "" : "s"} received`} />
          <HeaderStat label="Events" value={String(events.length)} sub={upcoming.length ? `${upcoming.length} upcoming` : events.length ? "None upcoming" : "No events yet"} />
          <HeaderStat label="Outstanding" value={money(outstanding, cur)} alert={overdue.length > 0}
            sub={overdue.length ? `${overdue.length} overdue` : openInvoices.length ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}` : "Nothing owing"} />
        </dl>
      </Card>

      <NextActionBanner action={na}>
        {naLink && <ButtonLink href={naLink.href} size="sm" className="h-10 sm:h-8" variant={na.urgency === "done" ? "secondary" : "primary"}>{naLink.label}</ButtonLink>}
      </NextActionBanner>

      <div className="mt-6"><Tabs tabs={tabs} active={tab} baseHref={`/clients/${c.id}`} /></div>

      <div className="mt-6">
        {tab === "overview" && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-6">
              <Card>
                <CardHeader title="Client details" />
                <CustomerDetailsEditor customer={c} view={
                  <div className="px-5 pb-5">
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <Field label="Name">{c.name}</Field>
                      <Field label="Company">{c.company ?? "—"}</Field>
                      <Field label="Type">{c.kind === "company" ? "Company" : "Individual"}</Field>
                      <Field label="Email"><span className="break-all">{c.email ?? "—"}</span></Field>
                      <Field label="Phone">{c.phone ?? "—"}</Field>
                      <Field label="Address">{c.address ?? "—"}</Field>
                      <Field label="Tags">{c.tags.length ? <span className="flex flex-wrap gap-1.5">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : "—"}</Field>
                      <Field label="Quotes accepted">{money(acceptedValue, cur)}</Field>
                      <Field label="Xero">{c.xero_contact_id ? "Linked" : xeroConnected ? "Not linked" : "Not connected"}</Field>
                    </dl>
                    {c.notes && <p className="mt-5 whitespace-pre-line break-words rounded-lg bg-amber-50/60 px-3 py-2 text-[13px] text-ink ring-1 ring-inset ring-amber-100">{c.notes}</p>}
                  </div>
                } />
              </Card>

              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader title="Next event" action={<Link href={`/clients/${id}?tab=events`} className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">All events</Link>} />
                  {nextEvent ? (
                    <Link href={`/events/${nextEvent.id}`} className="mx-5 mb-5 flex items-center gap-3 rounded-lg border border-line px-3 py-3 hover:border-brand-200">
                      <DateChip iso={nextEvent.event_date} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-ink">{nextEvent.name}</p>
                        <p className="truncate text-[12px] text-ink-muted">{[relativeDay(nextEvent.event_date, today), nextEvent.venue, nextEvent.guest_count ? `${nextEvent.guest_count} guests` : null].filter(Boolean).join(" · ")}</p>
                        <Badge tone={EVENT_STATUS[nextEvent.status].tone} dot className="mt-1">{EVENT_STATUS[nextEvent.status].label}</Badge>
                      </div>
                    </Link>
                  ) : <p className="px-5 pb-5 text-[12.5px] text-ink-muted">No upcoming events.</p>}
                </Card>
                <Card>
                  <CardHeader title="Open quote" action={<Link href={`/clients/${id}?tab=quotes`} className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">All quotes</Link>} />
                  {openQuote ? (() => {
                    const v = currentVersion(openQuote);
                    return (
                      <Link href={`/quotes/${openQuote.id}`} className="mx-5 mb-5 block rounded-lg border border-line px-3 py-3 hover:border-brand-200">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13.5px] font-medium text-ink">Q-{openQuote.number} · {openQuote.event?.name ?? openQuote.title}</p>
                          <Badge tone={QUOTE_STATUS[openQuote.status].tone}>{QUOTE_STATUS[openQuote.status].label}</Badge>
                        </div>
                        <p className="tabular mt-1 text-[16px] font-semibold text-ink">{v ? money(v.total, cur) : "Draft"}</p>
                        <p className="text-[12px] text-ink-muted">
                          {v ? `Version ${v.version_number} · sent ${fmtDateTime(v.published_at, tz, "date")}${v.viewed_at ? ` · viewed ${relative(v.viewed_at)}` : " · not yet opened"}` : "Not sent yet"}
                          {openQuote.expiry_date ? ` · expires ${fmtDate(openQuote.expiry_date, "short")}` : ""}
                        </p>
                      </Link>
                    );
                  })() : <p className="px-5 pb-5 text-[12.5px] text-ink-muted">No quotes awaiting a reply.</p>}
                </Card>
              </div>

              <Card>
                <CardHeader title="Outstanding invoices" subtitle={openInvoices.length ? `${money(outstanding, cur)} across ${openInvoices.length} invoice${openInvoices.length === 1 ? "" : "s"}` : undefined}
                  action={<span className="block max-w-[10rem] text-right text-[11.5px] text-ink-faint sm:max-w-none">{xeroConnected ? "Synced with Xero" : "Xero not connected"}</span>} />
                {openInvoices.length === 0 ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Nothing owing. {live.length ? "All invoices are paid." : ""}</p> : (
                  <ul className="divide-y divide-line border-t border-line">
                    {openInvoices.map((i) => {
                      const late = overdue.includes(i);
                      return (
                        <li key={i.id}>
                          <Link href={`/invoices/${i.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-50/70">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium text-ink">{i.number} <span className="font-normal text-ink-muted">· {i.event?.name ?? "No event"}</span></p>
                              <p className={cn("text-[12px]", late ? "font-medium text-rose-700" : "text-ink-muted")}>
                                {late && i.due_date ? `${daysBetween(i.due_date, today)} days overdue` : i.due_date ? `Due ${fmtDate(i.due_date)}` : "No due date"}
                              </p>
                            </div>
                            <span className="tabular shrink-0 text-[13px] font-medium text-ink">{money(i.balance, cur)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title="Recent emails" action={<Link href={`/clients/${id}?tab=emails`} className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">All emails</Link>} />
                {messages.length === 0 ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">No emails linked to this client yet.{!gmailConnected && " Connect Gmail in Settings to bring conversations in automatically."}</p> : (
                  <ul className="divide-y divide-line border-t border-line">
                    {messages.slice(0, 5).map((m) => {
                      const t = threads.find((x) => x.id === m.thread_id);
                      return (
                        <li key={m.id}>
                          <Link href={`/clients/${id}?tab=emails`} className="flex gap-3 px-5 py-2.5 hover:bg-zinc-50/70">
                            <Avatar name={m.direction === "outbound" ? org.name : m.from_name ?? m.from_email} size={26} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <p className={cn("truncate text-[13px] text-ink", !m.is_read && m.direction === "inbound" && "font-semibold")}>
                                  {m.direction === "outbound" ? "You" : m.from_name ?? m.from_email} <span className="font-normal text-ink-muted">· {t?.subject ?? m.subject ?? "(no subject)"}</span>
                                </p>
                                <span className="ml-auto shrink-0 text-[11.5px] text-ink-faint">{relative(m.sent_at)}</span>
                              </div>
                              <p className="truncate text-[12px] text-ink-muted">{m.snippet ?? m.body_text}</p>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title="Recent activity" action={<Link href={`/clients/${id}?tab=activity`} className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">See all</Link>} />
                <ActivityFeed items={activity.slice(0, 8)} names={names} tz={tz} compact />
              </Card>
            </div>

            <div className="min-w-0 space-y-6">
              <Card>
                <CardHeader title="Contacts" subtitle={contacts.length > 1 ? `${contacts.length} people` : undefined} />
                <ContactsManager customerId={c.id} contacts={contacts} canRemove={canManage(role)} />
              </Card>
              <Card>
                <CardHeader title="Relationship at a glance" />
                <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
                  <Field label="Enquiries">{enquiries.length}</Field>
                  <Field label="Won">{enquiries.filter((e) => e.status === "won").length}</Field>
                  <Field label="Quotes sent">{allVersions.length}</Field>
                  <Field label="Accepted">{allVersions.filter((v) => v.status === "accepted").length}</Field>
                  <Field label="Invoiced">{money(live.reduce((s, i) => s + Number(i.total), 0), cur, { cents: false })}</Field>
                  <Field label="Paid">{money(lifetime, cur, { cents: false })}</Field>
                </dl>
              </Card>
              <Card>
                <CardHeader title="Enquiries" />
                {enquiries.length === 0 ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">None.</p> : (
                  <ul className="divide-y divide-line border-t border-line">
                    {enquiries.map((q) => (
                      <li key={q.id}><Link href={`/enquiries/${q.id}`} className="flex items-center gap-2 px-5 py-2.5 hover:bg-zinc-50/70">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-ink">{q.title}</p>
                          <p className="text-[11.5px] text-ink-faint">ENQ-{q.number} · {ENQUIRY_SOURCE[q.source]} · {relative(q.received_at)}</p>
                        </div>
                        <Badge tone={ENQUIRY_STATUS[q.status].tone}>{ENQUIRY_STATUS[q.status].label}</Badge>
                      </Link></li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <CardHeader title="Latest notes" action={<Link href={`/clients/${id}?tab=notes`} className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">Add note</Link>} />
                {notes.length === 0 ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">No notes yet.</p> : (
                  <ul className="space-y-2 px-5 pb-5">
                    {notes.slice(0, 3).map((n) => (
                      <li key={n.id} className="rounded-lg bg-amber-50/60 px-3 py-2 ring-1 ring-inset ring-amber-100">
                        <p className="line-clamp-3 whitespace-pre-line text-[13px] text-ink">{n.body}</p>
                        <p className="mt-1 text-[11.5px] text-ink-faint">{names[n.created_by ?? ""] ?? "Team member"} · {relative(n.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === "events" && (
          <Card>
            <CardHeader title="Events" subtitle={`${upcoming.length} upcoming · ${events.length} in total`}
              action={<ButtonLink href={`/events/new?customer=${c.id}`} size="sm" className="h-10 sm:h-8">New event</ButtonLink>} />
            {events.length === 0 ? <EmptyState title="No events yet">Create an event for this client, or convert one of their enquiries.</EmptyState> : (<>
              <ul className="divide-y divide-line border-t border-line md:hidden">
                {[...upcoming, ...events.filter((e) => !upcoming.includes(e))].map((e) => {
                  const q = quotes.find((x) => x.event_id === e.id && x.status !== "superseded");
                  const v = q ? currentVersion(q) : null;
                  return (
                    <li key={e.id}>
                      <Link href={`/events/${e.id}`} className="flex items-center gap-3 px-5 py-3 active:bg-zinc-50">
                        <DateChip iso={e.event_date} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium text-ink">{e.name}</p>
                          <p className="truncate text-[12px] text-ink-muted">{[relativeDay(e.event_date, today), e.venue, e.guest_count ? `${e.guest_count} guests` : null].filter(Boolean).join(" · ") || `EV-${e.number}`}</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <Badge tone={EVENT_STATUS[e.status].tone} dot>{EVENT_STATUS[e.status].label}</Badge>
                            <span className="tabular text-[13px] text-ink">{v ? money(v.total, cur) : q ? "Draft" : ""}</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] text-left text-[13px]">
                  <thead><tr className="border-y border-line text-[11.5px] uppercase tracking-wide text-ink-faint">
                    {["Event", "Date", "Type", "Venue", "Guests", "Quote", "Status"].map((h) => <th key={h} className={cn("px-5 py-2.5 font-medium", ["Guests", "Quote"].includes(h) && "text-right")}>{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {[...upcoming, ...events.filter((e) => !upcoming.includes(e))].map((e) => {
                      const q = quotes.find((x) => x.event_id === e.id && x.status !== "superseded");
                      const v = q ? currentVersion(q) : null;
                      return (
                        <tr key={e.id} className="relative hover:bg-zinc-50/70">
                          <td className="px-5 py-3">
                            <Link href={`/events/${e.id}`} className="font-medium text-ink after:absolute after:inset-0 hover:text-brand-700">{e.name}</Link>
                            <span className="block text-[11.5px] text-ink-faint">EV-{e.number}</span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{fmtDate(e.event_date)}<span className="block text-[11.5px] text-ink-faint">{relativeDay(e.event_date, today)}</span></td>
                          <td className="px-5 py-3 text-ink-muted">{e.event_type ?? "—"}</td>
                          <td className="px-5 py-3 text-ink-muted">{e.venue ?? "—"}</td>
                          <td className="tabular px-5 py-3 text-right text-ink-muted">{e.guest_count ?? "—"}</td>
                          <td className="tabular px-5 py-3 text-right text-ink">{v ? money(v.total, cur) : q ? "Draft" : "—"}</td>
                          <td className="px-5 py-3"><Badge tone={EVENT_STATUS[e.status].tone} dot>{EVENT_STATUS[e.status].label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>)}
          </Card>
        )}

        {tab === "emails" && (
          <Card>
            <CardHeader title="Email history" subtitle="Every conversation with this client, across all their enquiries and events. Gmail stays the source of truth."
              action={<span className="block max-w-[10rem] text-right text-[11.5px] text-ink-faint sm:max-w-none">{gmailConnected ? "Gmail connected" : "Gmail not connected"}</span>} />
            {threads.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-5 pb-3">
                {[...new Set(threads.map((t) => t.classification))].map((k) => (
                  <Badge key={k} tone={CLASSIFICATION[k].tone}>{CLASSIFICATION[k].label} · {threads.filter((t) => t.classification === k).length}</Badge>
                ))}
              </div>
            )}
            <Conversation threads={threads} messages={messages} tz={tz} orgName={org.name} gmailConnected={gmailConnected} />
          </Card>
        )}

        {tab === "quotes" && (
          <Card>
            <CardHeader title="Quotes" subtitle={`${allVersions.length} version${allVersions.length === 1 ? "" : "s"} sent · ${money(acceptedValue, cur)} accepted`} />
            {quotes.length === 0 ? <EmptyState title="No quotes yet">Quotes are created from an event.</EmptyState> : (
              <ul className="divide-y divide-line border-t border-line">
                {quotes.map((q) => {
                  const v = currentVersion(q);
                  const versions = [...q.versions].sort((a, b) => b.version_number - a.version_number);
                  return (
                    <li key={q.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/quotes/${q.id}`} className="break-words text-[13.5px] font-semibold text-ink hover:text-brand-700">Q-{q.number} · {q.title}</Link>
                          <p className="text-[12px] text-ink-muted">
                            <Link href={`/events/${q.event_id}?tab=quote`} className="hover:text-brand-700">{q.event?.name ?? "Event"}</Link>
                            {q.event?.event_date ? ` · ${fmtDate(q.event.event_date)}` : ""} · issued {fmtDate(q.issue_date)}{q.expiry_date ? ` · expires ${fmtDate(q.expiry_date)}` : ""}
                          </p>
                          {q.has_unpublished_changes && v && <p className="mt-1 text-[12px] text-amber-800">Draft has changes the client hasn’t seen yet.</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular text-[14px] font-semibold text-ink">{v ? money(v.total, cur) : "—"}</p>
                          <Badge tone={QUOTE_STATUS[q.status].tone} dot>{QUOTE_STATUS[q.status].label}</Badge>
                        </div>
                      </div>
                      {versions.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[520px] text-[12.5px]">
                            <thead><tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                              {["Version", "Sent", "Viewed", "Response", "Total", "Status"].map((h) => <th key={h} className={cn("py-1.5 pr-3 text-left font-medium", h === "Total" && "text-right")}>{h}</th>)}
                            </tr></thead>
                            <tbody className="divide-y divide-line">
                              {versions.map((x) => (
                                <tr key={x.id} className={cn(x.id !== q.current_version_id && "text-ink-faint")}>
                                  <td className="py-1.5 pr-3">v{x.version_number}{x.id === q.current_version_id && <span className="ml-1.5 text-[11px] text-brand-700">current</span>}</td>
                                  <td className="py-1.5 pr-3">{fmtDateTime(x.published_at, tz, "date")}</td>
                                  <td className="py-1.5 pr-3">{x.viewed_at ? fmtDateTime(x.viewed_at, tz, "date") : "—"}</td>
                                  <td className="py-1.5 pr-3">{x.responded_at ? `${fmtDateTime(x.responded_at, tz, "date")}${x.accepted_by_name ? ` · ${x.accepted_by_name}` : ""}` : "—"}</td>
                                  <td className="tabular py-1.5 pr-3 text-right">{money(x.total, cur)}</td>
                                  <td className="py-1.5"><Badge tone={QUOTE_STATUS[x.status].tone}>{QUOTE_STATUS[x.status].label}</Badge></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === "invoices" && (
          <Card>
            <CardHeader title="Invoices" subtitle={`${money(live.reduce((s, i) => s + Number(i.total), 0), cur)} invoiced · ${money(outstanding, cur)} outstanding`}
              action={<span className="block max-w-[10rem] text-right text-[11.5px] text-ink-faint sm:max-w-none">{xeroConnected ? "Synced with Xero" : "Xero not connected · invoices recorded in EventureOS"}</span>} />
            {invoices.length === 0 ? <EmptyState title="No invoices yet">Invoices raised for this client’s events appear here.</EmptyState> : (<>
              <ul className="divide-y divide-line border-t border-line md:hidden">
                {invoices.map((i) => (
                  <li key={i.id} className={cn("relative px-5 py-3 active:bg-zinc-50", i.status === "void" && "opacity-60")}>
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/invoices/${i.id}`} className="min-w-0 truncate text-[13.5px] font-medium text-ink after:absolute after:inset-0">{i.number} <span className="font-normal capitalize text-ink-faint">· {i.kind}</span></Link>
                      <Badge tone={INVOICE_STATUS[i.status].tone} dot>{INVOICE_STATUS[i.status].label}</Badge>
                    </div>
                    {i.event?.name && <p className="mt-0.5 truncate text-[12px] text-ink-muted">{i.event.name}</p>}
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className={cn(overdue.includes(i) ? "font-medium text-rose-700" : "text-ink-muted")}>Due {fmtDate(i.due_date)}</span>
                      <span className="tabular shrink-0 text-ink-muted">{money(i.amount_paid, cur)} of {money(i.total, cur)} paid</span>
                    </div>
                    <p className="tabular mt-0.5 text-right text-[13px] font-medium text-ink">Balance {money(i.balance, cur)}</p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] text-left text-[13px]">
                  <thead><tr className="border-y border-line text-[11.5px] uppercase tracking-wide text-ink-faint">
                    {["Invoice", "Event", "Issued", "Due", "Amount", "Paid", "Balance", "Status"].map((h) => <th key={h} className={cn("px-5 py-2.5 font-medium", ["Amount", "Paid", "Balance"].includes(h) && "text-right")}>{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {invoices.map((i) => (
                      <tr key={i.id} className={cn(i.status === "void" && "text-ink-faint")}>
                        <td className="px-5 py-3"><Link href={`/invoices/${i.id}`} className="font-medium text-ink hover:text-brand-700">{i.number}</Link><span className="block text-[11.5px] capitalize text-ink-faint">{i.kind}{i.xero_invoice_id ? " · in Xero" : ""}</span></td>
                        <td className="px-5 py-3 text-ink-muted">{i.event_id ? <Link href={`/events/${i.event_id}?tab=invoice`} className="hover:text-brand-700">{i.event?.name}</Link> : "—"}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{fmtDate(i.issue_date)}</td>
                        <td className={cn("whitespace-nowrap px-5 py-3", overdue.includes(i) ? "font-medium text-rose-700" : "text-ink-muted")}>{fmtDate(i.due_date)}</td>
                        <td className="tabular px-5 py-3 text-right text-ink">{money(i.total, cur)}</td>
                        <td className="tabular px-5 py-3 text-right text-ink-muted">{money(i.amount_paid, cur)}</td>
                        <td className="tabular px-5 py-3 text-right font-medium text-ink">{money(i.balance, cur)}</td>
                        <td className="px-5 py-3"><Badge tone={INVOICE_STATUS[i.status].tone} dot>{INVOICE_STATUS[i.status].label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
          </Card>
        )}

        {tab === "payments" && (
          <Card className="max-w-3xl">
            <CardHeader title="Payments" subtitle={`${money(lifetime, cur)} received in total`} />
            {payments.length === 0 ? <EmptyState title="No payments yet" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">
                        <Link href={`/invoices/${p.invoice.id}`} className="hover:text-brand-700">{p.invoice.number}</Link>
                      </p>
                      <p className="text-[12px] text-ink-muted">{fmtDateTime(p.paid_at, tz, "date")} · {p.method ?? "Payment"}{p.reference ? ` · ref ${p.reference}` : ""}{p.xero_payment_id ? " · from Xero" : ""}</p>
                    </div>
                    <span className="tabular shrink-0 text-[13.5px] font-medium text-emerald-700">{money(p.amount, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "documents" && (
          <Card className="max-w-3xl">
            <CardHeader title="Documents" subtitle="Files for this client and all of their events" />
            <DocumentsList docs={docs} />
          </Card>
        )}

        {tab === "notes" && (
          <Card className="max-w-3xl">
            <CardHeader title="Notes" subtitle="Internal — includes notes left on this client’s enquiries and events" />
            <NotesPanel notes={notes} names={names} action={addNote.bind(null, { customerId: c.id })} />
          </Card>
        )}

        {tab === "activity" && (
          <Card className="max-w-3xl">
            <CardHeader title="Activity & audit trail" subtitle="Everything that’s happened with this client, by whom and when" />
            <ActivityFeed items={activity} names={names} tz={tz} />
            {activity.length === 300 && <p className="px-5 pb-4 text-[12px] text-ink-faint">Showing the latest 300 entries.</p>}
          </Card>
        )}
      </div>
      <p className="mt-8 text-[11.5px] text-ink-faint">Client record updated {relative(c.updated_at)}</p>
    </div>
  );
}

function HeaderStat({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className={cn("mt-1 text-[17px] font-semibold tracking-tight", alert ? "text-rose-700" : "text-ink")}>{value}</dd>
      {sub && <dd className="truncate text-[12px] text-ink-faint">{sub}</dd>}
    </div>
  );
}

function DateChip({ iso }: { iso: string | null }) {
  if (!iso) return <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-50 ring-1 ring-line"><CalendarDays className="h-4 w-4 text-ink-faint" /></span>;
  const [day, mon] = fmtDate(iso, "short").split(" ");
  return (
    <div className="w-11 shrink-0 rounded-lg bg-zinc-50 py-1 text-center ring-1 ring-line">
      <div className="text-[10px] font-semibold uppercase text-ink-faint">{mon}</div>
      <div className="text-[16px] font-semibold leading-tight text-ink">{day}</div>
    </div>
  );
}

