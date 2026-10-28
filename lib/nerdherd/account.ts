import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthly, paymentProfile, planCategory, type PaymentProfile, type PlanCategory, type TicketStatus } from "./core";

/** Everything Nerd Herd knows about one client: sites, hosting, plans, maintenance done, tickets and how they pay. */
export interface ClientAccount {
  websites: { id: string; domain: string; platform: string; status: string; hosting: { id: string; server: string | null; suspended: boolean; billing_status: string | null; plan: string | null } | null }[];
  plans: { id: string; name: string; category: PlanCategory; status: string; total: number; every: number; unit: "week" | "month"; next_date: string; perMonth: number; website: string | null; creates_ticket: boolean }[];
  tickets: { id: string; number: number; subject: string; status: TicketStatus; kind: string; created_at: string; resolved_at: string | null }[];
  maintenanceDone: { id: string; number: number; subject: string; resolved_at: string | null; website: string | null }[];
  pay: PaymentProfile | null;
  recentInvoices: { id: string; number: string | null; issue_date: string; total: number; balance: number | null; status: string; due_date: string | null }[];
  monthlyValue: number;
}

export async function loadClientAccount(db: SupabaseClient, orgId: string, customerId: string, today: string): Promise<ClientAccount> {
  const [sites, plans, tickets, invoices] = await Promise.all([
    db.from("websites").select("id, domain, platform, status, hosting_accounts(id, suspended, billing_status, plan, hosting_servers(name))").eq("organisation_id", orgId).eq("customer_id", customerId).order("domain"),
    db.from("recurring_invoices").select("id, name, category, status, total, every, unit, next_date, creates_ticket, websites(domain)").eq("organisation_id", orgId).eq("customer_id", customerId).order("next_date"),
    db.from("support_tickets").select("id, number, subject, status, kind, created_at, resolved_at, websites(domain)").eq("organisation_id", orgId).eq("customer_id", customerId).order("created_at", { ascending: false }).limit(200),
    db.from("invoices").select("id, number, issue_date, due_date, total, balance, status").eq("organisation_id", orgId).eq("customer_id", customerId).order("issue_date", { ascending: false }).limit(2000),
  ]);
  type SiteRow = { id: string; domain: string; platform: string; status: string; hosting_accounts: { id: string; suspended: boolean; billing_status: string | null; plan: string | null; hosting_servers: { name: string } | null } | null };
  type PlanRow = { id: string; name: string; category: string; status: string; total: number; every: number; unit: "week" | "month"; next_date: string; creates_ticket: boolean | null; websites: { domain: string } | null };
  type TicketRow = { id: string; number: number; subject: string; status: TicketStatus; kind: string; created_at: string; resolved_at: string | null; websites: { domain: string } | null };
  type InvRow = { id: string; number: string | null; issue_date: string; due_date: string | null; total: number; balance: number | null; status: string };

  const planList = ((plans.data ?? []) as unknown as PlanRow[]).map((p) => ({
    id: p.id, name: p.name, category: planCategory(p), status: p.status, total: Number(p.total), every: p.every, unit: p.unit, next_date: p.next_date,
    perMonth: monthly(Number(p.total), p.every, p.unit), website: p.websites?.domain ?? null, creates_ticket: !!p.creates_ticket,
  }));
  const ticketList = (tickets.data ?? []) as unknown as TicketRow[];
  const inv = (invoices.data ?? []) as InvRow[];

  // payments only exist for managers (RLS) — without them there's no payment profile
  let pay: PaymentProfile | null = null;
  if (!invoices.error && inv.length) {
    const byId = new Map(inv.map((i) => [i.id, i]));
    const ids = inv.map((i) => i.id);
    const pays: { invoice_id: string; paid_at: string; amount: number }[] = [];
    for (let k = 0; k < ids.length; k += 200) {
      const { data } = await db.from("payments").select("invoice_id, paid_at, amount").eq("organisation_id", orgId).in("invoice_id", ids.slice(k, k + 200));
      pays.push(...((data ?? []) as typeof pays));
    }
    pay = paymentProfile(inv, pays.map((p) => ({ amount: Number(p.amount), paid_at: p.paid_at, invoice_issue: byId.get(p.invoice_id)?.issue_date ?? null, invoice_due: byId.get(p.invoice_id)?.due_date ?? null })), today);
  }

  return {
    websites: ((sites.data ?? []) as unknown as SiteRow[]).map((s) => ({
      id: s.id, domain: s.domain, platform: s.platform, status: s.status,
      hosting: s.hosting_accounts ? { id: s.hosting_accounts.id, server: s.hosting_accounts.hosting_servers?.name ?? null, suspended: s.hosting_accounts.suspended, billing_status: s.hosting_accounts.billing_status, plan: s.hosting_accounts.plan } : null,
    })),
    plans: planList,
    tickets: ticketList.map(({ websites: _w, ...t }) => t),
    maintenanceDone: ticketList.filter((t) => t.kind === "maintenance" && t.status === "resolved").map((t) => ({ id: t.id, number: t.number, subject: t.subject, resolved_at: t.resolved_at, website: t.websites?.domain ?? null })),
    pay,
    recentInvoices: inv.slice(0, 12),
    monthlyValue: Math.round(planList.filter((p) => p.status !== "ended").reduce((a, p) => a + p.perMonth, 0) * 100) / 100,
  };
}
