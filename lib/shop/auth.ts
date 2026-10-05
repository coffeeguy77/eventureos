import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/integrations/runtime";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { brandOf } from "@/lib/bookings/server";
import { cleanEmail } from "@/lib/bookings/core";
import { currentStudent } from "@/lib/bookings/student-auth";
import { shopEmail } from "./emails";
import { CUSTOMER_COLS, ensureCustomer, shopUrl, type ShopCustomer, type ShopOrg } from "./server";

/**
 * Shopper sign-in: a one-time link by email (no passwords). Students already signed in to their barista account
 * are signed in to the shop too (same email). Only hashes of tokens are stored.
 */
const LINK_MINUTES = 30;
const SESSION_DAYS = 90;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const cookieName = (orgId: string) => `eos_shop_${orgId.slice(0, 8)}`;

export async function requestShopLogin(org: ShopOrg, rawEmail: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, error: "Enter your email address." };
  const db = createServiceClient();
  const c = await ensureCustomer(db, org.id, { email });
  const { count } = await db.from("shop_logins").select("id", { count: "exact", head: true }).eq("customer_id", c.id).gt("created_at", new Date(Date.now() - 15 * 60e3).toISOString());
  if ((count ?? 0) >= 3) return { ok: false, error: "We've sent a few links already — check your inbox, or try again in 15 minutes." };
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("shop_logins").insert({ customer_id: c.id, token_hash: sha(token), expires_at: new Date(Date.now() + LINK_MINUTES * 60e3).toISOString() });
  if (error) return { ok: false, error: error.message };
  if (!emailConfigured()) return { ok: false, error: "Email isn't set up yet — please contact us." };
  const m = shopEmail(brandOf(org), {
    heading: "Your sign-in link",
    intro: [`Tap the button to see your orders and manage your coffee subscription with ${org.name}. No password needed.`],
    buttons: [{ label: "Sign in", url: shopUrl(org, `/account/verify?t=${token}`) }],
    after: [`The link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`],
  });
  try { await sendEmail({ to: email, subject: `Your sign-in link — ${org.name}`, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name }); }
  catch { return { ok: false, error: "We couldn't send the email just now — please try again." }; }
  return { ok: true, message: `Check your inbox — we've emailed a sign-in link to ${email} (have a look in junk too).` };
}

export async function consumeShopLogin(org: ShopOrg, token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "That sign-in link isn't valid." };
  const db = createServiceClient();
  const { data: l } = await db.from("shop_logins").select("id, customer_id, expires_at, used_at, customer:shop_customers(organisation_id)").eq("token_hash", sha(token)).maybeSingle();
  const lo = l as unknown as { id: string; customer_id: string; expires_at: string; used_at: string | null; customer: { organisation_id: string } | null } | null;
  if (!lo || lo.customer?.organisation_id !== org.id) return { ok: false, error: "That sign-in link isn't valid." };
  if (lo.used_at) return { ok: false, error: "That link has already been used — ask for a new one." };
  if (Date.parse(lo.expires_at) < Date.now()) return { ok: false, error: "That link has expired — ask for a new one." };
  const { data: claimed } = await db.from("shop_logins").update({ used_at: new Date().toISOString() }).eq("id", lo.id).is("used_at", null).select("id");
  if (!claimed?.length) return { ok: false, error: "That link has already been used — ask for a new one." };
  await startShopSession(org, lo.customer_id);
  return { ok: true };
}

export async function startShopSession(org: ShopOrg, customerId: string) {
  const session = randomBytes(32).toString("hex");
  await createServiceClient().from("shop_sessions").insert({ customer_id: customerId, token_hash: sha(session), expires_at: new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString() });
  (await cookies()).set(cookieName(org.id), session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}

/** The signed-in shopper, or null. A signed-in student counts (their shop account is made on first visit). */
export async function currentShopCustomer(org: ShopOrg): Promise<ShopCustomer | null> {
  const db = createServiceClient();
  const token = (await cookies()).get(cookieName(org.id))?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const { data: s } = await db.from("shop_sessions").select("id, customer_id, expires_at, last_seen_at").eq("token_hash", sha(token)).maybeSingle();
    if (s && Date.parse(s.expires_at as string) > Date.now()) {
      if (Date.now() - Date.parse(s.last_seen_at as string) > 3600e3) await db.from("shop_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
      const { data: c } = await db.from("shop_customers").select(CUSTOMER_COLS).eq("id", s.customer_id).eq("organisation_id", org.id).maybeSingle();
      if (c) return c as ShopCustomer;
    }
  }
  const st = await currentStudent(org).catch(() => null);
  if (st?.email) {
    try { return await ensureCustomer(db, org.id, { email: st.email, name: st.name, phone: st.phone }); } catch { return null; }
  }
  return null;
}

export async function signOutShop(org: ShopOrg) {
  const jar = await cookies();
  const token = jar.get(cookieName(org.id))?.value;
  if (token && /^[0-9a-f]{64}$/.test(token)) await createServiceClient().from("shop_sessions").delete().eq("token_hash", sha(token));
  jar.set(cookieName(org.id), "", { path: "/", maxAge: 0 });
}
