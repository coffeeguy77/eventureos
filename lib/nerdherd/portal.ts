import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebHomeData } from "@/components/portal/web-home";
import { planCategory, type TicketStatus } from "./core";
import type { Unit } from "@/lib/recurring/core";

/**
 * The portal dashboard for a web agency's client. Uses the service client, so it is ONLY called after requirePortal()
 * has proved who the client is — every query is limited to their own customer ids, and only client-safe columns
 * are read (no internal notes, costs or hosting credentials).
 */
export async function loadWebHome(db: SupabaseClient, o: { slug: string; orgId: string; customerIds: string[]; business: string; name: string; currency: string; tz: string }): Promise<WebHomeData> {
  const ids = o.customerIds;
  const [sites, plans, tickets, invoices, org] = await Promise.all([
    db.from("websites").select("id, domain, status, hosting_account_id, hosting_accounts(suspended)").eq("organisation_id", o.orgId).in("customer_id", ids).neq("status", "archived").order("domain"),
    db.from("recurring_invoices").select("id, name, category, creates_ticket, total, every, unit, next_date, status, website_id, websites(domain)").eq("organisation_id", o.orgId).in("customer_id", ids).neq("status", "ended").order("next_date"),
    db.from("support_tickets").select("id, number, subject, status, kind, last_activity_at, resolved_at, checklist, websites(domain)").eq("organisation_id", o.orgId).in("customer_id", ids).order("last_activity_at", { ascending: false }).limit(100),
    db.from("invoices").select("id, number, issue_date, due_date, total, balance, status, pay_token").eq("organisation_id", o.orgId).in("customer_id", ids).not("status", "in", "(draft,void)").order("issue_date", { ascending: false }).limit(200),
    db.from("organisations").select("settings").eq("id", o.orgId).maybeSingle(),
  ]);
  type S = { id: string; domain: string; status: string; hosting_account_id: string | null; hosting_accounts: { suspended: boolean } | null };
  type P = { id: string; name: string; category: string; creates_ticket: boolean; total: number; every: number; unit: Unit; next_date: string; status: string; website_id: string | null; websites: { domain: string } | null };
  type T = { id: string; number: number; subject: string; status: TicketStatus; kind: string; last_activity_at: string; resolved_at: string | null; checklist: unknown; websites: { domain: string } | null };
  const planRows = (plans.data ?? []) as unknown as P[];
  const site = ((org.data?.settings ?? {}) as { site?: { domain?: string | null } }).site;
  return {
    slug: o.slug, business: o.business, name: o.name, currency: o.currency, tz: o.tz,
    quoteHref: site?.domain ? `https://${site.domain}/quote` : `/site/${o.slug}/quote`,
    sites: ((sites.data ?? []) as unknown as S[]).map((s) => ({
      id: s.id, domain: s.domain, status: s.status, hosted: !!s.hosting_account_id, suspended: !!s.hosting_accounts?.suspended,
      plans: [...new Set(planRows.filter((p) => p.website_id === s.id).map((p) => planCategory(p)))],
    })),
    plans: planRows.map((p) => ({ id: p.id, name: p.name, category: planCategory(p), total: Number(p.total), every: p.every, unit: p.unit, next_date: p.next_date, status: p.status, website: p.websites?.domain ?? null })),
    tickets: ((tickets.data ?? []) as unknown as T[]).map((t) => ({ id: t.id, number: t.number, subject: t.subject, status: t.status, kind: t.kind, last_activity_at: t.last_activity_at, resolved_at: t.resolved_at, checklist: t.checklist, website: t.websites?.domain ?? null })),
    invoices: ((invoices.data ?? []) as { id: string; number: string | null; issue_date: string; due_date: string | null; total: number; balance: number | null; status: string; pay_token: string }[])
      .map((i) => ({ ...i, total: Number(i.total), balance: Number(i.balance ?? 0) })),
  };
}
