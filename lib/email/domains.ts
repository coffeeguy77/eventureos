import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ResendError, createDomain, getDomain, listDomains, verifyDomain, type ResendRecord } from "./resend-api";

/**
 * A business's own sending domain (organisations.settings.email_domain). The business adds the DNS records Resend
 * gives (shown in Settings → Email with a tick for each one once Resend sees it); after that EventureOS emails —
 * quotes, invoices, replies, notices — come from e.g. hello@theirdomain.com.au instead of the EventureOS address.
 */
export interface EmailDomain {
  domain: string;
  resend_id: string | null;
  status: string;                 // Resend: not_started | pending | verified | partially_verified | failed | temporary_failure
  records: ResendRecord[];
  from_local: string;             // before the @
  from_name: string | null;       // display name (blank = business name)
  use: boolean;                   // send from it once verified
  verified_at: string | null;
  checked_at: string | null;
  error: string | null;
}

export function readEmailDomain(settings: unknown): EmailDomain | null {
  const d = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).email_domain : null) ?? null) as Partial<EmailDomain> | null;
  if (!d || typeof d.domain !== "string" || !d.domain) return null;
  return {
    domain: d.domain, resend_id: d.resend_id ?? null, status: d.status ?? "not_started", records: Array.isArray(d.records) ? d.records : [],
    from_local: d.from_local || "hello", from_name: d.from_name ?? null, use: d.use !== false, verified_at: d.verified_at ?? null,
    checked_at: d.checked_at ?? null, error: d.error ?? null,
  };
}

export const isVerified = (d: EmailDomain | null) => !!d && d.status === "verified";

export function cleanSendingDomain(v: string) {
  const d = v.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) throw new Error("Enter just the domain, e.g. webculture.au");
  if (/(^|\.)eventureos\.com\.au$/.test(d)) throw new Error("That's EventureOS's own domain — enter your business's domain.");
  return d;
}

export function cleanLocal(v: string) {
  const l = (v || "hello").trim().toLowerCase();
  if (!/^[a-z0-9._+-]{1,40}$/.test(l)) throw new Error("The address before the @ can only use letters, numbers, dots, dashes and +.");
  return l;
}

/** Add (or find) the domain in Resend and return its DNS records. */
export async function registerDomain(domain: string): Promise<{ id: string; status: string; records: ResendRecord[] }> {
  try {
    const d = await createDomain(domain, { region: "ap-northeast-1" });
    return { id: d.id, status: d.status, records: d.records ?? [] };
  } catch (e) {
    // Already in the EventureOS Resend account (e.g. set up before) → reuse it
    if (e instanceof ResendError && (e.status === 409 || e.status === 422 || /already/i.test(e.message))) {
      const found = (await listDomains()).find((x) => x.name.toLowerCase() === domain);
      if (found) { const g = await getDomain(found.id); return { id: g.id, status: g.status, records: g.records ?? [] }; }
    }
    throw e;
  }
}

/** Ask Resend to look again, then read back the status of each record. */
export async function refreshDomain(d: EmailDomain): Promise<EmailDomain> {
  if (!d.resend_id) return d;
  const now = new Date().toISOString();
  try {
    if (d.status !== "verified") await verifyDomain(d.resend_id).catch(() => undefined);
    const g = await getDomain(d.resend_id);
    const status = g.status;
    return { ...d, status, records: g.records ?? d.records, checked_at: now, error: null, verified_at: status === "verified" ? d.verified_at ?? now : null };
  } catch (e) {
    return { ...d, checked_at: now, error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
  }
}

/** Background: re-check every business whose domain isn't verified yet (a few at a time). */
export async function checkPendingDomains(db: SupabaseClient) {
  const { data, error } = await db.from("organisations").select("id, settings").not("settings->email_domain", "is", null).limit(200);
  if (error) return { error: error.message };
  let checked = 0, verified = 0;
  for (const o of (data ?? []) as { id: string; settings: Record<string, unknown> }[]) {
    const d = readEmailDomain(o.settings);
    if (!d || !d.resend_id || d.status === "verified") continue;
    if (d.checked_at && Date.now() - Date.parse(d.checked_at) < 15 * 60_000) continue;
    if (checked >= 10) break;
    const next = await refreshDomain(d);
    checked++;
    if (next.status === "verified") verified++;
    // re-read settings just before writing so nothing else is lost
    const { data: fresh } = await db.from("organisations").select("settings").eq("id", o.id).single();
    await db.from("organisations").update({ settings: { ...((fresh?.settings ?? {}) as Record<string, unknown>), email_domain: next } }).eq("id", o.id);
    if (next.status === "verified" && d.status !== "verified") {
      await db.from("notifications").insert({ organisation_id: o.id, type: "email.domain_verified", title: `${d.domain} is verified`, body: `Emails from EventureOS now come from ${d.from_local}@${d.domain}.`, link: "/settings/email" });
    }
  }
  return { checked, verified };
}

/** The From address for a business's emails, or null to use the EventureOS address. Cached for a minute. */
const cache = new Map<string, { at: number; from: { address: string; name: string | null } | null }>();
export async function brandedSender(db: SupabaseClient, orgId: string): Promise<{ address: string; name: string | null } | null> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < 60_000) return hit.from;
  let from: { address: string; name: string | null } | null = null;
  try {
    const { data } = await db.from("organisations").select("settings").eq("id", orgId).maybeSingle();
    const d = readEmailDomain(data?.settings);
    if (d && d.use && isVerified(d)) from = { address: `${d.from_local}@${d.domain}`, name: d.from_name };
  } catch { from = null; }
  cache.set(orgId, { at: Date.now(), from });
  return from;
}
