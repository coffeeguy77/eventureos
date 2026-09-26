import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, todayISO } from "@/lib/format";
import type { EventStatus, InvoiceStatus, QuoteStatus } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export const SLUG_RE = /^[a-z0-9-]{2,60}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_BRAND = "#6028EC";

export function isSlug(s: unknown): s is string {
  return typeof s === "string" && SLUG_RE.test(s);
}
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

/* ------------------------------------------------------------------ */
/* Branding (public, via portal_branding RPC — no private data)        */
/* ------------------------------------------------------------------ */

export interface Branding {
  name: string;
  slug: string;
  logo_url: string | null;
  brand_colour: string;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
}

export const getBranding = cache(async (slug: string): Promise<Branding | null> => {
  if (!isSlug(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_branding", { p_slug: slug });
  if (error) throw new Error(`Could not load this portal: ${error.message}`);
  if (!data) return null;
  const b = data as Branding;
  return { ...b, brand_colour: safeColour(b.brand_colour) };
});

export function safeColour(c: string | null | undefined) {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : DEFAULT_BRAND;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

/** CSS variables for the org's brand: accent, readable text on it, and soft tints. */
export function brandVars(hex: string): React.CSSProperties {
  const [r, g, b] = hexToRgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const mix = (t: number) => `rgb(${Math.round(r * t + 255 * (1 - t))}, ${Math.round(g * t + 255 * (1 - t))}, ${Math.round(b * t + 255 * (1 - t))})`;
  // Darken very light brand colours for text use so links stay readable on white
  const ink = lum > 0.45 ? `rgb(${Math.round(r * 0.55)}, ${Math.round(g * 0.55)}, ${Math.round(b * 0.55)})` : hex;
  return {
    ["--portal-brand" as string]: hex,
    ["--portal-brand-fg" as string]: lum > 0.45 ? "#16151D" : "#FFFFFF",
    ["--portal-brand-ink" as string]: ink,
    ["--portal-brand-soft" as string]: mix(0.08),
    ["--portal-brand-line" as string]: mix(0.25),
  };
}

/* ------------------------------------------------------------------ */
/* Signed-in portal context                                            */
/* ------------------------------------------------------------------ */

export interface PortalContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string };
  branding: Branding;
  org: { id: string; name: string; timezone: string; currency: string };
  /** Customer records this signed-in person represents in THIS organisation (from their linked contacts). */
  customerIds: string[];
  customers: { id: string; name: string }[];
  contactName: string | null;
}

/**
 * Requires a signed-in user who has portal access to this organisation.
 * /p/* is public at the middleware level, so every portal page must call this.
 * Every query afterwards must ALSO filter by `customerIds` — RLS alone would show a
 * staff member (who happens to sign in here) the whole organisation.
 */
export const requirePortal = cache(async (slug: string): Promise<PortalContext> => {
  const branding = await getBranding(slug);
  if (!branding) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect(`/p/${slug}/login`);

  const { data: org, error: orgErr } = await supabase
    .from("organisations")
    .select("id, name, timezone, currency")
    .eq("slug", slug)
    .maybeSingle();
  if (orgErr) throw new Error(`Could not load your portal: ${orgErr.message}`);
  if (!org) redirect(`/p/${slug}/login?reason=no-access`);

  const { data: contacts, error: ctErr } = await supabase
    .from("contacts")
    .select("customer_id, first_name, last_name")
    .eq("organisation_id", org.id)
    .eq("portal_user_id", user.id);
  if (ctErr) throw new Error(`Could not load your bookings: ${ctErr.message}`);
  const customerIds = [...new Set((contacts ?? []).map((c) => c.customer_id as string))];
  if (customerIds.length === 0) redirect(`/p/${slug}/login?reason=no-access`);

  const { data: customers, error: cuErr } = await supabase
    .from("portal_customers")
    .select("id, name")
    .eq("organisation_id", org.id)
    .in("id", customerIds);
  if (cuErr) throw new Error(`Could not load your bookings: ${cuErr.message}`);

  const first = contacts?.[0];
  return {
    supabase,
    user: { id: user.id, email: user.email },
    branding,
    org: org as PortalContext["org"],
    customerIds,
    customers: (customers ?? []) as { id: string; name: string }[],
    contactName: first ? [first.first_name, first.last_name].filter(Boolean).join(" ") : null,
  };
});

/* ------------------------------------------------------------------ */
/* Shapes (only customer-safe columns are ever selected)               */
/* ------------------------------------------------------------------ */

/** Read from the column-restricted view public.portal_events (never public.events). */
export const EVENT_COLUMNS =
  "id, number, name, customer_id, event_type, event_date, start_time, finish_time, venue, address, guest_count, status, customer_notes, services, created_at";

export interface PortalEvent {
  id: string; number: number | null; name: string; customer_id: string; event_type: string | null;
  event_date: string | null; start_time: string | null; finish_time: string | null; venue: string | null;
  address: string | null; guest_count: number | null; status: EventStatus; customer_notes: string | null;
  services: string[]; created_at: string;
}

/** Read from the column-restricted view public.portal_quotes (no draft text). */
export const QUOTE_COLUMNS = "id, number, status, event_id, customer_id, current_version_id, created_at";
export interface PortalQuote {
  id: string; number: number | null; status: QuoteStatus; event_id: string; customer_id: string;
  current_version_id: string | null; created_at: string;
}

export const VERSION_COLUMNS =
  "id, quote_id, version_number, snapshot, subtotal, tax_total, total, status, published_at, viewed_at, responded_at, accepted_by_name, decline_reason";
export interface SnapshotItem {
  name: string; description?: string | null; quantity: number; unit?: string | null; unit_price: number;
  tax_rate?: number; discount_percent?: number; optional?: boolean; package?: boolean; image_url?: string | null; line_total: number;
}
export interface SnapshotSection { title: string; description?: string | null; optional?: boolean; items: SnapshotItem[] }
export interface QuoteSnapshot {
  title?: string; notes?: string | null; terms?: string | null; issue_date?: string | null; expiry_date?: string | null;
  sections?: SnapshotSection[]; subtotal?: number; tax_total?: number; total?: number;
}
export interface PortalVersion {
  id: string; quote_id: string; version_number: number; snapshot: QuoteSnapshot; subtotal: number; tax_total: number;
  total: number; status: QuoteStatus; published_at: string; viewed_at: string | null; responded_at: string | null;
  accepted_by_name: string | null; decline_reason: string | null;
}

export const INVOICE_COLUMNS = "id, number, kind, event_id, customer_id, issue_date, due_date, subtotal, tax_total, total, amount_paid, balance, status, currency";
export interface PortalInvoice {
  id: string; number: string | null; kind: string; event_id: string | null; customer_id: string; issue_date: string;
  due_date: string | null; subtotal: number; tax_total: number; total: number; amount_paid: number; balance: number;
  status: InvoiceStatus; currency: string;
}

export interface PortalPayment { id: string; invoice_id: string; amount: number; paid_at: string; method: string | null; reference: string | null }

export interface PortalDocument {
  id: string; name: string; storage_path: string | null; mime_type: string | null; size_bytes: number | null;
  event_id: string | null; customer_id: string; requested_from_customer: boolean; created_at: string; updated_at: string;
}

/* ------------------------------------------------------------------ */
/* Customer-facing labels and the "next action" for the customer       */
/* ------------------------------------------------------------------ */

export const CUSTOMER_EVENT_STATUS: Record<EventStatus, { label: string; tone: "neutral" | "blue" | "brand" | "amber" | "green" | "slate" | "red" }> = {
  enquiry: { label: "Enquiry received", tone: "neutral" },
  planning: { label: "In planning", tone: "blue" },
  quoted: { label: "Quote on the way", tone: "blue" },
  awaiting_approval: { label: "Awaiting your approval", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "green" },
  completed: { label: "Completed", tone: "slate" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export const CUSTOMER_QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: "neutral" | "blue" | "brand" | "amber" | "green" | "slate" | "red" }> = {
  draft: { label: "Being prepared", tone: "neutral" },
  sent: { label: "Ready to review", tone: "amber" },
  viewed: { label: "Ready to review", tone: "amber" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  expired: { label: "Expired", tone: "slate" },
  superseded: { label: "Replaced by a newer version", tone: "slate" },
};

export const CUSTOMER_INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: "neutral" | "blue" | "brand" | "amber" | "green" | "slate" | "red" }> = {
  draft: { label: "Draft", tone: "neutral" },
  awaiting_payment: { label: "Due", tone: "amber" },
  part_paid: { label: "Part paid", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  overdue: { label: "Overdue", tone: "red" },
  void: { label: "Cancelled", tone: "slate" },
};

export const INVOICE_KIND: Record<string, string> = { deposit: "Deposit", final: "Final balance", full: "Invoice", other: "Invoice" };

export function isOpenInvoice(i: PortalInvoice) {
  return ["awaiting_payment", "part_paid", "overdue"].includes(i.status) && Number(i.balance) > 0;
}

export function quoteExpired(v: PortalVersion, tz: string) {
  const exp = v.snapshot?.expiry_date;
  return !!exp && exp < todayISO(tz);
}

export function awaitingResponse(v: PortalVersion | null | undefined, tz: string) {
  return !!v && (v.status === "sent" || v.status === "viewed") && !quoteExpired(v, tz);
}

export function paymentSummary(invoices: PortalInvoice[], currency: string): { label: string; tone: "neutral" | "amber" | "green" | "red" | "slate" } {
  const live = invoices.filter((i) => i.status !== "void" && i.status !== "draft");
  if (live.length === 0) return { label: "Not invoiced yet", tone: "neutral" };
  if (live.some((i) => i.status === "overdue")) return { label: "Payment overdue", tone: "red" };
  const outstanding = live.reduce((s, i) => s + Math.max(0, Number(i.balance)), 0);
  const paid = live.reduce((s, i) => s + Number(i.amount_paid), 0);
  if (outstanding <= 0) return { label: "Paid in full", tone: "green" };
  if (paid > 0) return { label: `${formatCurrency(outstanding, currency)} outstanding`, tone: "amber" };
  return { label: "Payment due", tone: "amber" };
}

function formatCurrency(n: number, currency: string) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
}

export interface CustomerNextAction {
  label: string;
  detail?: string;
  tab: "overview" | "quote" | "documents" | "payments" | "messages";
  urgent: boolean;
}

export function customerNextAction(args: {
  event: PortalEvent;
  version: PortalVersion | null;
  invoices: PortalInvoice[];
  requestedDocs: number;
  tz: string;
}): CustomerNextAction {
  const { event, version, invoices, requestedDocs, tz } = args;
  if (event.status === "cancelled") return { label: "This booking was cancelled", detail: "Message us if you have any questions.", tab: "messages", urgent: false };
  if (awaitingResponse(version, tz)) return { label: "Review and accept your quote", detail: version?.snapshot?.expiry_date ? `Valid until ${fmtDate(version.snapshot.expiry_date)}` : undefined, tab: "quote", urgent: true };
  if (version && (version.status === "sent" || version.status === "viewed") && quoteExpired(version, tz))
    return { label: "Your quote has expired", detail: "Send us a message and we'll refresh it for you.", tab: "messages", urgent: false };
  if (version?.status === "declined") return { label: "Quote declined", detail: "We'll be in touch — or send us a message.", tab: "messages", urgent: false };
  if (requestedDocs > 0) return { label: requestedDocs === 1 ? "Upload the requested document" : `Upload ${requestedDocs} requested documents`, tab: "documents", urgent: true };
  const open = invoices.filter(isOpenInvoice).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  if (open.length) {
    const inv = open[0];
    const what = inv.kind === "deposit" ? "Pay deposit" : inv.kind === "final" ? "Pay final balance" : `Pay invoice ${inv.number ?? ""}`.trim();
    return { label: inv.status === "overdue" ? `${what} — overdue` : what, detail: inv.due_date ? `Due ${fmtDate(inv.due_date)}` : undefined, tab: "payments", urgent: true };
  }
  if (event.status === "completed") return { label: "Thanks for celebrating with us", tab: "overview", urgent: false };
  if (!version) return { label: "We're preparing your quote", detail: "We'll let you know as soon as it's ready.", tab: "overview", urgent: false };
  if (event.event_date && event.event_date < todayISO(tz)) return { label: "Thanks for celebrating with us", tab: "overview", urgent: false };
  return { label: "All set — see you on the day", tab: "overview", urgent: false };
}
