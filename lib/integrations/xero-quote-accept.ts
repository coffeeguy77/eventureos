/**
 * Customers can accept a quote inside Xero's online quote page. That skips EventureOS's booking approval,
 * so we watch for Xero's "… has accepted quote QU-0471 for 880.00 AUD" email and raise the alarm straight away.
 * (Real case: IBM accepted at 9:59 pm for an event two mornings later; nobody knew until they asked "is this confirmed?".)
 */

export interface XeroAcceptance { customer: string; quoteNumber: string; amount: number; currency: string }

/** Parse Xero's quote-acceptance notification. Only trusts mail from Xero's messaging service. */
export function parseXeroAcceptance(fromEmail: string, subject: string | null, body?: string | null): XeroAcceptance | null {
  if (!/@post\.xero\.com$/i.test(fromEmail.trim())) return null;
  const re = /^\s*(.+?) has accepted quote ([A-Z]{1,6}-?\d+) for ([\d,]+(?:\.\d{1,2})?) ([A-Z]{3})\b/;
  const m = re.exec(subject ?? "") ?? re.exec((body ?? "").split("\n").find((l) => / has accepted quote /.test(l)) ?? "");
  if (!m) return null;
  return { customer: m[1].trim(), quoteNumber: m[2], amount: Number(m[3].replace(/,/g, "")), currency: m[4] };
}

// ---------------------------------------------------------------- server side (imported lazily from gmail-sync)
import type { SyncContext } from "./runtime";

/** Notify owners/admins (in-app + email) about a quote accepted in Xero. Only for recent mail, once per quote. */
export async function alertXeroAcceptance(ctx: SyncContext, sentAt: string, xa: XeroAcceptance): Promise<string> {
  const db = ctx.db;
  const ageH = (Date.now() - new Date(sentAt).getTime()) / 36e5;
  if (!(ageH <= 72)) return "older than 3 days — not alerted";
  const { data: dupe } = await db.from("notifications").select("id").eq("organisation_id", ctx.org.id)
    .eq("type", "xero.quote_accepted").ilike("title", `%${xa.quoteNumber}%`).limit(1);
  if (dupe?.length) return "already alerted";

  const { data: cust } = await db.from("customers").select("id, name").eq("organisation_id", ctx.org.id).ilike("name", xa.customer.replace(/[\\%_]/g, (c) => "\\" + c)).limit(1);
  const customer = (cust?.[0] as { id: string; name: string } | undefined) ?? null;
  const tz = ctx.org.timezone;
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  let upcoming: string[] = [];
  if (customer) {
    const { data: cal } = await db.from("calendar_events").select("title, starts_at").eq("organisation_id", ctx.org.id).eq("customer_id", customer.id)
      .gte("starts_at", new Date().toISOString()).order("starts_at").limit(3);
    upcoming = ((cal ?? []) as { title: string; starts_at: string }[]).map((c) => `${c.title} (${fmt(c.starts_at)})`);
  }
  const amount = new Intl.NumberFormat("en-AU", { style: "currency", currency: xa.currency }).format(xa.amount);
  const title = `${xa.customer} accepted ${xa.quoteNumber} in Xero`;
  const body = `${amount}, accepted ${fmt(sentAt)}. Not confirmed in EventureOS — check the date and confirm with them.`;
  const link = customer ? `/clients/${customer.id}` : "/clients";

  const { data: admins } = await db.from("organisation_users").select("user_id, user:users!organisation_users_user_id_fkey(email)")
    .eq("organisation_id", ctx.org.id).in("role", ["owner", "admin"]).eq("status", "active");
  const rows = (admins ?? []) as unknown as { user_id: string; user: { email: string | null } | null }[];
  await db.from("notifications").insert(
    (rows.length ? rows : [{ user_id: null, user: null }]).map((r) => ({
      organisation_id: ctx.org.id, user_id: r.user_id, type: "xero.quote_accepted", title, body, link, entity_type: customer ? "customer" : null, entity_id: customer?.id ?? null,
    })));

  let emailed = 0;
  try {
    const { emailConfigured, sendEmail } = await import("@/lib/email/send");
    if (emailConfigured()) {
      const { xeroQuoteAcceptedEmail } = await import("@/lib/email/templates");
      const { appBaseUrl } = await import("./registry");
      const m = xeroQuoteAcceptedEmail({ businessName: ctx.org.name, customer: xa.customer, quoteNumber: xa.quoteNumber, amount, acceptedAt: fmt(sentAt), upcoming, url: `${appBaseUrl()}${link}` });
      for (const r of rows) if (r.user?.email) { await sendEmail({ to: r.user.email, ...m }).then(() => emailed++).catch(() => undefined); }
    }
  } catch { /* the in-app notification is already there */ }
  return `team alerted${emailed ? ` (${emailed} email${emailed === 1 ? "" : "s"})` : ""}`;
}
