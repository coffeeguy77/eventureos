import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Text messages through the business's own Twilio account. The sender is an approved alphanumeric caller ID (up to
 * 11 letters/numbers, e.g. "BeanCulture"), a Twilio number (+61…), or a Messaging Service (MG…).
 * Credentials live in the integrations table (provider "twilio": Account SID as the account id, Auth token as the
 * token, sender in settings).
 */
export interface TwilioConfig { sid: string; token: string; sender: string }

export async function loadTwilio(db: SupabaseClient, orgId: string): Promise<TwilioConfig | null> {
  const { data: integ } = await db.from("integrations").select("id, status, settings, external_account_id").eq("organisation_id", orgId).eq("provider", "twilio").maybeSingle();
  if (!integ || integ.status !== "connected" || !integ.external_account_id) return null;
  const { data: tok } = await db.rpc("service_get_integration_tokens", { p_integration_id: integ.id });
  const row = (Array.isArray(tok) ? tok[0] : tok) as { access_token: string | null } | undefined;
  const sender = String(((integ.settings ?? {}) as Record<string, unknown>).sender ?? "");
  if (!row?.access_token || !sender) return null;
  return { sid: integ.external_account_id as string, token: row.access_token, sender };
}

/** Australian mobile (or any +number) → E.164; null for numbers that can't take a text (landlines, 1300…). */
export function smsNumber(n: string): string | null {
  const t = n.trim();
  const d = t.replace(/\D/g, "");
  if (/^0[45]\d{8}$/.test(d)) return `+61${d.slice(1)}`;
  if (/^61[45]\d{8}$/.test(d)) return `+${d}`;
  if (/^\+/.test(t) && !/^\+61/.test(t) && d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

export const validSender = (s: string) => /^(?=.*[A-Za-z])[A-Za-z0-9 ]{1,11}$/.test(s) || /^\+\d{8,15}$/.test(s) || /^MG[0-9a-f]{32}$/i.test(s);

export async function sendSms(cfg: TwilioConfig, to: string, body: string): Promise<{ sid: string; status: string }> {
  const form = new URLSearchParams({ To: to, Body: body });
  if (/^MG/i.test(cfg.sender)) form.set("MessagingServiceSid", cfg.sender); else form.set("From", cfg.sender);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.sid)}/Messages.json`, {
    method: "POST", body: form,
    headers: { authorization: `Basic ${Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json().catch(() => ({})) as { sid?: string; status?: string; message?: string; code?: number };
  if (!res.ok) throw new Error(j.code === 21612 || j.code === 21211 ? `Twilio can't text ${to} (${j.message ?? "not a mobile"})` : j.code === 21606 || j.code === 21659 ? `The sender "${cfg.sender}" isn't allowed for this number — check it's approved in Twilio.` : `Twilio: ${j.message ?? res.statusText}`);
  return { sid: j.sid ?? "", status: j.status ?? "queued" };
}

/** Check credentials (and get the account's name) when connecting. */
export async function twilioAccount(sid: string, token: string): Promise<string> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, {
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` }, signal: AbortSignal.timeout(15000),
  });
  const j = await res.json().catch(() => ({})) as { friendly_name?: string; status?: string; message?: string };
  if (res.status === 401) throw new Error("Twilio didn't accept that Account SID and Auth token — copy them again from the Twilio console.");
  if (!res.ok) throw new Error(`Twilio: ${j.message ?? res.statusText}`);
  if (j.status && j.status !== "active") throw new Error(`That Twilio account is ${j.status}.`);
  return j.friendly_name ?? sid;
}
