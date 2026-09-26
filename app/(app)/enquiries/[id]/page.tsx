import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Mail, Phone, Building2 } from "lucide-react";
import { requireOrg, getMembers } from "@/lib/context";
import { Card, CardHeader, Field } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Conversation } from "@/components/records/conversation";
import { NotesPanel, type NoteRow } from "@/components/records/notes-panel";
import { TasksPanel } from "@/components/records/tasks-panel";
import { DocumentsList, type DocRow } from "@/components/records/documents-list";
import { ActivityFeed } from "@/components/records/activity-feed";
import { NextActionBanner } from "@/components/records/next-action";
import { AssignSelect, ConvertToEvent, DetailsEditor, StatusSelect } from "./controls";
import { addNote, createTask } from "@/app/(app)/record-actions";
import { enquiryNextAction } from "@/lib/next-action";
import { CLASSIFICATION, ENQUIRY_SOURCE, ENQUIRY_STATUS, EVENT_STATUS, QUOTE_STATUS } from "@/lib/status";
import { fmtDate, fmtDateTime, money, relative, relativeDay, timeRange, todayISO, zonedMidnightUTC, addDaysISO } from "@/lib/format";
import type { ActivityLog, EmailMessage, EmailThread, Enquiry, EventStatus, QuoteStatus, Task } from "@/lib/types";

export const metadata = { title: "Enquiry" };

