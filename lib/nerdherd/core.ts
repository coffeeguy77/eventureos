/**
 * Nerd Herd (pure): ticket statuses and labels, maintenance checklists, a client's plans and how reliably they pay.
 * No database access here, so it can be tested and used on both server and client.
 */
import type { Tone } from "@/lib/status";

export const TICKET_STATUSES = ["new", "open", "awaiting_payment", "waiting_customer", "scheduled", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone; hint: string }> = {
  new: { label: "New", tone: "brand", hint: "Nobody has looked at it yet" },
  open: { label: "Ready to do", tone: "blue", hint: "Ready for someone to work on" },
  awaiting_payment: { label: "Awaiting payment", tone: "amber", hint: "Invoice sent — work starts when it's paid" },
  waiting_customer: { label: "Waiting on client", tone: "slate", hint: "We've asked the client something" },
  scheduled: { label: "Scheduled", tone: "blue", hint: "Booked in for a date" },
  in_progress: { label: "In progress", tone: "brand", hint: "Someone is working on it" },
  resolved: { label: "Done", tone: "green", hint: "Finished" },
  closed: { label: "Closed", tone: "neutral", hint: "Closed without more work" },
};
export const OPEN_STATUSES: TicketStatus[] = ["new", "open", "awaiting_payment", "waiting_customer", "scheduled", "in_progress"];
export const isTicketStatus = (s: unknown): s is TicketStatus => typeof s === "string" && (TICKET_STATUSES as readonly string[]).includes(s);

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "neutral" }, normal: { label: "Normal", tone: "slate" }, high: { label: "High", tone: "amber" }, urgent: { label: "Urgent", tone: "red" },
};
export const isPriority = (s: unknown): s is Priority => typeof s === "string" && (PRIORITIES as readonly string[]).includes(s);

export const KINDS = ["support", "maintenance", "project", "hosting", "billing", "other"] as const;
export type TicketKind = (typeof KINDS)[number];
export const KIND_LABEL: Record<TicketKind, string> = {
  support: "Support", maintenance: "Maintenance", project: "Project", hosting: "Hosting", billing: "Billing", other: "Other",
};
export const isKind = (s: unknown): s is TicketKind => typeof s === "string" && (KINDS as readonly string[]).includes(s);

export const PLATFORMS = ["wordpress", "woocommerce", "shopify", "squarespace", "wix", "custom", "other"] as const;
export const PLATFORM_LABEL: Record<string, string> = {
  wordpress: "WordPress", woocommerce: "WooCommerce", shopify: "Shopify", squarespace: "Squarespace", wix: "Wix", custom: "Custom build", other: "Other",
};
export const SITE_STATUS: Record<string, { label: string; tone: Tone }> = {
  live: { label: "Live", tone: "green" }, building: { label: "Being built", tone: "brand" }, paused: { label: "Paused", tone: "amber" }, archived: { label: "Archived", tone: "neutral" },
};

export interface ChecklistItem { label: string; done: boolean; at?: string | null; by?: string | null }
export function readChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object" && typeof (x as ChecklistItem).label === "string")
    .map((x) => ({ label: String((x as ChecklistItem).label).slice(0, 200), done: !!(x as ChecklistItem).done, at: (x as ChecklistItem).at ?? null, by: (x as ChecklistItem).by ?? null }));
}

/** Normalise a domain typed by a person: no scheme, no path, no www, lower case. */
export function cleanDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").replace(/:\d+$/, "");
}
export const looksLikeDomain = (d: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);

// ------------------------------------------------------------------------------------------------
// A client's plans (recurring invoices) and how they pay
// ------------------------------------------------------------------------------------------------

export type PlanCategory = "hosting" | "maintenance" | "adwords" | "domains" | "other";
export const PLAN_LABEL: Record<PlanCategory, string> = { hosting: "Hosting", maintenance: "Maintenance", adwords: "Google Ads / SEO", domains: "Domains", other: "Other" };

/** Which kind of plan a recurring invoice is: its category, or a maintenance plan when it opens maintenance jobs. */
export function planCategory(r: { category: string | null; creates_ticket?: boolean | null; name?: string | null }): PlanCategory {
  if (r.creates_ticket) return "maintenance";
  const c = (r.category ?? "").toLowerCase();
  if (c === "hosting" || c === "adwords" || c === "domains" || c === "maintenance") return c;
  if (/maint/i.test(r.name ?? "")) return "maintenance";
  return "other";
}

/** A recurring amount expressed per month (e.g. $330 a year → $27.50 a month). */
export function monthly(total: number, every: number, unit: "week" | "month"): number {
  const per = unit === "week" ? (total * 52) / 12 / Math.max(1, every) : total / Math.max(1, every);
  return Math.round(per * 100) / 100;
}

