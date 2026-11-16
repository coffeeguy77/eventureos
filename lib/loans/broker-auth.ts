import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import { serviceDb } from "./server";

/**
 * Brokers sign in with a one-time link emailed to them (no password to forget, no EventureOS account).
 * The link works once, for 20 minutes; signing in stores a random token in an http-only cookie for 30 days.
 * Only hashes of links and tokens are stored. Nothing on /broker is visible without a sign-in.
 */
const LINK_MINUTES = 20;
const SESSION_DAYS = 30;
const COOKIE = "eos_broker";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface Broker { id: string; organisation_id: string; name: string; email: string; company: string | null; phone: string | null }
const BROKER_COLS = "id, organisation_id, name, email, company, phone";

const base = () => (process.env.APP_URL?.trim() || "https://www.eventureos.com.au").replace(/\/+$/, "");

/** Email a broker their sign-in link. Same answer whether or not the address is known (no hint who's listed). */
export async function sendBrokerLink(emailRaw: string, opts: { invitedBy?: string } = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: "Enter your email address." };
  const db = serviceDb();
  const { data: rows } = await db.from("loan_brokers").select(BROKER_COLS).ilike("email", email).eq("active", true).limit(10);
  for (const b of (rows ?? []) as Broker[]) {
    if (b.email.toLowerCase() !== email) continue;
    const { count } = await db.from("loan_broker_codes").select("id", { count: "exact", head: true }).eq("broker_id", b.id).gt("created_at", new Date(Date.now() - 15 * 60e3).toISOString());
    if ((count ?? 0) >= 5) return { ok: false, error: "We've sent a few links already — check your inbox (and junk), or try again in 15 minutes." };
    const token = randomBytes(32).toString("hex");
    const { error } = await db.from("loan_broker_codes").insert({ organisation_id: b.organisation_id, broker_id: b.id, hash: sha(token), expires_at: new Date(Date.now() + LINK_MINUTES * 60e3).toISOString() });
    if (error) return { ok: false, error: "Sign-in isn't ready yet — please try again soon." };
    const { data: org } = await db.from("organisations").select("name").eq("id", b.organisation_id).single();
    const from = org?.name ?? "EventureOS";
    const link = `${base()}/broker/auth?t=${token}`;
    const first = b.name.split(/\s+/)[0] || "there";
    const lead = opts.invitedBy ? `${opts.invitedBy} has shared a loan application with you.` : `Here's your sign-in link for the loan files ${from} shares with you.`;
    await sendEmail({
      to: b.email, fromName: from, orgId: b.organisation_id,
      subject: opts.invitedBy ? `${from}: a loan application has been shared with you` : `Your sign-in link — ${from} loan files`,
      text: `Hi ${first},\n\n${lead}\n\nSign in: ${link}\n\nThe link works once and expires in ${LINK_MINUTES} minutes. Any time after, go to ${base()}/broker and enter this email address for a new one.\n\n${from}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2430"><p>Hi ${esc(first)},</p><p>${esc(lead)}</p>
<p><a href="${link}" style="display:inline-block;padding:12px 22px;background:#1f2a44;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Sign in to view</a></p>
<p style="color:#5b6475;font-size:13px">The link works once and expires in ${LINK_MINUTES} minutes. Any time after, go to <a href="${base()}/broker">${base().replace(/^https?:\/\//, "")}/broker</a> and enter this email address for a new one. If you weren't expecting this, you can ignore it.</p><p>${esc(from)}</p></div>`,
    });
  }
  return { ok: true };
}

/** Use a link from the email → signed in. */
export async function redeemBrokerLink(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "That link isn't valid." };
  const db = serviceDb();
  const { data: row } = await db.from("loan_broker_codes").select("id, broker_id, organisation_id, expires_at, used_at").eq("hash", sha(token)).maybeSingle();
  if (!row) return { ok: false, error: "That link isn't valid." };
  if (row.used_at) return { ok: false, error: "That link has already been used — enter your email for a new one." };
  if (Date.parse(row.expires_at as string) < Date.now()) return { ok: false, error: "That link has expired — enter your email for a new one." };
  const { data: b } = await db.from("loan_brokers").select("id, active").eq("id", row.broker_id).maybeSingle();
  if (!b?.active) return { ok: false, error: "That link isn't valid." };
  const { data: claimed } = await db.from("loan_broker_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null).select("id");
  if (!claimed?.length) return { ok: false, error: "That link has already been used — enter your email for a new one." };
  const session = randomBytes(32).toString("hex");
  await db.from("loan_broker_sessions").insert({ organisation_id: row.organisation_id, broker_id: row.broker_id, token_hash: sha(session), expires_at: new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString() });
  await db.from("loan_brokers").update({ last_seen_at: new Date().toISOString() }).eq("id", row.broker_id);
  (await cookies()).set(COOKIE, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/broker", maxAge: SESSION_DAYS * 86400 });
  return { ok: true };
}

/** The signed-in broker, or null. */
export async function currentBroker(): Promise<Broker | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const db = serviceDb();
  const { data: s } = await db.from("loan_broker_sessions").select("id, broker_id, expires_at, last_seen_at").eq("token_hash", sha(token)).maybeSingle();
  if (!s || Date.parse(s.expires_at as string) < Date.now()) return null;
  const { data: b } = await db.from("loan_brokers").select(`${BROKER_COLS}, active`).eq("id", s.broker_id).maybeSingle();
  if (!b?.active) return null;
  if (Date.now() - Date.parse(s.last_seen_at as string) > 30 * 60e3) {
    const now = new Date().toISOString();
    await db.from("loan_broker_sessions").update({ last_seen_at: now }).eq("id", s.id);
    await db.from("loan_brokers").update({ last_seen_at: now }).eq("id", b.id);
  }
  return b as Broker;
}

export async function brokerSignOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) await serviceDb().from("loan_broker_sessions").delete().eq("token_hash", sha(token));
  jar.set(COOKIE, "", { path: "/broker", maxAge: 0 });
}

/**
 * Who may open a loan file on /broker: a broker it's shared with, or — for "View as broker" — a signed-in member of
 * the business's own team. Returns null for everyone else (the page then says "not found", giving nothing away).
 */
export async function brokerAccess(fileId: string): Promise<{ kind: "broker"; broker: Broker } | { kind: "preview"; name: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const db = serviceDb();
  const b = await currentBroker();
  if (b) {
    const { data } = await db.from("loan_file_brokers").select("file_id").eq("file_id", fileId).eq("broker_id", b.id).maybeSingle();
    if (data) return { kind: "broker", broker: b };
  }
  // the business's own team: their normal EventureOS sign-in, and staff of the file's business
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data: f } = await supabase.from("loan_files").select("id").eq("id", fileId).maybeSingle(); // RLS: their own business only
  if (!f) return null;
  const { data: me } = await supabase.from("users").select("full_name").eq("id", u.user.id).maybeSingle();
  return { kind: "preview", name: (me?.full_name as string | undefined) ?? u.user.email ?? "You" };
}
