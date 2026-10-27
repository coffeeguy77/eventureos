/**
 * Hosting (pure): settings, matching hosting accounts to invoices, and each account's billing state.
 * Ported from Host Manager (Web Culture's WHM app) — the safety rules are kept exactly:
 *  - automatic actions only ever use an exact `HOSTING | {domain}` invoice reference match
 *  - this app marks its own WHM suspensions with a marker, and only ever automatically unsuspends those
 *  - protection flags (VIP, disputed, manual override, extension) beat everything
 * New here: an account can also be linked to a client; their hosting invoices are then shown (for a person to act on),
 * but never trigger anything automatic.
 */

import { mentions } from "./match";

export const APP_SUSPENSION_MARKER = "[wc-app-suspend]";
export const withMarker = (reason: string | null | undefined) => { const b = (reason ?? "").trim(); return b.includes(APP_SUSPENSION_MARKER) ? b : b ? `${b} ${APP_SUSPENSION_MARKER}` : APP_SUSPENSION_MARKER; };
export const hasMarker = (reason: string | null | undefined) => typeof reason === "string" && reason.includes(APP_SUSPENSION_MARKER);
export const stripMarker = (reason: string | null | undefined) => { if (typeof reason !== "string") return null; const c = reason.replace(APP_SUSPENSION_MARKER, "").replace(/\s+/g, " ").trim(); return c || null; };

export const normalizeDomain = (d: string | null | undefined) => (d ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
export const billingReference = (domain: string | null | undefined) => `HOSTING | ${normalizeDomain(domain)}`;

export interface NoticeTemplate { key: string; name: string; subject: string; message: string }
/** Words: {domain} {contact_name} {invoice} {amount} {due_date} {days_overdue} {pay_link} {brand} {reply_to} */
export const DEFAULT_NOTICES: NoticeTemplate[] = [
  { key: "overdue_notice", name: "Overdue notice", subject: "Hosting for {domain} — invoice {invoice} is overdue",
    message: "Hi {contact_name},\n\nThe hosting invoice {invoice} for {domain} ({amount}) was due on {due_date} and is now {days_overdue} days overdue.\n\nYou can pay it online here: {pay_link}\n\nIf you've already paid, thank you — please ignore this email.\n\nKind regards,\n{brand}" },
  { key: "suspension_warning", name: "Suspension warning", subject: "Action needed: {domain} will be suspended",
    message: "Hi {contact_name},\n\nWe still haven't received payment for hosting invoice {invoice} ({amount}) for {domain}, now {days_overdue} days overdue.\n\nTo avoid your website and email being suspended, please pay it in the next few days: {pay_link}\n\nIf there's a problem, just reply and we'll help.\n\nRegards,\n{brand}" },
  { key: "suspension_notice", name: "Suspended", subject: "{domain} has been suspended",
    message: "Hi {contact_name},\n\nThe hosting for {domain} has been suspended because invoice {invoice} ({amount}) is {days_overdue} days overdue.\n\nAs soon as it's paid your site will be switched back on: {pay_link}\n\nRegards,\n{brand}" },
  { key: "reactivation_notice", name: "Back online", subject: "{domain} is back online",
    message: "Hi {contact_name},\n\nThanks for your payment — the hosting for {domain} is back on.\n\nKind regards,\n{brand}" },
];

export interface HostingSettings {
  dryRun: boolean; autoSuspend: boolean; autoUnsuspend: boolean;
  outsideTermsAfterDays: number; dueSoonDays: number; minimumNoticeDaysBeforeSuspend: number; autoSuspendAfterDays: number;
  acceptedCodes: string[]; acceptedPrefixes: string[]; backupCodes: string[]; backupEnabled: boolean;
  menuLabel: string; brand: string | null; replyTo: string | null;
  suspendTitle: string; suspendMessage: string; templates: NoticeTemplate[];
}
export const DEFAULT_HOSTING: HostingSettings = {
  dryRun: true, autoSuspend: false, autoUnsuspend: true,
  outsideTermsAfterDays: 0, dueSoonDays: 3, minimumNoticeDaysBeforeSuspend: 3, autoSuspendAfterDays: 14,
  acceptedCodes: ["AWHS", "AWHSD"], acceptedPrefixes: ["HOSTING-"], backupCodes: ["AWBSS", "AWBSSD", "AWBSSDP"], backupEnabled: false,
  menuLabel: "Hosting", brand: null, replyTo: null,
  suspendTitle: "This website is temporarily unavailable",
  suspendMessage: "This site has been paused by its hosting provider. If you own this website, please contact us or pay your outstanding hosting invoice to switch it back on.",
  templates: DEFAULT_NOTICES,
};

const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const codes = (v: unknown, d: string[]) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9_.-]{1,40}$/.test(x)))].slice(0, 40) : d;
const text = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