export interface PayInvoice { status: string; issue_date: string | null; due_date: string | null; total: number; balance: number | null }
export interface PayRecord { invoice_due: string | null; invoice_issue: string | null; paid_at: string; amount: number }

export interface PaymentProfile {
  invoices: number;           // invoices that count (not void / draft)
  paidInvoices: number;
  lifetimePaid: number;
  owing: number;
  overdue: number;
  overdueCount: number;
  oldestOverdueDays: number | null;
  avgDaysToPay: number | null;  // from invoice date to payment
  onTimeRate: number | null;    // share of payments made by the due date (0–1)
  lastPaidAt: string | null;
  rating: "great" | "good" | "slow" | "poor" | "new";
}

const day = (s: string) => Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s);
const DAY = 86_400_000;

/** How a client pays: totals, overdue, average days to pay and how often they pay on time. */
export function paymentProfile(invoices: PayInvoice[], payments: PayRecord[], today: string): PaymentProfile {
  const live = invoices.filter((i) => i.status !== "void" && i.status !== "draft");
  const owingList = live.filter((i) => Number(i.balance ?? 0) > 0.009);
  const overdueList = owingList.filter((i) => i.due_date && i.due_date < today);
  const lifetimePaid = Math.round(payments.reduce((a, p) => a + Number(p.amount), 0) * 100) / 100;
  const delays: number[] = [];
  let onTime = 0, judged = 0;
  for (const p of payments) {
    if (p.invoice_issue) delays.push(Math.max(0, (day(p.paid_at) - day(p.invoice_issue)) / DAY));
    if (p.invoice_due) { judged++; if (day(p.paid_at) <= day(p.invoice_due) + DAY - 1) onTime++; }
  }
  const avg = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;
  const rate = judged ? onTime / judged : null;
  const oldest = overdueList.length ? Math.max(...overdueList.map((i) => Math.round((day(today) - day(i.due_date!)) / DAY))) : null;
  let rating: PaymentProfile["rating"] = "new";
  if (judged >= 2 || overdueList.length) {
    if ((oldest ?? 0) > 60 || (rate !== null && rate < 0.4)) rating = "poor";
    else if ((oldest ?? 0) > 14 || (rate !== null && rate < 0.7)) rating = "slow";
    else if (rate !== null && rate >= 0.9 && !overdueList.length) rating = "great";
    else rating = "good";
  }
  return {
    invoices: live.length,
    paidInvoices: live.filter((i) => i.status === "paid").length,
    lifetimePaid,
    owing: Math.round(owingList.reduce((a, i) => a + Number(i.balance ?? 0), 0) * 100) / 100,
    overdue: Math.round(overdueList.reduce((a, i) => a + Number(i.balance ?? 0), 0) * 100) / 100,
    overdueCount: overdueList.length,
    oldestOverdueDays: oldest,
    avgDaysToPay: avg,
    onTimeRate: rate,
    lastPaidAt: payments.length ? payments.map((p) => p.paid_at).sort().at(-1)! : null,
    rating,
  };
}

export const RATING: Record<PaymentProfile["rating"], { label: string; tone: Tone }> = {
  great: { label: "Pays on time", tone: "green" }, good: { label: "Pays reliably", tone: "blue" }, slow: { label: "Slow payer", tone: "amber" },
  poor: { label: "Poor payer", tone: "red" }, new: { label: "Not enough history", tone: "neutral" },
};

/** Hours worked shown as "1 h 30 m". */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} m` : `${h} h`;
}

/** Billable time as an invoice line, GST inclusive: hours (to the nearest quarter) × hourly rate inc GST. */
export function timeLine(minutes: number, hourlyExGst: number, description: string, accountCode: string | null) {
  const hours = Math.max(0.25, Math.round((minutes / 60) * 4) / 4);
  const inc = Math.round(hourlyExGst * 1.1 * 100) / 100;
  return { description, quantity: hours, unit_amount: inc, tax_rate: 10 as const, item_code: null, account_code: accountCode, inc: true as const };
}

/** Nerd Herd settings (organisations.settings.nerdherd). */
export interface NerdSettings { hourlyRate: number; accountCode: string; emailTickets: boolean; supportEmail: string | null }
export function readNerd(settings: unknown): NerdSettings {
  const n = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).nerdherd : null) ?? {}) as Record<string, unknown>;
  const rate = Number(n.hourly_rate);
  return {
    hourlyRate: Number.isFinite(rate) && rate > 0 ? rate : 120,
    accountCode: typeof n.account_code === "string" && n.account_code.trim() ? n.account_code.trim() : "6664",
    emailTickets: n.email_tickets !== false,
    supportEmail: typeof n.support_email === "string" && n.support_email.includes("@") ? n.support_email.trim().toLowerCase() : null,
  };
}
