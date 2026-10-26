import Link from "next/link";
import { NotConnected } from "@/components/ui/connect-link";
import { ArrowUpRight } from "lucide-react";
import { canManage, requireOrg, getMembers } from "@/lib/context";
import { loadRevenueStreams } from "@/lib/revenue/load";
import { RevenueStreams } from "@/components/dashboard/revenue-streams";
import { StaffingCard } from "@/components/dashboard/staffing";
import { staffingIssues } from "@/lib/crew/staffing";
import { addDaysISO as addDaysStaff } from "@/lib/format";
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
import { PagedList } from "@/components/dashboard/paged-list";

export const metadata = { title: "Dashboard" };

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

export default async function DashboardPage() {
  const { supabase, org, profile, role } = await requireOrg();
  const tz = org.timezone;
  const today = todayISO(tz);
  const in7 = addDaysISO(today, 6);
  const in30 = addDaysISO(today, 29);
  const month = monthBoundsUTC(tz);
  const nowIso = new Date().toISOString();
  const cur = org.currency;
  // Revenue by stream (owners and managers only) — never let it break the dashboard
  const fyStart = Number((org.settings as Record<string, unknown> | null)?.fy_start_month) || 7;
  const staffing = canManage(role) ? await staffingIssues(supabase, org.id, today, addDaysStaff(today, 30)).catch(() => null) : null;
  const streams = canManage(role) ? await loadRevenueStreams(supabase, org.id, today, fyStart).catch((e) => { console.error("revenue streams:", e); return null; }) : null;

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
  const { data: held } = await supabase.from("events").select("id, name, event_date, approval_requested_at, customer:customers(name)")
    .eq("organisation_id", org.id).eq("approval_status", "pending").not("status", "in", "(confirmed,completed,cancelled)").order("event_date");
  const heldBookings = (held ?? []) as unknown as { id: string; name: string; event_date: string | null; approval_requested_at: string | null; customer: { name: string } | null }[];
  // ---- Get paid before the event: confirmed jobs coming up with money still owing (or no invoice yet), and overdue invoices
  const in60 = addDaysISO(today, 59);
  const { data: soon } = await supabase.from("events").select("id, name, event_date, status, customer:customers(name)")
    .eq("organisation_id", org.id).eq("status", "confirmed").gte("event_date", today).lte("event_date", in60).order("event_date");
  const soonJobs = (soon ?? []) as unknown as { id: string; name: string; event_date: string; customer: { name: string } | null }[];
  const invCols = "id, number, status, total, balance, due_date, event_id";
  let jobInv: unknown[] = [];
  if (soonJobs.length) {
    const ids = soonJobs.map((j) => j.id);
    const r1 = await supabase.from("invoices").select(`${invCols}, emailed_at, view_count, reminders`).eq("organisation_id", org.id).in("event_id", ids).neq("status", "void");
    if (!r1.error) jobInv = r1.data ?? [];
    else { const r2 = await supabase.from("invoices").select(invCols).eq("organisation_id", org.id).in("event_id", ids).neq("status", "void"); jobInv = r2.data ?? []; }
  }
  type JI = { id: string; number: string; status: string; total: number; balance: number; due_date: string | null; event_id: string; emailed_at?: string | null; view_count?: number; reminders?: unknown[] };
  const invByJob = new Map<string, JI[]>();
  for (const i of jobInv as JI[]) invByJob.set(i.event_id, [...(invByJob.get(i.event_id) ?? []), i]);
  const toChase = soonJobs.map((j) => {
    const list = invByJob.get(j.id) ?? [];
    const owing = list.filter((i) => Number(i.balance) > 0 && i.status !== "draft");
    const drafts = list.filter((i) => i.status === "draft");
    return { job: j, list, owing, balance: owing.reduce((t, i) => t + Number(i.balance), 0), noInvoice: list.length === 0, drafts };
  }).filter((x) => x.noInvoice || x.balance > 0 || x.drafts.length);

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
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-ink">
          {greeting(tz)}, {firstName(profile.full_name, profile.email)}
        </h1>
        <p className="mt-1 text-[0.8438rem] text-ink-muted">Here’s what’s happening with your event business today.</p>
      </div>

      {heldBookings.length > 0 && (
        <div className="mb-6 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200 sm:p-5" role="alert">
          <p className="text-[0.9375rem] font-semibold text-amber-900">
            {heldBookings.length === 1 ? "1 booking is" : `${heldBookings.length} bookings are`} waiting for approval — not confirmed until approved
          </p>
          <ul className="mt-2 space-y-1.5">
            {heldBookings.map((b) => (
              <li key={b.id} className="text-[0.8125rem] text-amber-900">
                <Link href={`/events/${b.id}`} className="font-medium underline underline-offset-2">{b.name}</Link>
                {b.customer?.name ? ` · ${b.customer.name}` : ""}
                {b.event_date ? ` · ${relativeDay(b.event_date, today)} (${fmtDate(b.event_date, "weekday")})` : ""}
                {b.approval_requested_at ? <span className="text-amber-800"> · accepted {relative(b.approval_requested_at)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

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
            <CardHeader title="Next 7 days" subtitle="Calendar preview across all resources" action={conn("google_calendar")?.status === "connected" ? <Link href="/calendar" className="text-[0.7188rem] text-ink-faint hover:text-ink">{connLabel("google_calendar", "Google Calendar")}</Link> : <span className="text-[0.7188rem]"><NotConnected name="Google Calendar" /></span>} />
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-xl border-t border-line bg-line sm:grid-cols-7">
              {days.map((d) => {
                const items = cal.filter((c) => localDay(c.starts_at) === d);
                return (
                  <div key={d} className={cn("flex gap-3 bg-surface px-4 py-2.5 sm:block sm:min-h-[120px] sm:p-2", d === today && "bg-brand-50/40")}>
                    <div className={cn("w-24 shrink-0 pt-1 text-[0.75rem] font-medium sm:mb-1.5 sm:w-auto sm:pt-0 sm:text-[0.6875rem]", d === today ? "text-brand-700" : "text-ink-faint")}>
                      {fmtDate(d, "weekday")}
                    </div>
                    {items.length === 0 && <div className="pt-1 text-[0.75rem] text-ink-faint sm:hidden">Nothing booked</div>}
                    <div className="min-w-0 flex-1 space-y-1">
                      {items.map((c) => (
                        <Link key={c.id} href={c.event_id ? `/events/${c.event_id}` : "#"}
                          className={cn("block rounded-md border-l-[3px] bg-zinc-50 px-1.5 py-1 text-[0.6875rem] leading-tight hover:bg-zinc-100", conflicts.has(c.id) && "ring-1 ring-rose-300")}
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
          <Card id="get-paid">
            <CardHeader title="Get paid before the event" subtitle={`${toChase.length ? `${toChase.length} confirmed job${toChase.length === 1 ? "" : "s"} in the next 60 days still owing` : "Every confirmed job in the next 60 days is paid"}${overdueInvoices.length ? ` · ${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"}` : ""}`}
              action={<Link href="/invoices" className="text-[0.7812rem] font-medium text-brand-600 hover:text-brand-700">Invoices</Link>} />
            <ClientTabs
              tabs={[
                {
                  key: "before", label: "Before the event", count: toChase.length,
                  content: toChase.length === 0 ? <EmptyState title="All paid up">Confirmed jobs coming up have nothing owing.</EmptyState> : (
                    <PagedList items={toChase.map((x) => {
                      const days = daysBetween(today, x.job.event_date);
                      const i = x.owing[0] ?? x.drafts[0];
                      const sent = i && "emailed_at" in i ? (i.emailed_at ? `emailed${i.view_count ? `, viewed ${i.view_count}×` : ", not opened"}${Array.isArray(i.reminders) && i.reminders.length ? `, ${i.reminders.length} reminder${i.reminders.length === 1 ? "" : "s"}` : ""}` : "NOT SENT") : null;
                      return {
                        key: "c" + x.job.id,
                        title: `${x.job.name}${x.job.customer?.name ? ` · ${x.job.customer.name}` : ""}`,
                        subtitle: x.noInvoice ? "No invoice yet — raise one" : i ? `${i.number} · ${x.balance > 0 ? `${money(x.balance, cur)} owing` : "draft"}${sent ? ` · ${sent}` : ""}${i.status === "overdue" ? " · overdue" : ""}` : "",
                        href: x.noInvoice ? `/events/${x.job.id}?tab=invoice` : `/invoices/${i!.id}`,
                        meta: days === 0 ? "TODAY" : days === 1 ? "Tomorrow" : `In ${days} days`,
                        alert: days <= 7 || x.noInvoice || (!!sent && sent === "NOT SENT"),
                      };
                    })} />
                  ),
                },
                {
                  key: "overdue", label: "Overdue", count: overdueInvoices.length, tone: overdueInvoices.length ? "alert" : undefined,
                  content: overdueInvoices.length === 0 ? <EmptyState title="Nothing overdue" /> : (
                    <PagedList items={overdueInvoices.map((i) => ({
                      key: "o" + i.id, title: `${i.customer?.name ?? ""} · ${i.number}`, subtitle: `${money(i.balance, cur)} · ${i.event?.name ?? "No event"}`,
                      href: `/invoices/${i.id}`, meta: i.due_date ? `${daysBetween(i.due_date, today)}d overdue` : "Overdue", alert: true,
                    }))} />
                  ),
                },
                {
                  key: "all", label: "All owing", count: invoices.length,
                  content: invoices.length === 0 ? <EmptyState title="Everything is paid" /> : (
                    <PagedList items={invoices.map((i) => ({
                      key: "a" + i.id, title: `${i.customer?.name ?? ""} · ${i.number}`, subtitle: `${money(i.balance, cur)} · ${i.event?.name ?? "No event"}`,
                      href: `/invoices/${i.id}`, meta: i.status === "overdue" && i.due_date ? `${daysBetween(i.due_date, today)}d overdue` : i.due_date ? `Due ${fmtDate(i.due_date, "short")}` : "", alert: i.status === "overdue",
                    }))} />
                  ),
                },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Inbox" subtitle="Enquiries, replies and quotes waiting on you" />
            <ClientTabs
              tabs={buckets.map((b) => ({
                key: b.key, label: b.label, count: b.items.length, tone: b.alert ? "alert" : undefined,
                content: b.items.length === 0 ? <EmptyState title="All clear">Nothing waiting in {b.label.toLowerCase()}.</EmptyState> : <PagedList items={b.items} />,
              }))}
            />
          </Card>

          <Card>
            <CardHeader title="Upcoming events" action={<Link href="/events" className="text-[0.7812rem] font-medium text-brand-600 hover:text-brand-700">All events</Link>} />
            <ClientTabs
              tabs={[
                { key: "today", label: "Today", count: eventsToday.length, content: <EventList rows={eventsToday} today={today} /> },
                { key: "week", label: "Next 7 days", count: eventsWeek.length, content: <EventList rows={eventsWeek} today={today} /> },
                { key: "month", label: "Next 30 days", count: events.length, content: <EventList rows={events} today={today} /> },
              ]}
            />
          </Card>

        </div>

        <div className="space-y-6">
          {staffing && <StaffingCard issues={staffing} />}
          {streams && <RevenueStreams data={streams} currency={cur} />}
          <Card>
            <CardHeader title="Tasks requiring attention" subtitle={`${tasks.filter((t) => t.due_at && t.due_at < nowIso).length} overdue`}
              action={<Link href="/tasks" className="text-[0.7812rem] font-medium text-brand-600 hover:text-brand-700">To-do list</Link>} />
            {tasks.length === 0 ? <EmptyState title="No open tasks" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {tasks.map((t) => {
                  const overdue = t.due_at && t.due_at < nowIso;
                  const href = t.event_id ? `/events/${t.event_id}?tab=tasks` : t.enquiry_id ? `/enquiries/${t.enquiry_id}` : "#";
                  return (
                    <li key={t.id} className="flex gap-3 px-5 py-2.5">
                      <TaskCheckbox id={t.id} done={false} />
                      <div className="min-w-0 flex-1">
                        <Link href={href} className="block truncate text-[0.8125rem] font-medium text-ink hover:text-brand-700">{t.title}</Link>
                        <p className="truncate text-[0.75rem] text-ink-muted">{t.event?.name ?? t.enquiry?.title ?? "General"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cn("text-[0.7188rem]", overdue ? "font-medium text-rose-700" : "text-ink-faint")}>
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

          <Card>
            <CardHeader title="Recent customer communication" action={<span className="text-[0.7188rem] text-ink-faint">{conn("gmail")?.status === "connected" ? connLabel("gmail", "Gmail") : <NotConnected name="Gmail" />}</span>} />
            <ul className="divide-y divide-line border-t border-line">
              {messages.map((m) => (
                <li key={m.id}>
                  <Link href={threadHref(m.thread)} className="flex gap-3 px-5 py-2.5 hover:bg-zinc-50/70">
                    <Avatar name={m.direction === "outbound" ? org.name : m.from_name ?? m.from_email} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className={cn("truncate text-[0.8125rem] text-ink", !m.is_read && "font-semibold")}>
                          {m.direction === "outbound" ? `You → ${m.thread.subject}` : m.from_name ?? m.from_email}
                        </p>
                        <span className="ml-auto shrink-0 text-[0.7188rem] text-ink-faint">{relative(m.sent_at)}</span>
                      </div>
                      <p className="truncate text-[0.75rem] text-ink-muted">{m.snippet}</p>
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
                <div className="text-[0.625rem] font-semibold uppercase text-ink-faint">{fmtDate(e.event_date, "short").split(" ")[1]}</div>
                <div className="text-[1rem] font-semibold leading-tight text-ink">{fmtDate(e.event_date, "short").split(" ")[0]}</div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8438rem] font-medium text-ink">{e.name}</p>
                <p className="truncate text-[0.7812rem] text-ink-muted">
                  {[e.customer?.name, timeRange(e.start_time, e.finish_time), e.venue, e.guest_count ? `${e.guest_count} guests` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <Badge tone={s.tone} dot>{s.label}</Badge>
                <p className="mt-1 text-[0.7188rem] text-ink-faint">{relativeDay(e.event_date, today)}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