export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const tz = org.timezone;

  const { data: enquiry, error } = await supabase
    .from("enquiries")
    .select("*, customer:customers(id, name, company, email, phone, customer_since, kind), contact:contacts(first_name, last_name, email, phone, position), event:events!enquiries_event_id_organisation_id_fkey(id, number, name, status)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Could not load enquiry: ${error.message}`);
  if (!enquiry) notFound();
  const e = enquiry as Enquiry & {
    customer: { id: string; name: string; company: string | null; email: string | null; phone: string | null; customer_since: string; kind: string } | null;
    contact: { first_name: string; last_name: string | null; email: string | null; phone: string | null; position: string | null } | null;
    event: { id: string; number: number; name: string; status: EventStatus } | null;
  };

  const threadFilter = [`enquiry_id.eq.${e.id}`, e.event_id ? `event_id.eq.${e.event_id}` : null].filter(Boolean).join(",");
  const dayStart = e.event_date ? zonedMidnightUTC(e.event_date, tz) : null;
  const dayEnd = e.event_date ? zonedMidnightUTC(addDaysISO(e.event_date, 1), tz) : null;

  const [threadsRes, notesRes, tasksRes, docsRes, activityRes, members, sameDayRes, calRes, quotesRes, gmailRes, historyRes] = await Promise.all([
    supabase.from("email_threads").select("*").eq("organisation_id", org.id).or(threadFilter).order("last_message_at", { ascending: false }),
    supabase.from("notes").select("id, body, created_at, created_by").eq("organisation_id", org.id).eq("enquiry_id", e.id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("organisation_id", org.id).eq("enquiry_id", e.id).order("due_at", { nullsFirst: false }),
    supabase.from("documents").select("id, name, size_bytes, visibility, requested_from_customer, created_at").eq("organisation_id", org.id).eq("enquiry_id", e.id),
    supabase.from("activity_logs").select("*").eq("organisation_id", org.id).eq("enquiry_id", e.id).order("created_at", { ascending: false }).limit(40),
    getMembers(org.id),
    e.event_date
      ? supabase.from("events").select("id, name, status, start_time, finish_time, equipment").eq("organisation_id", org.id).eq("event_date", e.event_date).not("status", "in", "(cancelled)")
      : Promise.resolve({ data: [], error: null }),
    dayStart && dayEnd
      ? supabase.from("calendar_events").select("id, title, starts_at, ends_at, event_id, calendar:calendar_connections(name, colour)").eq("organisation_id", org.id).lt("starts_at", dayEnd).gt("ends_at", dayStart)
      : Promise.resolve({ data: [], error: null }),
    e.event_id
      ? supabase.from("quotes").select("id, number, title, status, version:quote_versions!quotes_current_version_id_organisation_id_fkey(total)").eq("organisation_id", org.id).eq("event_id", e.event_id)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle(),
    e.customer_id
      ? supabase.from("events").select("id, name, event_date, status").eq("organisation_id", org.id).eq("customer_id", e.customer_id).order("event_date", { ascending: false }).limit(5)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [threadsRes, notesRes, tasksRes, docsRes, activityRes, sameDayRes, calRes, quotesRes, historyRes]) {
    if (r.error) throw new Error(`Could not load enquiry details: ${r.error.message}`);
  }
  const threads = (threadsRes.data ?? []) as EmailThread[];
  const { data: msgs, error: mErr } = threads.length
    ? await supabase.from("email_messages").select("*").in("thread_id", threads.map((t) => t.id))
    : { data: [], error: null };
  if (mErr) throw new Error(`Could not load messages: ${mErr.message}`);

  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const memberOpts = members.map((m) => ({ id: m.id, name: m.full_name ?? m.email }));
  const na = enquiryNextAction(e);
  const s = ENQUIRY_STATUS[e.status];
  const today = todayISO(tz);
  const sameDay = ((sameDayRes.data ?? []) as { id: string; name: string; status: EventStatus; start_time: string | null; finish_time: string | null }[]).filter((x) => x.id !== e.event_id);
  const cal = (calRes.data ?? []) as unknown as { id: string; title: string; starts_at: string; ends_at: string; event_id: string | null; calendar: { name: string; colour: string } | null }[];
  const quotes = (quotesRes.data ?? []) as unknown as { id: string; number: number; title: string; status: QuoteStatus; version: { total: number } | null }[];
  const history = ((historyRes.data ?? []) as { id: string; name: string; event_date: string | null; status: EventStatus }[]).filter((x) => x.id !== e.event_id);
  const gmailConnected = gmailRes.data?.status === "connected";

  const displayName = e.customer?.name ?? e.contact_name ?? e.contact_email ?? "Unknown sender";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-faint">
            <Link href="/enquiries" className="hover:text-ink">Enquiries</Link><span>/</span><span>ENQ-{e.number}</span>
          </div>
          <h1 className="break-words text-[20px] font-semibold tracking-tight text-ink sm:text-[22px]">{e.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
            <Badge tone={s.tone} dot>{s.label}</Badge>
            <span className="min-w-0 break-all">{displayName}</span><span className="text-ink-faint">·</span>
            <span>{ENQUIRY_SOURCE[e.source]}</span><span className="text-ink-faint">·</span>
            <span title={fmtDateTime(e.received_at, tz)}>Received {relative(e.received_at)}</span>
            {e.classification && (
              <><span className="text-ink-faint">·</span><Badge tone={CLASSIFICATION[e.classification].tone}>
                {CLASSIFICATION[e.classification].label}{e.classification_confidence != null ? ` ${Math.round(e.classification_confidence * 100)}%` : ""}
              </Badge></>
            )}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <AssignSelect id={e.id} assignee={e.assigned_to} members={memberOpts} />
          <StatusSelect id={e.id} status={e.status} />
          {e.event ? (
            <ButtonLink href={`/events/${e.event.id}`} variant="primary" className="col-span-2 h-10 sm:h-9">Open event EV-{e.event.number} <ArrowUpRight className="h-4 w-4" /></ButtonLink>
          ) : (
            !["lost", "archived"].includes(e.status) && <ConvertToEvent id={e.id} defaultName={e.title} />
          )}
        </div>
      </div>

      <NextActionBanner action={na} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr]">
        <div className="space-y-6 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          {e.message && (
            <Card>
              <CardHeader title="Original enquiry" subtitle={`${ENQUIRY_SOURCE[e.source]} · ${fmtDateTime(e.received_at, tz)}`} />
              <p className="whitespace-pre-line break-words px-5 pb-5 text-[13.5px] leading-relaxed text-ink">{e.message}</p>
            </Card>
          )}
          <Card>
            <CardHeader title="Email conversation" subtitle={threads.length ? `${threads.length} thread${threads.length > 1 ? "s" : ""}` : undefined} />
            <Conversation threads={threads} messages={(msgs ?? []) as EmailMessage[]} tz={tz} orgName={org.name} gmailConnected={gmailConnected} />
          </Card>
          <Card>
            <CardHeader title="Notes" />
            <NotesPanel notes={(notesRes.data ?? []) as NoteRow[]} names={names} action={addNote.bind(null, { enquiryId: e.id, customerId: e.customer_id })} />
          </Card>
          <Card>
            <CardHeader title="Activity history" />
            <ActivityFeed items={(activityRes.data ?? []) as ActivityLog[]} names={names} tz={tz} />
          </Card>
        </div>

        {/* Side column — on phones/tablets the summary cards come first, before the conversation. */}
        <div className="order-first space-y-6 xl:order-none xl:col-start-2 xl:row-start-1">
          <Card>
            <CardHeader title="Customer" action={e.customer && <Link href={`/clients/${e.customer.id}`} className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">View record</Link>} />
            <div className="px-5 pb-5">
              <div className="flex items-center gap-3">
                <Avatar name={displayName} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">{displayName}</p>
                  <p className="truncate text-[12.5px] text-ink-muted">
                    {e.customer ? (e.customer.kind === "company" ? `${e.contact?.first_name ?? ""} ${e.contact?.last_name ?? ""}`.trim() || "Company" : "Individual") : "Not yet a customer — created on conversion"}
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-[13px]">
                {(e.contact?.email ?? e.customer?.email ?? e.contact_email) && (
                  <li className="flex min-w-0 items-center gap-2 text-ink"><Mail className="h-4 w-4 shrink-0 text-ink-faint" /><a href={`mailto:${e.contact?.email ?? e.customer?.email ?? e.contact_email}`} className="min-w-0 break-all hover:text-brand-700">{e.contact?.email ?? e.customer?.email ?? e.contact_email}</a></li>
                )}
                {(e.contact?.phone ?? e.customer?.phone ?? e.contact_phone) && (
                  <li className="flex min-w-0 items-center gap-2 text-ink"><Phone className="h-4 w-4 shrink-0 text-ink-faint" /><a href={`tel:${(e.contact?.phone ?? e.customer?.phone ?? e.contact_phone ?? "").replace(/\s+/g, "")}`} className="min-w-0 break-words hover:text-brand-700">{e.contact?.phone ?? e.customer?.phone ?? e.contact_phone}</a></li>
                )}
                {(e.customer?.company ?? e.company) && (
                  <li className="flex min-w-0 items-center gap-2 text-ink"><Building2 className="h-4 w-4 shrink-0 text-ink-faint" /><span className="min-w-0 break-words">{e.customer?.company ?? e.company}</span></li>
                )}
              </ul>
              {e.customer && (
                <p className="mt-3 text-[12px] text-ink-faint">Customer since {fmtDate(e.customer.customer_since)}</p>
              )}
              {history.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Previous events</p>
                  <ul className="space-y-1">
                    {history.map((h) => (
                      <li key={h.id}><Link href={`/events/${h.id}`} className="flex justify-between gap-2 text-[12.5px] text-ink hover:text-brand-700">
                        <span className="truncate">{h.name}</span><span className="shrink-0 text-ink-faint">{fmtDate(h.event_date, "short")}</span>
                      </Link></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Event details" />
            <DetailsEditor
              id={e.id}
              values={{ title: e.title, event_type: e.event_type, event_date: e.event_date, guest_count: e.guest_count, budget: e.budget, venue: e.venue, next_action: e.next_action, next_action_due: e.next_action_due, contact_phone: e.contact_phone }}
              view={
                <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
                  <Field label="Event type">{e.event_type ?? "—"}</Field>
                  <Field label="Event date">{e.event_date ? <>{fmtDate(e.event_date)} <span className="text-ink-faint">· {relativeDay(e.event_date, today)}</span></> : "—"}</Field>
                  <Field label="Guests">{e.guest_count ?? "—"}</Field>
                  <Field label="Budget">{e.budget ? money(e.budget, org.currency, { cents: false }) : "—"}</Field>
                  <Field label="Venue" className="col-span-2">{e.venue ?? "—"}</Field>
                  <Field label="Source">{ENQUIRY_SOURCE[e.source]}</Field>
                  <Field label="Last contact">{e.last_contact_at ? relative(e.last_contact_at) : "Not yet"}</Field>
                </dl>
              }
            />
          </Card>

          <Card>
            <CardHeader title="Calendar availability" subtitle={e.event_date ? fmtDate(e.event_date, "long") : "Add an event date to check availability"} />
            {e.event_date && (
              <div className="px-5 pb-5">
                {cal.length === 0 && sameDay.length === 0 ? (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800 ring-1 ring-inset ring-emerald-100">Free — nothing booked that day.</p>
                ) : (
                  <>
                    <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 ring-1 ring-inset ring-amber-100">
                      {cal.length + sameDay.filter((x) => !cal.some((c) => c.event_id === x.id)).length} booking(s) already on this day — check resources.
                    </p>
                    <ul className="space-y-1.5">
                      {cal.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-x-2 text-[12.5px] sm:flex-nowrap">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.calendar?.colour ?? "#6028EC" }} />
                          <span className="min-w-0 flex-1 truncate text-ink">{c.title}</span>
                          <span className="w-full pl-4 text-ink-faint sm:w-auto sm:pl-0">{fmtDateTime(c.starts_at, tz, "time")}–{fmtDateTime(c.ends_at, tz, "time")} · {c.calendar?.name}</span>
                        </li>
                      ))}
                      {sameDay.filter((x) => !cal.some((c) => c.event_id === x.id)).map((x) => (
                        <li key={x.id} className="flex flex-wrap items-center gap-x-2 text-[12.5px] sm:flex-nowrap">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-300" />
                          <Link href={`/events/${x.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-brand-700">{x.name}</Link>
                          <span className="w-full pl-4 text-ink-faint sm:w-auto sm:pl-0">{timeRange(x.start_time, x.finish_time)} · {EVENT_STATUS[x.status].label}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Quote" />
            <div className="px-5 pb-5">
              {quotes.length ? quotes.map((q) => (
                <Link key={q.id} href={`/quotes/${q.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-zinc-50 sm:py-1.5">
                  <span className="min-w-0 break-words text-[13px] text-ink">Q-{q.number} · {q.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {q.version && <span className="tabular text-[13px] text-ink">{money(q.version.total, org.currency)}</span>}
                    <Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
                  </span>
                </Link>
              )) : (
                <p className="text-[12.5px] text-ink-muted">
                  {e.event_id ? <Link href={`/quotes/new?event=${e.event_id}`} className="font-medium text-brand-600 hover:text-brand-700">Create a quote for this event</Link> : "Quotes belong to events. Convert this enquiry to start a quote."}
                </p>
              )}
            </div>
          </Card>

        </div>

        <div className="space-y-6 xl:col-start-2 xl:row-start-2 xl:self-start">
          <Card>
            <CardHeader title="Tasks" />
            <TasksPanel tasks={(tasksRes.data ?? []) as Task[]} members={memberOpts} action={createTask.bind(null, { enquiryId: e.id, customerId: e.customer_id, eventId: e.event_id })} />
          </Card>

          <Card>
            <CardHeader title="Attachments" />
            <DocumentsList docs={(docsRes.data ?? []) as DocRow[]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
