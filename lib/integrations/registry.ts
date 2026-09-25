/**
 * Integration provider registry — the single list the Integrations screen, OAuth routes and sync
 * runner read from. Adding a provider = adding an entry here (+ its adapter) — the UI picks it up.
 */

export type ProviderId =
  | "gmail" | "google_calendar" | "xero"
  | "outlook" | "microsoft_calendar" | "stripe" | "square" | "myob" | "quickbooks" | "mailchimp" | "twilio" | "zapier" | "make";

export type ProviderCategory = "Email" | "Calendar" | "Accounting" | "Payments" | "Marketing" | "Messaging" | "Automation";

export interface ProviderDef {
  id: ProviderId;
  name: string;
  category: ProviderCategory;
  description: string;
  /** "live" providers can be connected; "coming_soon" are shown in the marketplace only. */
  availability: "live" | "coming_soon";
  /** Where connection status comes from. */
  statusSource: "integrations_table" | "none";
  /** Env vars that must be set before Connect is enabled. */
  requiredEnv: string[];
  /** Env vars that unlock extra features (shown as hints, never block connecting). */
  optionalEnv?: string[];
  capabilities: string[];
  /** Brand-ish accent for the card mark (no logos bundled). */
  mark: { letter: string; bg: string; fg: string };
  docsUrl?: string;
}

/** Env var that signs OAuth state. Either works; OAUTH_STATE_SECRET is preferred. */
export const STATE_SECRET_ENV = ["OAUTH_STATE_SECRET", "CRON_SECRET"] as const;

export const PROVIDERS: ProviderDef[] = [
  {
    id: "gmail", name: "Gmail", category: "Email", availability: "live", statusSource: "integrations_table",
    description: "Sync enquiry and customer conversations into EventureOS. Mail stays in Gmail — replies you send here go out through your Gmail account.",
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    optionalEnv: ["ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    capabilities: ["Two-way email sync", "Automatic enquiry capture", "Enquiry classification", "Reply from EventureOS", "Historical import"],
    mark: { letter: "G", bg: "bg-rose-50", fg: "text-rose-600" },
    docsUrl: "https://developers.google.com/workspace/gmail/api/guides",
  },
  {
    id: "google_calendar", name: "Google Calendar", category: "Calendar", availability: "live", statusSource: "integrations_table",
    description: "Push confirmed events, site visits and setups to the Google calendars you choose, without duplicates. Optionally show busy time from Google.",
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    optionalEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    capabilities: ["One or more calendars", "Per-resource sync", "No duplicate events", "Busy-time import"],
    mark: { letter: "C", bg: "bg-sky-50", fg: "text-sky-600" },
    docsUrl: "https://developers.google.com/workspace/calendar/api/guides/overview",
  },
  {
    id: "xero", name: "Xero", category: "Accounting", availability: "live", statusSource: "integrations_table",
    description: "Match Xero contacts to customers, bring in invoice and payment history, and push new invoices. Xero stays the source of truth for amounts and payment status.",
    requiredEnv: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],
    optionalEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    capabilities: ["Contact matching review", "Invoice & payment sync", "Push invoices", "Credit notes (read-only)"],
    mark: { letter: "X", bg: "bg-cyan-50", fg: "text-cyan-700" },
    docsUrl: "https://developer.xero.com/documentation/api/accounting/overview",
  },
  { id: "outlook", name: "Outlook", category: "Email", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["Email sync"], description: "Microsoft 365 / Outlook mail, the same way Gmail works today.", mark: { letter: "O", bg: "bg-blue-50", fg: "text-blue-700" } },
  { id: "microsoft_calendar", name: "Microsoft Calendar", category: "Calendar", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["Calendar sync"], description: "Sync events to Outlook / Microsoft 365 calendars.", mark: { letter: "M", bg: "bg-blue-50", fg: "text-blue-700" } },
  { id: "stripe", name: "Stripe", category: "Payments", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["Card payments"], description: "Let customers pay deposits and invoices by card from the portal.", mark: { letter: "S", bg: "bg-indigo-50", fg: "text-indigo-700" } },
  { id: "square", name: "Square", category: "Payments", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["Payments"], description: "Record on-the-day sales and card payments.", mark: { letter: "□", bg: "bg-zinc-100", fg: "text-zinc-800" } },
  { id: "myob", name: "MYOB", category: "Accounting", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["Accounting sync"], description: "Invoices and contacts for MYOB Business.", mark: { letter: "M", bg: "bg-purple-50", fg: "text-purple-700" } },
  { id: "quickbooks", name: "QuickBooks", category: "Accounting", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["Accounting sync"], description: "Invoices and contacts for QuickBooks Online.", mark: { letter: "Q", bg: "bg-emerald-50", fg: "text-emerald-700" } },
  { id: "mailchimp", name: "Mailchimp", category: "Marketing", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["Audience sync"], description: "Keep past customers in your newsletter audience.", mark: { letter: "M", bg: "bg-amber-50", fg: "text-amber-700" } },
  { id: "twilio", name: "Twilio SMS", category: "Messaging", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["SMS reminders"], description: "Text reminders and on-the-day updates.", mark: { letter: "T", bg: "bg-red-50", fg: "text-red-700" } },
  { id: "zapier", name: "Zapier", category: "Automation", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["Triggers & actions"], description: "Connect EventureOS to thousands of apps.", mark: { letter: "Z", bg: "bg-orange-50", fg: "text-orange-700" } },
  { id: "make", name: "Make", category: "Automation", availability: "coming_soon", statusSource: "none", requiredEnv: [], capabilities: ["Scenarios"], description: "Visual automations with Make.com.", mark: { letter: "M", bg: "bg-fuchsia-50", fg: "text-fuchsia-700" } },
];

export const LIVE_PROVIDERS = PROVIDERS.filter((p) => p.availability === "live");
export type LiveProviderId = "gmail" | "google_calendar" | "xero";

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
export function isLiveProvider(id: string): id is LiveProviderId {
  return LIVE_PROVIDERS.some((p) => p.id === id);
}

const has = (k: string) => !!process.env[k]?.trim();

/** Everything that must be configured before a provider can connect — as exact env var names. */
export function missingEnv(id: string): string[] {
  const p = getProvider(id);
  if (!p || p.availability !== "live") return [];
  const missing = p.requiredEnv.filter((k) => !has(k));
  if (!STATE_SECRET_ENV.some(has)) missing.push("OAUTH_STATE_SECRET (or CRON_SECRET)");
  return missing;
}

export function envStatus() {
  return {
    ai: has("ANTHROPIC_API_KEY"),
    aiModel: process.env.AI_MODEL?.trim() || null,
    serviceRole: has("SUPABASE_SERVICE_ROLE_KEY"),
    cronSecret: has("CRON_SECRET"),
    stateSecret: STATE_SECRET_ENV.some(has),
  };
}

/** Public base URL used for OAuth redirect URIs and links in synced calendar entries. */
export function appBaseUrl(requestOrigin?: string) {
  const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (requestOrigin) return requestOrigin.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://eventureos.vercel.app";
}

export function redirectUri(provider: LiveProviderId, requestOrigin?: string) {
  return `${appBaseUrl(requestOrigin)}/api/integrations/${provider}/callback`;
}