export function readHosting(settings: unknown): HostingSettings {
  const h = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).hosting : null) ?? {}) as Record<string, unknown>;
  const saved = Array.isArray(h.templates) ? (h.templates as unknown[]) : [];
  const templates = DEFAULT_NOTICES.map((d) => {
    const o = (saved.find((x) => (x as { key?: unknown })?.key === d.key) ?? {}) as Record<string, unknown>;
    return { key: d.key, name: d.name, subject: text(o.subject, 200) ?? d.subject, message: typeof o.message === "string" && o.message.trim() ? o.message.replace(/\r\n/g, "\n").trim().slice(0, 4000) : d.message };
  });
  return {
    dryRun: h.dryRun !== false, autoSuspend: h.autoSuspend === true, autoUnsuspend: h.autoUnsuspend !== false,
    outsideTermsAfterDays: int(h.outsideTermsAfterDays, 0, 365, 0), dueSoonDays: int(h.dueSoonDays, 0, 60, 3),
    minimumNoticeDaysBeforeSuspend: int(h.minimumNoticeDaysBeforeSuspend, 0, 60, 3), autoSuspendAfterDays: int(h.autoSuspendAfterDays, 1, 365, 14),
    acceptedCodes: codes(h.acceptedCodes, DEFAULT_HOSTING.acceptedCodes), acceptedPrefixes: codes(h.acceptedPrefixes, DEFAULT_HOSTING.acceptedPrefixes),
    backupCodes: codes(h.backupCodes, DEFAULT_HOSTING.backupCodes), backupEnabled: h.backupEnabled === true,
    menuLabel: text(h.menuLabel, 30) ?? DEFAULT_HOSTING.menuLabel, brand: text(h.brand, 80), replyTo: text(h.replyTo, 200),
    suspendTitle: text(h.suspendTitle, 120) ?? DEFAULT_HOSTING.suspendTitle, suspendMessage: text(h.suspendMessage, 1000) ?? DEFAULT_HOSTING.suspendMessage,
    templates,
  };
}

export interface CodeRules { prefixes: string[]; codes: string[] }
export const codeRules = (s: HostingSettings): CodeRules => ({ prefixes: s.acceptedPrefixes, codes: [...s.acceptedCodes, ...(s.backupEnabled ? s.backupCodes : [])] });
const up = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
export const isHostingCode = (code: string | null | undefined, r: CodeRules) => { const c = up(code); return !!c && (r.codes.some((x) => up(x) === c) || r.prefixes.some((p) => up(p) && c.startsWith(up(p)))); };
export const hasHostingCode = (cs: string[], r: CodeRules) => cs.some((c) => isHostingCode(c, r));

/** An invoice as the matcher sees it (from the invoices table: Xero-synced or made here). */
export interface Inv { id: string; number: string; reference: string | null; status: string; total: number; amountPaid: number; dueDate: string | null; issueDate: string | null; itemCodes: string[]; customerId: string | null; payToken: string | null; /** reference + line descriptions, lower case */ text?: string }
export const amountDue = (i: Inv) => Math.max(0, Math.round((i.total - i.amountPaid) * 100) / 100);
const enforceable = (i: Inv) => i.status !== "draft" && i.status !== "void";
export const isPaid = (i: Inv) => i.status === "paid" || (amountDue(i) <= 0 && i.status !== "draft");

export type MatchStatus = "Exact Reference Match" | "Reference Contains Match" | "Reference Match But No Hosting Item" | "Multiple Matches" | "Client Match" | "No Match";
export interface Match { status: MatchStatus; invoice: Inv | null; reason: string; candidates: number }

function pick(pool: Inv[]) {
  return [...pool].sort((a, b) => (amountDue(b) > 0 ? 1 : 0) - (amountDue(a) > 0 ? 1 : 0) || (b.dueDate ?? b.issueDate ?? "").localeCompare(a.dueDate ?? a.issueDate ?? ""))[0] ?? null;
}

/**
 * Match by reference (Host Manager's strict rule). If nothing references the account and it's linked to a client,
 * fall back to that client's invoices with a hosting item code — a "Client Match", which is shown but never automated.
 */
