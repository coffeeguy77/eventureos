import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireOrg, getMembers } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ClientTabs } from "@/components/ui/client-tabs";
import { Kpi } from "@/components/records/kpi";
import { ActivityFeed } from "@/components/records/activity-feed";
import { TaskCheckbox } from "@/components/records/task-checkbox";
import {
  addDaysISO, compactMoney, daysBetween, fmtDate, fmtDateTime, firstName, greeting, money,
  monthBoundsUTC, relative, relativeDay, timeRange, todayISO,
} from "@/lib/format";
import { ENQUIRY_SOURCE, EVENT_STATUS, INVOICE_STATUS } from "@/lib/status";
import type { ActivityLog, EventStatus, InvoiceStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Dashboard" };

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

export default async function DashboardPage() {
  const { supabase, org, profile } = await requireOrg();
  const tz = org.timezone;
  const today = todayISO(tz);
  const in7 = addDaysISO(today, 6);
  const in30 = addDaysISO(today, 29);
  const month = monthBoundsUTC(tz);
  const nowIso = new Date().toISOString();
  const cur = org.currency;

  const [eventsRes, enquiriesRes, quotesRes, invoicesRes, paymentsRes, threadsRes, tasksRes, activityRes, calRes, messagesRes, members, confirmedRes, overdueEventsRes] =
    await Promise.all([
      supabase.from("events")
        .select("id, number, name, event_date, start_time, finish_time, venue, status, guest_count, customer:customers(name)")
        .eq("organisation_id", org.id).gte("event_date", today).lte("event_date", in30).neq("status", "cancelled")
        .order("event_date").order("start_time"),
      supabase.from("enquiries")
        .select("id, number, title, status, source, received_at, event_date, contact_name, next_action, next_action_due, customer:customers(name)")
        .eq("organisation_id", org.id).in("status", ["new", "needs_review", "contacted", "qualified", "quote_required", "quote_sent", "negotiating"])
        .order("received_at", { ascending: false }),
      supabase.from("quotes")
        .select("id, number, title, status, event_id, has_unpublished_changes, updated_at, event:events(name, event_date), customer:customers(name), version:quote_versions!quotes_current_version_id_organisation_id_fkey(total, published_at, viewed_at)")
        .eq("organisation_id", org.id).in("status", ["draft", "sent", "viewed"]),
      supabase.from("invoices")
        .select("id, number, status, total, balance, due_date, event_id, customer_id, customer:customers(name), event:events(name)")
        .eq("organisation_id", org.id).in("status", ["awaiting_payment", "part_paid", "overdue"])
        .order("due_date"),
      supabase.from("payments").select("amount").eq("organisation_id", org.id).gte("paid_at", month.start).lt("paid_at", month.end),
      supabase.from("email_threads")
        .select("id, subject, classification, state, last_message_at, event_id, enquiry_id, customer_id, participants")
        .eq("organisation_id", org.id).or("state.eq.needs_reply,classification.eq.needs_review").neq("classification", "spam")
        .order("last_message_at", { ascending: false }),
      supabase.from("tasks")
        .select("id, title, status, priority, due_at, assigned_to, event_id, enquiry_id, event:events(name), enquiry:enquiries(title)")
        .eq("organisation_id", org.id).neq("status", "done").order("due_at", { ascending: true, nullsFirst: false }).limit(8),
      supabase.from("activity_logs").select("*").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(12),
      supabase.from("calendar_events")
        .select("id, title, starts_at, ends_at, event_id, calendar_connection_id, calendar:calendar_connections(name, colour)")
        .eq("organisation_id", org.id).gte("starts_at", new Date(Date.parse(nowIso) - 12 * 3600e3).toISOString())
        .lte("starts_at", new Date(Date.parse(nowIso) + 8 * 86400e3).toISOString()).order("starts_at"),
      supabase.from("email_messages")
        .select("id, direction, from_name, from_email, snippet, sent_at, is_read, thread:email_threads!inner(id, subject, classification, event_id, enquiry_id, customer_id)")
        .eq("organisation_id", org.id).neq("thread.classification", "spam").neq("thread.classification", "supplier")
        .order("sent_at", { ascending: false }).limit(6),
      getMembers(org.id),
      supabase.from("events").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "confirmed").gte("event_date", today),
      supabase.from("events").select("id, name, next_action, next_action_due, status, customer:customers(name)")
        .eq("organisation_id", org.id).lt("next_action_due", nowIso).not("status", "in", "(completed,cancelled)"),
    ]);

  const events = must<Row[]>(eventsRes, "events");
  const enquiries = must<Row[]>(enquiriesRes, "enquiries");
  const quotes = must<Row[]>(quotesRes, "quotes");
  const invoices = must<Row[]>(invoicesRes, "invoices");
  const payments = must<Row[]>(paymentsRes, "payments");
  const threads = must<Row[]>(threadsRes, "email");
  const tasks = must<Row[]>(tasksRes, "tasks");
  const activity = must<ActivityLog[]>(activityRes, "activity");
  const cal = must<Row[]>(calRes, "calendar");
  const messages = must<Row[]>(messagesRes, "messages");
  const overdueEvents = must<Row[]>(overdueEventsRes, "events");
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const { data: integ } = await supabase.from("integrations").select("provider, status, last_sync_at").eq("organisation_id", org.id);
  const conn = (p: string) => (integ ?? []).find((i) => i.provider === p);
  const connLabel = (p: string, name: string) => {
    const i = conn(p);
    return i?.status === "connected" ? `${name} synced ${i.last_sync_at ? relative(i.last_sync_at) : "—"}` : `${name} not connected`;
  };

  // ---- KPIs -------------------------------------------------------------
  const newEnquiries = enquiries.filter((e) => e.status === "new" || e.status === "needs_review");
  const drafts = quotes.filter((q) => q.status === "draft");
  const awaiting = quotes.filter((q) => q.status !== "draft");
  const outstanding = invoices.reduce((s, i) => s + Number(i.balance), 0);
  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const revenue = payments.reduce((s, p) => s + Number(p.amount), 0);

  // ---- Attention centre -------------------------------------------------
  type Item = { key: string; title: string; subtitle: string; href: string; meta: string; alert?: boolean };
  const enquiryItem = (e: Row, meta?: string, alert?: boolean): Item => ({
    key: "enq" + e.id,
    title: e.title,
    subtitle: `${e.customer?.name ?? e.contact_name ?? "Unknown sender"} · ${ENQUIRY_SOURCE[e.source as keyof typeof ENQUIRY_SOURCE]}`,
    href: `/enquiries/${e.id}`,
    meta: meta ?? `Received ${relative(e.received_at)}`,
    alert,
  });
  const threadHref = (t: Row) =>
    t.event_id ? `/events/${t.event_id}?tab=communication` : t.enquiry_id ? `/enquiries/${t.enquiry_id}` : t.customer_id ? `/clients/${t.customer_id}` : "/enquiries";

  const reviewEnquiryIds = new Set(enquiries.filter((e) => e.status === "needs_review").map((e) => e.id));
  const buckets: { key: string; label: string; items: Item[]; alert?: boolean }[] = [
    { key: "new", label: "New enquiries", items: enquiries.filter((e) => e.status === "new").map((e) => enquiryItem(e)) },
    {
      key: "reply", label: "Needs reply",
      items: threads.filter((t) => t.state === "needs_reply" && t.classification !== "needs_review").map((t) => ({
        key: "t" + t.id, title: t.subject ?? "(no subject)",
        subtitle: (t.participants as string[]).filter((p) => p !== org.contact_email).join(", "),
        href: threadHref(t), meta: `Last message ${relative(t.last_message_at)}`,
      })),
    },
    {
      key: "review", label: "Needs review",
      items: [
        ...enquiries.filter((e) => e.status === "needs_review").map((e) => enquiryItem(e, "Uncertain classification — confirm")),
        ...threads.filter((t) => t.classification === "needs_review" && !reviewEnquiryIds.has(t.enquiry_id)).map((t) => ({
          key: "t" + t.id, title: t.subject ?? "(no subject)", subtitle: (t.participants as string[]).join(", "),
          href: threadHref(t), meta: relative(t.last_message_at),
        })),
      ],
    },
    { key: "quote_req", label: "Quote requested", items: enquiries.filter((e) => e.status === "quote_required").map((e) => enquiryItem(e, e.next_action ?? "Prepare quote")) },
    {
      key: "viewed", label: "Quote viewed",
      items: quotes.filter((q) => q.status === "viewed").map((q) => ({
        key: "q" + q.id, title: `Q-${q.number} · ${q.event?.name ?? q.title}`, subtitle: `${q.customer?.name} · ${money(q.version?.total, cur)}`,
        href: `/quotes/${q.id}`, meta: `Viewed ${relative(q.version?.viewed_at)}`,
      })),
    },
    {
      key: "approval", label: "Awaiting approval",
      items: quotes.filter((q) => q.status === "sent").map((q) => ({
        key: "q" + q.id, title: `Q-${q.number} · ${q.event?.name ?? q.title}`, subtitle: `${q.customer?.name} · ${money(q.version?.total, cur)}`,
        href: `/quotes/${q.id}`, meta: `Sent ${relative(q.version?.published_at)} · not yet opened`,
      })),
    },
    {
      key: "overdue", label: "Follow-up overdue", alert: true,
      items: [
        ...enquiries.filter((e) => e.next_action_due && e.next_action_due < nowIso).map((e) => enquiryItem(e, `${e.next_action} · due ${relative(e.next_action_due)}`, true)),
        ...overdueEvents.map((e) => ({
          key: "ev" + e.id, title: e.name, subtitle: e.customer?.name ?? "", href: `/events/${e.id}`,
          meta: `${e.next_action} · due ${relative(e.next_action_due)}`, alert: true,
        })),
      ],
    },
  ];

  // ---- Upcoming events --------------------------------------------------
  const eventsToday = events.filter((e) => e.event_date === today);
  const eventsWeek = events.filter((e) => e.event_date <= in7);

  // ---- Calendar strip: next 7 days, with same-calendar overlaps flagged --
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i));
  const localDay = (ts: string) => todayISO(tz, new Date(ts));
  const conflicts = new Set<string>();
  for (const a of cal) for (const b of cal) {
    if (a.id < b.id && a.calendar_connection_id === b.calendar_connection_id && a.starts_at < b.ends_at && b.starts_at < a.ends_at) {
      conflicts.add(a.id); conflicts.add(b.id);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[24px] font-semibold tracking-tight text-ink">
          {greeting(tz)}, {firstName(profile.full_name, profile.email)}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">Here’s what’s happening with your event business today.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="New enquiries" value={newEnquiries.length} href="/enquiries?status=new"
          sub={`${enquiries.filter((e) => e.status === "needs_review").length} need review`} />
        <Kpi label="Quotes to action" value={drafts.length + awaiting.length} href="/quotes"
          sub={`${drafts.length} draft · ${awaiting.length} awaiting reply`} />
        <Kpi label="Bookings confirmed" value={confirmedRes.count ?? 0} href="/events?status=confirmed" sub="Upcoming, confirmed" />
        <Kpi label="Upcoming events" value={events.length} href="/events" sub={`${eventsWeek.length} in the next 7 days`} />
        <Kpi label="Outstanding invoices" value={compactMoney(outstanding, cur)} href="/invoices" alert={overdueInvoices.length > 0}
          sub={`${invoices.length} open · ${overdueInvoices.length} overdue`} />
        <Kpi label={`Revenue · ${month.label}`} value={compactMoney(revenue, cur)} href="/payments" sub="Payments recorded this month" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Inbox & enquiry attention centre" subtitle="Everything that needs a human. Nothing gets lost." />
            <ClientTabs
              tabs={buckets.map((b) => ({
                key: b.key, label: b.label, count: b.items.length, tone: b.alert ? "alert" : undefined,
                content: b.items.length === 0 ? (
                  <EmptyState title="All clear">Nothing waiting in {b.label.toLowerCase()}.</EmptyState>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {b.items.map((it) => (
                      <li key={it.key}>
                        <Link href={it.href} className="flex items-center gap-4 px-5 py-3 hover:bg-zinc-50/70">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium text-ink">{it.title}</p>
                            <p className="truncate text-[12.5px] text-ink-muted">{it.subtitle}</p>
                          </div>
                          <span className={cn("shrink-0 text-right text-[12px]", it.alert ? "font-medium text-rose-700" : "text-ink-faint")}>{it.meta}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ),
              }))}
            />
          </Card>

          <Card>
            <CardHeader title="Upcoming events" action={<Link href="/events" className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">All events</Link>} />
            <ClientTabs
              tabs={[
                { key: "today", label: "Today", count: eventsToday.length, content: <EventList rows={eventsToday} today={today} /> },
                { key: "week", label: "Next 7 days", count: eventsWeek.length, content: <EventList rows={eventsWeek} today={today} /> },
                { key: "month", label: "Next 30 days", count: events.length, content: <EventList rows={events} today={today} /> },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Next 7 days" subtitle="Calendar preview across all resources" action={<Link href="/calendar" className="text-[11.5px] text-ink-faint hover:text-ink">{connLabel("google_calendar", "Google Calendar")}</Link>} />
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-xl border-t border-line bg-line sm:grid-cols-7">
              {days.map((d) => {
                const items = cal.filter((c) => localDay(c.starts_at) === d);
                return (
                  <div key={d} className={cn("flex gap-3 bg-white px-4 py-2.5 sm:block sm:min-h-[120px] sm:p-2", d === today && "bg-brand-50/40")}>
                    <div className={cn("w-24 shrink-0 pt-1 text-[12px] font-medium sm:mb-1.5 sm:w-auto sm:pt-0 sm:text-[11px]", d === today ? "text-brand-700" : "text-ink-faint")}>
                      {fmtDate(d, "weekday")}
                    </div>
                    {items.length === 0 && <div className="pt-1 text-[12px] text-ink-faint sm:hidden">Nothing booked</div>}
                    <div className="min-w-0 flex-1 space-y-1">
                      {items.map((c) => (
                        <Link key={c.id} href={c.event_id ? `/events/${c.event_id}` : "#"}
                          className={cn("block rounded-md border-l-[3px] bg-zinc-50 px-1.5 py-1 text-[11px] leading-tight hover:bg-zinc-100", conflicts.has(c.id) && "ring-1 ring-rose-300")}
                          style={{ borderLeftColor: c.calendar?.colour ?? "#6028EC" }}>
                          <span className="block truncate font-medium text-ink">{c.title}</span>
                          <span className="block truncate text-ink-muted">{fmtDateTime(c.starts_at, tz, "time")} · {c.calendar?.name}</span>
                          {conflicts.has(c.id) && <span className="block font-medium text-rose-700">Conflict</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Tasks requiring attention" subtitle={`${tasks.filter((t) => t.due_at && t.due_at < nowIso).length} overdue`} />
            {tasks.length === 0 ? <EmptyState title="No open tasks" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {tasks.map((t) => {
                  const overdue = t.due_at && t.due_at < nowIso;
                  const href = t.event_id ? `/events/${t.event_id}?tab=tasks` : t.enquiry_id ? `/enquiries/${t.enquiry_id}` : "#";
                  return (
                    <li key={t.id} className="flex gap-3 px-5 py-2.5">
                      <TaskCheckbox id={t.id} done={false} />
                      <div className="min-w-0 flex-1">
                        <Link href={href} className="block truncate text-[13px] font-medium text-ink hover:text-brand-700">{t.title}</Link>
                        <p className="truncate text-[12px] text-ink-muted">{t.event?.name ?? t.enquiry?.title ?? "General"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cn("text-[11.5px]", overdue ? "font-medium text-rose-700" : "text-ink-faint")}>
                          {t.due_at ? (overdue ? `Overdue ${relative(t.due_at).replace(" ago", "")}` : `Due ${relative(t.due_at)}`) : "No due date"}
                        </span>
                        {t.assigned_to && <Avatar name={names[t.assigned_to]} size={18} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card id="outstanding">
            <CardHeader title="Outstanding payments" subtitle={`${money(outstanding, cur)} across ${invoices.length} invoices`}
              action={<span className="text-[11.5px] text-ink-faint">{connLabel("xero", "Xero")}</span>} />
            {invoices.length === 0 ? <EmptyState title="Everything is paid" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {invoices.slice(0, 6).map((i) => {
                  const s = INVOICE_STATUS[i.status as InvoiceStatus];
                  const daysLate = i.due_date ? daysBetween(i.due_date, today) : 0;
                  return (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-50/70">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">{i.customer?.name}</p>
                          <p className="truncate text-[12px] text-ink-muted">{i.number} · {i.event?.name ?? "No event"}</p>
                        </div>
                        <div className="text-right">
                          <p className="tabular text-[13px] font-medium text-ink">{money(i.balance, cur)}</p>
                          <p className={cn("text-[11.5px]", i.status === "overdue" ? "text-rose-700" : "text-ink-faint")}>
                            {i.status === "overdue" ? `${daysLate}d overdue` : i.due_date ? `Due ${fmtDate(i.due_date, "short")}` : s.label}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent customer communication" action={<span className="text-[11.5px] text-ink-faint">{conn("gmail")?.status === "connected" ? connLabel("gmail", "Gmail") : "Gmail not connected · demo messages"}</span>} />
            <ul className="divide-y divide-line border-t border-line">
              {messages.map((m) => (
                <li key={m.id}>
                  <Link href={threadHref(m.thread)} className="flex gap-3 px-5 py-2.5 hover:bg-zinc-50/70">
                    <Avatar name={m.direction === "outbound" ? org.name : m.from_name ?? m.from_email} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className={cn("truncate text-[13px] text-ink", !m.is_read && "font-semibold")}>
                          {m.direction === "outbound" ? `You → ${m.thread.subject}` : m.from_name ?? m.from_email}
                        </p>
                        <span className="ml-auto shrink-0 text-[11.5px] text-ink-faint">{relative(m.sent_at)}</span>
                      </div>
                      <p className="truncate text-[12px] text-ink-muted">{m.snippet}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Recent activity" />
            <ActivityFeed items={activity} names={names} tz={tz} compact />
          </Card>
        </div>
      </div>
    </div>
  );
}

function EventList({ rows, today }: { rows: Row[]; today: string }) {
  if (rows.length === 0) return <EmptyState title="No events in this period" />;
  return (
    <ul className="divide-y divide-line border-t border-line">
      {rows.map((e) => {
        const s = EVENT_STATUS[e.status as EventStatus];
        return (
          <li key={e.id}>
            <Link href={`/events/${e.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-zinc-50/70">
              <div className="w-12 shrink-0 rounded-lg bg-zinc-50 py-1 text-center ring-1 ring-line">
                <div className="text-[10px] font-semibold uppercase text-ink-faint">{fmtDate(e.event_date, "short").split(" ")[1]}</div>
                <div className="text-[16px] font-semibold leading-tight text-ink">{fmtDate(e.event_date, "short").split(" ")[0]}</div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{e.name}</p>
                <p className="truncate text-[12.5px] text-ink-muted">
                  {[e.customer?.name, timeRange(e.start_time, e.finish_time), e.venue, e.guest_count ? `${e.guest_count} guests` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <Badge tone={s.tone} dot>{s.label}</Badge>
                <p className="mt-1 text-[11.5px] text-ink-faint">{relativeDay(e.event_date, today)}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

