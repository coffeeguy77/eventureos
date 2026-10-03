import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO } from "@/lib/format";

/**
 * Follow-ups EventureOS spots by itself — worked out live each time the to-do list opens, so they clear
 * themselves once the work is done (reply sent, quote answered, invoice paid…). Each has a stable key so it
 * can be turned into a task (with a calendar reminder) without being added twice.
 */
export type FollowUpKind = "draft" | "reply" | "quote_chase" | "quote_expiring" | "invoice" | "calendar" | "next_action";
export interface FollowUp {
  key: string;
  kind: FollowUpKind;
  title: string;
  detail: string | null;
  href: string;
  /** For sorting and colour: when it became (or becomes) due */
  due: string | null;
  urgent: boolean;
  link: { enquiryId?: string | null; eventId?: string | null; customerId?: string | null };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export async function loadFollowUps(db: SupabaseClient, orgId: string, today: string, cur: string, money: (n: number, c: string) => string): Promise<FollowUp[]> {
  const nowIso = new Date().toISOString();
  const in14 = addDaysISO(today, 14), soon = addDaysISO(today, 3), recent = addDaysISO(today, -21);
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const [drafts, waiting, quotes, invoices, events, cal, nextEnq, nextEv] = await Promise.all([
    db.from("email_threads").select("id, subject, enquiry_id, event_id, customer_id, extracted").eq("organisation_id", orgId).not("extracted->reply_draft", "is", null).limit(100),
    db.from("email_threads").select("id, subject, enquiry_id, event_id, customer_id, last_inbound_at").eq("organisation_id", orgId).eq("state", "needs_reply")
      .neq("classification", "spam").gte("last_inbound_at", `${recent}T00:00:00Z`).is("extracted->reply_draft", null).order("last_inbound_at", { ascending: false }).limit(40),
    db.from("quotes").select("id, number, title, status, expiry_date, event_id, customer_id, customer:customers(name), version:quote_versions!quotes_current_version_id_organisation_id_fkey(published_at, viewed_at)")
      .eq("organisation_id", orgId).in("status", ["sent", "viewed"]).limit(100),
    db.from("invoices").select("id, number, balance, due_date, customer_id, event_id, customer:customers(name)").eq("organisation_id", orgId).eq("status", "overdue")
      .order("due_date").limit(60),
    db.from("events").select("id, number, name, event_date, customer_id").eq("organisation_id", orgId).eq("status", "confirmed").gte("event_date", today).lte("event_date", in14),
    db.from("calendar_events").select("event_id").eq("organisation_id", orgId).eq("kind", "event").gte("starts_at", `${today}T00:00:00Z`).not("event_id", "is", null),
    db.from("enquiries").select("id, number, title, next_action, next_action_due, customer_id").eq("organisation_id", orgId)
      .in("status", ["new", "needs_review", "contacted", "qualified", "quote_required", "quote_sent", "negotiating"]).lt("next_action_due", nowIso).not("next_action", "is", null).limit(40),
    db.from("events").select("id, number, name, next_action, next_action_due, customer_id").eq("organisation_id", orgId)
      .not("status", "in", "(completed,cancelled)").lt("next_action_due", nowIso).not("next_action", "is", null).limit(40),
  ]);
  const out: FollowUp[] = [];
  const where = (t: { enquiry_id: string | null; event_id: string | null }) => (t.enquiry_id ? `/enquiries/${t.enquiry_id}` : t.event_id ? `/events/${t.event_id}` : "/enquiries");

  for (const t of (drafts.data ?? []) as { id: string; subject: string | null; enquiry_id: string | null; event_id: string | null; customer_id: string | null; extracted: { reply_draft?: { drafted_at?: string } } | null }[]) {
    out.push({ key: `draft:${t.id}`, kind: "draft", title: `Check & send the drafted reply — ${t.subject ?? "email"}`, detail: "A reply is written and waiting for you",
      href: where(t), due: t.extracted?.reply_draft?.drafted_at ?? null, urgent: false, link: { enquiryId: t.enquiry_id, eventId: t.event_id, customerId: t.customer_id } });
  }
  for (const t of (waiting.data ?? []) as { id: string; subject: string | null; enquiry_id: string | null; event_id: string | null; customer_id: string | null; last_inbound_at: string | null }[]) {
    const days = t.last_inbound_at ? daysBetween(t.last_inbound_at, nowIso) : 0;
    out.push({ key: `reply:${t.id}`, kind: "reply", title: `Reply to “${t.subject ?? "email"}”`, detail: days ? `Waiting ${days} day${days === 1 ? "" : "s"}` : "Came in today",
      href: where(t), due: t.last_inbound_at, urgent: days >= 2, link: { enquiryId: t.enquiry_id, eventId: t.event_id, customerId: t.customer_id } });
  }
  type Q = { id: string; number: number; title: string; status: string; expiry_date: string | null; event_id: string; customer_id: string; customer: { name: string } | null; version: { published_at: string | null; viewed_at: string | null } | null };
  for (const q of (quotes.data ?? []) as unknown as Q[]) {
    const who = q.customer?.name ?? q.title;
    if (q.expiry_date && q.expiry_date >= today && q.expiry_date <= soon) {
      out.push({ key: `quote_expiring:${q.id}:${q.expiry_date}`, kind: "quote_expiring", title: `Quote Q-${q.number} for ${who} expires ${q.expiry_date === today ? "today" : q.expiry_date}`,
        detail: "Chase it or extend the expiry", href: `/quotes/${q.id}`, due: q.expiry_date, urgent: true, link: { eventId: q.event_id, customerId: q.customer_id } });
    } else if (q.version?.published_at && q.version.published_at < threeDaysAgo) {
      const days = daysBetween(q.version.published_at, nowIso);
      out.push({ key: `quote_chase:${q.id}`, kind: "quote_chase", title: `Chase quote Q-${q.number} — ${who}`,
        detail: `Sent ${days} days ago · ${q.version.viewed_at ? "viewed, no answer yet" : "not opened yet"}`, href: `/quotes/${q.id}`, due: q.version.published_at, urgent: days >= 7,
        link: { eventId: q.event_id, customerId: q.customer_id } });
    }
  }
  type I = { id: string; number: string; balance: number; due_date: string | null; customer_id: string | null; event_id: string | null; customer: { name: string } | null };
  for (const i of (invoices.data ?? []) as unknown as I[]) {
    const days = i.due_date ? daysBetween(`${i.due_date}T00:00:00Z`, nowIso) : 0;
    out.push({ key: `invoice:${i.id}`, kind: "invoice", title: `Chase ${i.number} — ${i.customer?.name ?? "client"}`, detail: `${money(Number(i.balance), cur)} overdue${days > 0 ? ` · ${days} days` : ""}`,
      href: `/invoices`, due: i.due_date, urgent: days >= 14, link: { customerId: i.customer_id, eventId: i.event_id } });
  }
  const onCal = new Set(((cal.data ?? []) as { event_id: string }[]).map((c) => c.event_id));
  for (const e of (events.data ?? []) as { id: string; number: number; name: string; event_date: string; customer_id: string }[]) {
    if (onCal.has(e.id)) continue;
    out.push({ key: `calendar:${e.id}`, kind: "calendar", title: `Put EV-${e.number} on the calendar — ${e.name}`, detail: `Confirmed for ${e.event_date}, not on the calendar`,
      href: `/events/${e.id}`, due: e.event_date, urgent: true, link: { eventId: e.id, customerId: e.customer_id } });
  }
  for (const n of (nextEnq.data ?? []) as { id: string; number: number; title: string; next_action: string; next_action_due: string; customer_id: string | null }[]) {
    out.push({ key: `next:enq:${n.id}:${n.next_action_due}`, kind: "next_action", title: `${n.next_action} — ENQ-${n.number}`, detail: n.title, href: `/enquiries/${n.id}`,
      due: n.next_action_due, urgent: true, link: { enquiryId: n.id, customerId: n.customer_id } });
  }
  for (const n of (nextEv.data ?? []) as { id: string; number: number; name: string; next_action: string; next_action_due: string; customer_id: string }[]) {
    out.push({ key: `next:ev:${n.id}:${n.next_action_due}`, kind: "next_action", title: `${n.next_action} — EV-${n.number}`, detail: n.name, href: `/events/${n.id}`,
      due: n.next_action_due, urgent: true, link: { eventId: n.id, customerId: n.customer_id } });
  }
  // One item per enquiry/event: a reply or draft already covers its "next action"
  const covered = new Set(out.filter((f) => f.kind === "draft" || f.kind === "reply").map((f) => f.link.enquiryId ?? f.link.eventId).filter(Boolean));
  return out.filter((f) => f.kind !== "next_action" || !covered.has(f.link.enquiryId ?? f.link.eventId));
}