export function matchInvoice(ref: string | null, invoices: Inv[], r: CodeRules, customerId: string | null = null, domain: string | null = null): Match {
  const R = (ref ?? "").trim();
  const cands = R ? invoices.filter((i) => enforceable(i) && typeof i.reference === "string" && i.reference.includes(R)) : [];
  if (!cands.length) {
    if (customerId) {
      const all = invoices.filter((i) => i.customerId === customerId && enforceable(i) && hasHostingCode(i.itemCodes, r));
      // a client with several sites: prefer the invoices that name this site
      const named = domain ? all.filter((i) => !!i.text && mentions(i.text, domain)) : [];
      const mine = named.length ? named : all;
      if (mine.length) return { status: "Client Match", invoice: pick(mine), reason: `No invoice references ${R || "this account"}; using the client's latest hosting invoice. Check it's the right one — nothing automatic happens on a client match.`, candidates: mine.length };
    }
    return { status: "No Match", invoice: null, reason: R ? `No invoice reference contains "${R}"` : "No billing reference", candidates: 0 };
  }
  const exact = cands.filter((c) => (c.reference ?? "").trim() === R);
  const pool = exact.length ? exact : cands;
  const withItem = pool.filter((c) => c.itemCodes.length > 0 && hasHostingCode(c.itemCodes, r));
  const inv = pick(withItem.length ? withItem : pool);
  const hasItem = !!inv && (inv.itemCodes.length === 0 || hasHostingCode(inv.itemCodes, r));
  if (!hasItem) return { status: "Reference Match But No Hosting Item", invoice: inv, reason: "The reference matched, but the invoice has no hosting item code.", candidates: cands.length };
  if (cands.length > 1) return { status: "Multiple Matches", invoice: inv, reason: `${cands.length} invoices reference this account; using the most relevant`, candidates: cands.length };
  if (exact.length) return { status: "Exact Reference Match", invoice: inv, reason: "The invoice reference exactly equals the billing reference", candidates: 1 };
  return { status: "Reference Contains Match", invoice: inv, reason: "The invoice reference contains the billing reference", candidates: 1 };
}

export type BillingStatus = "No Billing Reference" | "No Match" | "Paid" | "Due Soon" | "Not Due" | "Outside Terms" | "Notice Sent" | "Suspension Eligible"
  | "Suspended For Billing" | "Paid After Suspension" | "Needs Review" | "Manual Override" | "Disputed" | "VIP Protected" | "Extended";

export interface Flags { suspended: boolean; byApp: boolean; category: string | null; manual: boolean; disputed: boolean; vip: boolean; lastNoticeAt: string | null; lastNoticeType: string | null; extensionUntil: string | null }
export interface State { status: BillingStatus; daysOverdue: number | null; eligible: boolean }

const DAY = 86_400_000;
const at = (d: string) => Date.parse(d.length === 10 ? `${d}T00:00:00Z` : d);

export function billingState(o: { hasRef: boolean; match: Match; flags: Flags; s: Pick<HostingSettings, "outsideTermsAfterDays" | "dueSoonDays" | "minimumNoticeDaysBeforeSuspend">; now?: Date }): State {
  const { match, flags, s } = o;
  const now = (o.now ?? new Date()).getTime();
  const base: State = { status: "No Billing Reference", daysOverdue: null, eligible: false };
  if (flags.vip) return { ...base, status: "VIP Protected" };
  if (flags.disputed) return { ...base, status: "Disputed" };
  if (flags.manual) return { ...base, status: "Manual Override" };
  if (!o.hasRef && match.status !== "Client Match") return base;
  if (match.status === "No Match" || !match.invoice) return { ...base, status: "No Match" };
  if (match.status === "Reference Match But No Hosting Item") return { ...base, status: "Needs Review" };
  const inv = match.invoice;
  const forBilling = flags.suspended && flags.byApp && flags.category === "billing_overdue";
  if (isPaid(inv)) return { ...base, status: forBilling ? "Paid After Suspension" : "Paid", daysOverdue: 0 };
  if (!inv.dueDate) return { ...base, status: "Due Soon", daysOverdue: 0 };
  const due = at(inv.dueDate);
  const threshold = due + s.outsideTermsAfterDays * DAY;
  if (now <= threshold) return { ...base, status: now >= due - s.dueSoonDays * DAY ? "Due Soon" : "Not Due", daysOverdue: 0 };
  const daysOverdue = Math.floor((now - due) / DAY);
  if (flags.extensionUntil && at(flags.extensionUntil) + DAY > now) return { status: "Extended", daysOverdue, eligible: false };
  if (forBilling) return { status: "Suspended For Billing", daysOverdue, eligible: false };
  const warned = !!flags.lastNoticeAt && (flags.lastNoticeType === "suspension_warning" || flags.lastNoticeType === "overdue_notice");
  const age = flags.lastNoticeAt ? Math.floor((now - at(flags.lastNoticeAt)) / DAY) : 0;
  const eligible = warned && age >= s.minimumNoticeDaysBeforeSuspend;
  return { status: eligible ? "Suspension Eligible" : flags.lastNoticeAt ? "Notice Sent" : "Outside Terms", daysOverdue, eligible };
}

