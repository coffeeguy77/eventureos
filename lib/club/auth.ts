import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandOf } from "@/lib/bookings/server";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { loadTwilio, sendSms, smsNumber } from "@/lib/sms/twilio";
import { clubCodeEmail, clubWelcomeEmail } from "./emails";
import { clubUrl, offersText, PERSON_COLS, readClubSettings, type ClubCtx, type ClubPerson } from "./server";

/**
 * Cart Club sign-in: a 6-digit code by SMS or email (no passwords, no EventureOS login), or the one-time button in a
 * welcome message. Signing in stores a random token in an http-only cookie for that club. Only hashes are stored.
 */
const CODE_MINUTES = 10;
const LINK_DAYS = 14;
const SESSION_DAYS = 90;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const cookieName = (accountId: string) => `eos_club_${accountId.slice(0, 8)}`;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits = (s: string) => s.replace(/\D/g, "");

/** Same phone number? (0412 345 678 vs +61 412 345 678) */
export const samePhone = (a: string | null, b: string) => !!a && smsNumber(a) !== null && smsNumber(a) === smsNumber(b);

async function findPerson(c: ClubCtx, who: string): Promise<ClubPerson | null> {
  const { data } = await c.db.from("cart_club_people").select(PERSON_COLS).eq("account_id", c.account.id).eq("active", true).limit(200);
  const people = (data ?? []) as ClubPerson[];
  const w = who.trim().toLowerCase();
  if (EMAIL.test(w)) return people.find((p) => p.email?.toLowerCase() === w) ?? null;
  if (digits(w).length >= 8) return people.find((p) => samePhone(p.phone, w)) ?? null;
  return null;
}

export type CodeResult = { ok: true; ticket: string; to: string } | { ok: false; error: string };

