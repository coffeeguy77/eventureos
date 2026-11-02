import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_STATUSES } from "./core";

/**
 * Who has what: open tickets with their tabs. A ticket is "mine" if it's assigned to me or one of its open tabs is;
 * "unassigned" if nobody has it — no one on the ticket and no one on any tab — or one of its open tabs has nobody.
 */
export interface Job {
  id: string; number: number; subject: string; status: string; priority: string; due_date: string | null; last_activity_at: string;
  customer: string | null; domain: string | null; assigned_to: string | null; assignee: string | null;
  tabs: { id: string; name: string; assigned_to: string | null; who: string | null; done: boolean }[];
  /** quoted work: green = paid, ready to start; red = quoted but not paid (don't start) */
  money: "paid" | "unpaid" | null;
}

export async function openJobs(db: SupabaseClient, orgId: string): Promise<Job[]> {
  const { data } = await db.from("support_tickets").select("id, number, subject, status, priority, due_date, last_activity_at, assigned_to, customers(name), websites(domain), assignee:users!support_tickets_assigned_to_fkey(full_name, email)")
    .eq("organisation_id", orgId).in("status", OPEN_STATUSES).order("last_activity_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as unknown as { id: string; number: number; subject: string; status: string; priority: string; due_date: string | null; last_activity_at: string; assigned_to: string | null; customers: { name: string } | null; websites: { domain: string } | null; assignee: { full_name: string | null; email: string } | null }[];
  const tabs = new Map<string, Job["tabs"]>();
  if (rows.length) {
    const { data: t, error } = await db.from("support_ticket_tabs").select("id, ticket_id, name, assigned_to, done, who:users!support_ticket_tabs_assigned_to_fkey(full_name, email)").in("ticket_id", rows.map((r) => r.id)).order("position");
    if (!error) for (const x of (t ?? []) as unknown as { id: string; ticket_id: string; name: string; assigned_to: string | null; done: boolean; who: { full_name: string | null; email: string } | null }[]) {
      tabs.set(x.ticket_id, [...(tabs.get(x.ticket_id) ?? []), { id: x.id, name: x.name, assigned_to: x.assigned_to, who: x.who ? (x.who.full_name ?? x.who.email) : null, done: x.done }]);
    }
  }
  // quoted work on these tickets: paid (green) beats unpaid (red); quietly nothing before database update 0092
  const money = new Map<string, "paid" | "unpaid">();
  if (rows.length) {
    const { data: q, error } = await db.from("support_ticket_quotes").select("ticket_id, status").in("ticket_id", rows.map((r) => r.id)).in("status", ["sent", "accepted", "paid"]);
    if (!error) for (const x of (q ?? []) as { ticket_id: string; status: string }[]) {
      if (x.status === "paid") money.set(x.ticket_id, "paid");
      else if (!money.has(x.ticket_id)) money.set(x.ticket_id, "unpaid");
    }
  }
  return rows.map((r) => ({ money: money.get(r.id) ?? null, id: r.id, number: r.number, subject: r.subject, status: r.status, priority: r.priority, due_date: r.due_date, last_activity_at: r.last_activity_at,
    customer: r.customers?.name ?? null, domain: r.websites?.domain ?? null, assigned_to: r.assigned_to, assignee: r.assignee ? (r.assignee.full_name ?? r.assignee.email) : null, tabs: tabs.get(r.id) ?? [] }));
}

export const isMine = (j: Job, me: string) => j.assigned_to === me || j.tabs.some((t) => !t.done && t.assigned_to === me);
export const isUnassigned = (j: Job) => {
  const open = j.tabs.filter((t) => !t.done);
  return open.length ? open.some((t) => !t.assigned_to) : !j.assigned_to;
};