/** Is it safe to switch an account back on automatically? Every condition must hold. */
export function canAutoUnsuspend(a: { suspended: boolean; byApp: boolean; category: string | null; vip: boolean; disputed: boolean; manual: boolean; autoUnsuspend: boolean; matchStatus: string | null; billingStatus: string | null; amountDue: number | null }, globalOn: boolean): { ok: boolean; reason: string } {
  if (!a.suspended) return { ok: false, reason: "Not suspended" };
  if (!a.byApp) return { ok: false, reason: "Not suspended by EventureOS" };
  if (a.category !== "billing_overdue") return { ok: false, reason: `Suspended for ${a.category ?? "another reason"}, not billing` };
  if (a.vip) return { ok: false, reason: "VIP protected" };
  if (a.disputed) return { ok: false, reason: "Billing disputed" };
  if (a.manual) return { ok: false, reason: "Manual override" };
  if (!globalOn) return { ok: false, reason: "Automatic unsuspend is off" };
  if (!a.autoUnsuspend) return { ok: false, reason: "Automatic unsuspend is off for this account" };
  if (a.matchStatus !== "Exact Reference Match") return { ok: false, reason: `Match is "${a.matchStatus ?? "none"}" — needs an exact reference match` };
  if (!(a.billingStatus === "Paid" || a.billingStatus === "Paid After Suspension") || (a.amountDue ?? 1) > 0) return { ok: false, reason: "Invoice not fully paid" };
  return { ok: true, reason: "Suspended for billing and the invoice is now paid" };
}

/** Is it safe to suspend automatically? (only when switched on, exact reference, notice given, long enough overdue) */
export function canAutoSuspend(a: { suspended: boolean; matchStatus: string | null; billingStatus: string | null; daysOverdue: number | null; vip: boolean; disputed: boolean; manual: boolean; autoCheck: boolean }, s: Pick<HostingSettings, "autoSuspend" | "autoSuspendAfterDays">): { ok: boolean; reason: string } {
  if (!s.autoSuspend) return { ok: false, reason: "Automatic suspend is off" };
  if (a.suspended) return { ok: false, reason: "Already suspended" };
  if (a.vip || a.disputed || a.manual) return { ok: false, reason: "Protected" };
  if (!a.autoCheck) return { ok: false, reason: "Automatic checks are off for this account" };
  if (a.matchStatus !== "Exact Reference Match") return { ok: false, reason: "Needs an exact reference match" };
  if (a.billingStatus !== "Suspension Eligible") return { ok: false, reason: "Not eligible (needs a notice and the notice period)" };
  if ((a.daysOverdue ?? 0) < s.autoSuspendAfterDays) return { ok: false, reason: `Less than ${s.autoSuspendAfterDays} days overdue` };
  return { ok: true, reason: `${a.daysOverdue} days overdue, notice given` };
}

export function fillNotice(t: string, words: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in words ? words[k] : m));
}

export const ATTENTION: BillingStatus[] = ["Outside Terms", "Notice Sent", "Suspension Eligible", "Paid After Suspension"];
export const REVIEW: BillingStatus[] = ["Needs Review", "No Match", "No Billing Reference"];
export const STATUS_TONE: Record<string, "neutral" | "brand" | "blue" | "green" | "amber" | "red" | "slate"> = {
  Paid: "green", "Not Due": "slate", "Due Soon": "blue", "Outside Terms": "amber", "Notice Sent": "amber", "Suspension Eligible": "red", "Suspended For Billing": "red",
  "Paid After Suspension": "brand", "Needs Review": "amber", "No Match": "neutral", "No Billing Reference": "neutral", "Manual Override": "slate", Disputed: "amber", "VIP Protected": "brand", Extended: "blue",
};
