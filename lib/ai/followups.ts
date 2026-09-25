import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Follow-up intelligence: things that will slip unless someone acts. Pure reads under the user's RLS.
 * (The pg_cron automation already raises follow-up TASKS for quotes; this is the live, explainable list.)
 */

export interface FollowUp {
  kind: "quote_no_reply" | "email_no_reply" | "balance_due_soon";
  title: string;
  detail: string;
  href: string;
  urgency: "high" | "medium";
  at: string | null;
}

export async function getFollowUps(db: SupabaseClient, org: { id: string; timezone: string; settings: Record<string, unknown> }): Promise<FollowUp[]> {
  const followDays = Number(org.settings?.quote_follow_up_days ?? 3) || 3;
  const now = Date.now();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const in14 = new Date(Date.parse(today + "T00:00:00Z") + 14 * 86400000).toISOString().slice(0, 10);
  const dayAgo = new Date(now - 24 * 3600000).toISOString();

  const [quotesRes, threadsRes, eventsRes] = await Promise.all([
    db.from("quotes")
      .select("id, number, title, status, event_id, customer:customers(name), event:events(name, event_date), version:quote_versions!quotes_current_version_id_organisation_id_fkey(published_at, total, status, viewed_at)")
      .eq("organisation_id", org.id).in("status", ["sent", "viewed"]).limit(200),
    db.from("email_threads")
      .select("id, subject, classification, last_inbound_at, customer_id, event_id, enquiry_id, participants, customer:customers(name)")
      .eq("organisation_id", org.id).eq("state", "needs_reply").lt("last_inbound_at", dayAgo)
      .not("classification", "in", "(spam,supplier)").order("last_inbound_at").limit(50),
    db.from("events")
      .select("id, name, event_date, status, customer:customers(name), invoices(balance, status)")
      .eq("organisation_id", org.id).gte("event_date", today).lte("event_date", in14).not("status", "in", "(cancelled,completed)").order("event_date"),
  ]);
  for (const r of [quotesRes, threadsRes, eventsRes]) if (r.error) throw new Error(`Could not load follow-ups: ${r.error.message}`);

  const out: FollowUp[] = [];
  type Q = { id: string; number: number; title: string; event_id: string; customer: { name: string } | null; event: { name: string; event_date: string | null } | null; version: { published_at: string; total: number; status: string; viewed_at: string | null } | null };
  for (const q of (quotesRes.data ?? []) as unknown as Q[]) {
    if (!q.version || !["sent", "viewed"].includes(q.version.status)) continue;
    const days = Math.floor((now - Date.parse(q.version.published_at)) / 86400000);
    if (days < followDays) continue;
    out.push({
      kind: "quote_no_reply", urgency: days >= followDays * 2 ? "high" : "medium", at: q.version.published_at,
      title: `Follow up quote Q-${q.number} — ${q.customer?.name ?? "customer"}`,
      detail: `Sent ${days} days ago${q.version.viewed_at ? ", viewed but not answered" : ", not opened yet"} · ${q.event?.name ?? q.title}`,
      href: `/events/${q.event_id}?tab=quote`,
    });
  }
  type T = { id: string; subject: string | null; classification: string; last_inbound_at: string; customer_id: string | null; event_id: string | null; enquiry_id: string | null; participants: string[]; customer: { name: string } | null };
  for (const t of (threadsRes.data ?? []) as unknown as T[]) {
    if (!t.customer_id && !["event_enquiry", "existing_event", "quote_discussion", "needs_review"].includes(t.classification)) continue;
    const hours = Math.floor((now - Date.parse(t.last_inbound_at)) / 3600000);
    out.push({
      kind: "email_no_reply", urgency: hours >= 48 ? "high" : "medium", at: t.last_inbound_at,
      title: `Reply to ${t.customer?.name ?? t.participants[0] ?? "customer"}`,
      detail: `“${(t.subject ?? "(no subject)").slice(0, 70)}” — waiting ${hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`}`,
      href: t.event_id ? `/events/${t.event_id}?tab=communication` : t.enquiry_id ? `/enquiries/${t.enquiry_id}` : t.customer_id ? `/clients/${t.customer_id}` : "/settings/integrations/review",
    });
  }
  type E = { id: string; name: string; event_date: string; customer: { name: string } | null; invoices: { balance: number; status: string }[] };
  for (const e of (eventsRes.data ?? []) as unknown as E[]) {
    const owing = (e.invoices ?? []).filter((i) => i.status !== "void" && i.status !== "draft").reduce((s, i) => s + Number(i.balance), 0);
    if (owing <= 0.005) continue;
    const days = Math.round((Date.parse(e.event_date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
    out.push({
      kind: "balance_due_soon", urgency: days <= 7 ? "high" : "medium", at: e.event_date,
      title: `${e.name} — balance outstanding`,
      detail: `${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(owing)} owing · event ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}${e.customer ? ` · ${e.customer.name}` : ""}`,
      href: `/events/${e.id}?tab=invoice`,
    });
  }
  return out.sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "high" ? -1 : 1));
}