/** Send a sign-in code. The ticket is shown back with the code; an unknown person gets a dummy ticket (no hint who's listed). */
export async function requestCode(c: ClubCtx, who: string): Promise<CodeResult> {
  const w = who.trim();
  const isEmail = EMAIL.test(w.toLowerCase());
  if (!isEmail && !smsNumber(w)) return { ok: false, error: "Enter your email address or mobile number." };
  const p = await findPerson(c, w);
  const masked = isEmail ? w.toLowerCase() : `your mobile ending ${digits(w).slice(-3)}`;
  if (!p) return { ok: true, ticket: randomBytes(16).toString("hex"), to: masked };
  const { count } = await c.db.from("cart_club_codes").select("id", { count: "exact", head: true }).eq("person_id", p.id).eq("kind", "code").gt("created_at", new Date(Date.now() - 15 * 60e3).toISOString());
  if ((count ?? 0) >= 4) return { ok: false, error: "We've sent a few codes already — check your messages, or try again in 15 minutes." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { data: row, error } = await c.db.from("cart_club_codes").insert({
    organisation_id: c.org.id, person_id: p.id, kind: "code", hash: sha(`${p.id}:${code}`), channel: isEmail ? "email" : "sms", expires_at: new Date(Date.now() + CODE_MINUTES * 60e3).toISOString(),
  }).select("id").single();
  if (error) return { ok: false, error: "Sign-in isn't ready yet — please try again soon." };
  const club = readClubSettings(c.org.rawSettings).name;
  try {
    if (isEmail) {
      if (!emailConfigured()) return { ok: false, error: "Email isn't set up — try your mobile number." };
      const m = clubCodeEmail(brandOf(c.org), { firstName: p.name.split(/\s+/)[0] || "there", club, code, minutes: CODE_MINUTES });
      await sendEmail({ to: p.email!, ...m, fromName: c.org.name, orgId: c.org.id });
    } else {
      const tw = await loadTwilio(c.db, c.org.id);
      if (!tw) return { ok: false, error: "Text messages aren't set up — use your email address instead." };
      await sendSms(tw, smsNumber(w)!, `${code} is your ${club} code for ${c.org.name}. It expires in ${CODE_MINUTES} minutes.`);
    }
  } catch { return { ok: false, error: "We couldn't send the code just now — please try again." }; }
  return { ok: true, ticket: row.id as string, to: masked };
}

/** Check a code; on success the browser is signed in. */
export async function verifyCode(c: ClubCtx, ticket: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = { ok: false as const, error: "That code isn't right — check it, or ask for a new one." };
  if (!/^[0-9a-f-]{32,36}$/i.test(ticket) || !/^\d{6}$/.test(code.trim())) return bad;
  const { data: row } = await c.db.from("cart_club_codes").select("id, person_id, hash, attempts, expires_at, used_at, kind").eq("id", ticket).eq("organisation_id", c.org.id).maybeSingle().then((r) => r, () => ({ data: null }));
  if (!row || row.kind !== "code" || row.used_at) return bad;
  if (Date.parse(row.expires_at as string) < Date.now()) return { ok: false, error: "That code has expired — ask for a new one." };
  if (Number(row.attempts) >= 5) return { ok: false, error: "Too many tries — ask for a new code." };
  const { data: person } = await c.db.from("cart_club_people").select("id, account_id, active").eq("id", row.person_id).maybeSingle();
  if (!person || person.account_id !== c.account.id || !person.active) return bad;
  const want = Buffer.from(row.hash as string), got = Buffer.from(sha(`${row.person_id}:${code.trim()}`));
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    await c.db.from("cart_club_codes").update({ attempts: Number(row.attempts) + 1 }).eq("id", row.id);
    return bad;
  }
  const { data: claimed } = await c.db.from("cart_club_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null).select("id");
  if (!claimed?.length) return bad;
  await startSession(c, row.person_id as string);
  return { ok: true };
}

/** Use the one-time button in a welcome message. */
export async function redeemWelcomeLink(c: ClubCtx, token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "That link isn't valid." };
  const { data: row } = await c.db.from("cart_club_codes").select("id, person_id, expires_at, used_at").eq("kind", "link").eq("hash", sha(token)).eq("organisation_id", c.org.id).maybeSingle();
  if (!row) return { ok: false, error: "That link isn't valid." };
  if (row.used_at) return { ok: false, error: "That link has been used — sign in with your email or mobile instead." };
  if (Date.parse(row.expires_at as string) < Date.now()) return { ok: false, error: "That link has expired — sign in with your email or mobile instead." };
  const { data: person } = await c.db.from("cart_club_people").select("account_id, active").eq("id", row.person_id).maybeSingle();
  if (!person || person.account_id !== c.account.id || !person.active) return { ok: false, error: "That link isn't valid." };
  const { data: claimed } = await c.db.from("cart_club_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null).select("id");
  if (!claimed?.length) return { ok: false, error: "That link has been used — sign in with your email or mobile instead." };
  await startSession(c, row.person_id as string);
  return { ok: true };
}

async function startSession(c: ClubCtx, personId: string) {
  const token = randomBytes(32).toString("hex");
  await c.db.from("cart_club_sessions").insert({ organisation_id: c.org.id, person_id: personId, token_hash: sha(token), expires_at: new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString() });
  await c.db.from("cart_club_people").update({ last_seen_at: new Date().toISOString() }).eq("id", personId);
  (await cookies()).set(cookieName(c.account.id), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}

/* ------------------------------------------------------------------ staff view (from the office) */

const staffCookie = (accountId: string) => `eos_club_staff_${accountId.slice(0, 8)}`;
const staffSecret = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CRON_SECRET ?? "eventureos-club";
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (accountId: string, body: string) => createHmac("sha256", staffSecret()).update(`${accountId}.${body}`).digest("base64url");

/**
 * A manager opens a client's page from the office — as themselves, or on behalf of one of the client's people
 * (e.g. booking what someone asked for on the phone). A signed, short-lived cookie; no code needed.
 */
export async function startStaffView(accountId: string, staff: { userId: string; name: string }, personId: string | null, hours = 8) {
  const body = b64(JSON.stringify({ u: staff.userId, n: staff.name.slice(0, 80), p: personId, e: Date.now() + hours * 3600e3 }));
  (await cookies()).set(staffCookie(accountId), `${body}.${sign(accountId, body)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: hours * 3600 });
}

async function staffView(c: ClubCtx): Promise<{ name: string; personId: string | null } | null> {
  const raw = (await cookies()).get(staffCookie(c.account.id))?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(c.account.id, body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const o = JSON.parse(Buffer.from(body, "base64url").toString()) as { n?: string; p?: string | null; e?: number };
    if (!o.e || o.e < Date.now() || typeof o.n !== "string") return null;
    return { name: o.n, personId: typeof o.p === "string" ? o.p : null };
  } catch { return null; }
}

/** Who's using the club page: one of the client's people, or office staff (as themselves or for a person). */
export interface ClubViewer { id: string | null; name: string; staff: string | null; actingFor: string | null }

export async function currentViewer(c: ClubCtx): Promise<ClubViewer | null> {
  const sv = await staffView(c);
  if (sv) {
    const first = sv.name.split(/\s+/)[0] || sv.name;
    if (sv.personId) {
      const { data: p } = await c.db.from("cart_club_people").select(PERSON_COLS).eq("id", sv.personId).eq("account_id", c.account.id).maybeSingle();
      if (p) return { id: p.id as string, name: `${p.name as string} (entered by ${first})`, staff: sv.name, actingFor: p.name as string };
    }
    return { id: null, name: `${sv.name} (${c.org.name})`, staff: sv.name, actingFor: null };
  }
  const p = await currentPerson(c);
  return p ? { id: p.id, name: p.name, staff: null, actingFor: null } : null;
}

/** The signed-in person at this club, or null. */
export async function currentPerson(c: ClubCtx): Promise<ClubPerson | null> {
  const token = (await cookies()).get(cookieName(c.account.id))?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data: s } = await c.db.from("cart_club_sessions").select("id, person_id, expires_at, last_seen_at").eq("token_hash", sha(token)).eq("organisation_id", c.org.id).maybeSingle();
  if (!s || Date.parse(s.expires_at as string) < Date.now()) return null;
  const { data: p } = await c.db.from("cart_club_people").select(PERSON_COLS).eq("id", s.person_id).maybeSingle();
  if (!p || p.account_id !== c.account.id || !p.active) return null;
  if (Date.now() - Date.parse(s.last_seen_at as string) > 3600e3) {
    await c.db.from("cart_club_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
    await c.db.from("cart_club_people").update({ last_seen_at: new Date().toISOString() }).eq("id", p.id);
  }
  return p as ClubPerson;
}

export async function signOut(c: ClubCtx) {
  const jar = await cookies();
  const token = jar.get(cookieName(c.account.id))?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) await c.db.from("cart_club_sessions").delete().eq("token_hash", sha(token));
  jar.set(cookieName(c.account.id), "", { path: "/", maxAge: 0 });
  jar.set(staffCookie(c.account.id), "", { path: "/", maxAge: 0 });
}

/* ------------------------------------------------------------------ welcome (sent from the office) */

const billingText = (c: Pick<ClubCtx, "account">) => c.account.billing === "monthly"
  ? `One invoice at the end of each month, due ${c.account.due_days} days later.`
  : c.account.due_rule === "before_event" ? `An invoice when you book, due ${c.account.due_days} days before the event.` : `An invoice when you book, due ${c.account.due_days} days later.`;

/** Welcome a person by email and/or SMS, with a one-time sign-in button. */
export async function sendWelcome(db: SupabaseClient, c: ClubCtx, personId: string, via: { email: boolean; sms: boolean }): Promise<{ sent: string[]; errors: string[] }> {
  const out = { sent: [] as string[], errors: [] as string[] };
  const { data: p } = await db.from("cart_club_people").select(PERSON_COLS).eq("id", personId).eq("account_id", c.account.id).maybeSingle();
  if (!p) return { sent: [], errors: ["That person isn't on this club any more."] };
  const person = p as ClubPerson;
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("cart_club_codes").insert({ organisation_id: c.org.id, person_id: person.id, kind: "link", hash: sha(token), channel: via.email ? "email" : "sms", expires_at: new Date(Date.now() + LINK_DAYS * 86400e3).toISOString() });
  if (error) return { sent: [], errors: [error.message] };
  const s = readClubSettings(c.org.rawSettings);
  const page = clubUrl(c.org, c.account.slug);
  const link = clubUrl(c.org, c.account.slug, `/welcome?t=${token}`);
  const first = person.name.split(/\s+/)[0] || "there";
  if (via.email) {
    if (!person.email) out.errors.push(`${person.name}: no email address`);
    else if (!emailConfigured()) out.errors.push("Email isn't set up.");
    else try {
      const m = clubWelcomeEmail(brandOf(c.org), { firstName: first, club: s.name, account: c.account.name, url: link, offers: offersText(c.account.offers), billing: billingText(c) });
      await sendEmail({ to: person.email, ...m, replyTo: c.org.settings.reply_to ?? c.org.contact_email ?? undefined, fromName: c.org.name, orgId: c.org.id });
      out.sent.push(person.email);
    } catch (e) { out.errors.push(`${person.email}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (via.sms) {
    const to = person.phone ? smsNumber(person.phone) : null;
    if (!to) out.errors.push(`${person.name}: no mobile number`);
    else try {
      const tw = await loadTwilio(db, c.org.id);
      if (!tw) throw new Error("Text messages aren't set up (Settings → Integrations → Twilio).");
      await sendSms(tw, to, `Hi ${first}, ${c.org.name} has set up ${s.name} for ${c.account.name} — book ${offersText(c.account.offers)} any time: ${link} (next time sign in at ${page.replace(/^https?:\/\//, "")} with this mobile)`);
      out.sent.push(person.phone!);
    } catch (e) { out.errors.push(`${person.name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (out.sent.length) await db.from("cart_club_people").update({ welcomed_at: new Date().toISOString() }).eq("id", person.id);
  return out;
}
