import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import { AUDIENCE_TAG, render, type Audience } from "./mailout";

/** Mail-outs (server): who gets it, queueing it, and sending a batch. */

const APP = () => (process.env.APP_URL || "https://www.eventureos.com.au").replace(/\/$/, "");
export const unsubscribeUrl = (token: string) => `${APP()}/unsubscribe/${token}`;
const oneClickUrl = (token: string) => `${APP()}/api/public/unsubscribe/${token}`;

/** Everyone in the audience: one row per email address, unsubscribed clients left out, best first name we have. */
export async function audienceList(db: SupabaseClient, orgId: string, audience: Audience) {
  const rows: { id: string; name: string; kind: string; email: string | null; tags: string[] | null; unsubscribed_at: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from("customers").select("id, name, kind, email, tags, unsubscribed_at").eq("organisation_id", orgId).not("email", "is", null).neq("email", "").order("id").range(from, from + 999);
    const tag = AUDIENCE_TAG[audience];
    if (tag) q = q.contains("tags", [tag]);
    const { data, error } = await q;
    if (error) throw new Error(/unsubscribed_at/.test(error.message) ? "Run update 0116 (Mail-outs) first." : error.message);
    rows.push(...((data ?? []) as typeof rows));
    if ((data ?? []).length < 1000) break;
  }
  const { data: contacts } = await db.from("contacts").select("customer_id, first_name, email, is_primary").eq("organisation_id", orgId).limit(5000);
  const byCustomer = new Map<string, { first_name: string; email: string | null; is_primary: boolean }[]>();
  for (const c of (contacts ?? []) as { customer_id: string; first_name: string; email: string | null; is_primary: boolean }[]) {
    byCustomer.set(c.customer_id, [...(byCustomer.get(c.customer_id) ?? []), c]);
  }
  const seen = new Set<string>();
  const out: { customer_id: string; email: string; name: string | null }[] = [];
  for (const r of rows) {
    const email = (r.email ?? "").trim().toLowerCase();
    if (r.unsubscribed_at || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    const cs = byCustomer.get(r.id) ?? [];
    const contact = cs.find((c) => (c.email ?? "").toLowerCase() === email) ?? cs.find((c) => c.is_primary) ?? null;
    const first = contact?.first_name?.trim() || (r.kind === "individual" ? r.name.trim().split(/\s+/)[0] : null);
    out.push({ customer_id: r.id, email, name: first || null });
  }
  return out;
}

export async function senderFor(db: SupabaseClient, orgId: string) {
  const { data } = await db.from("organisations").select("name, contact_email, contact_phone, address, settings").eq("id", orgId).single();
  const support = ((data?.settings as { nerdherd?: { support_email?: string } } | null)?.nerdherd?.support_email) || (data?.contact_email as string | null);
  return { name: (data?.name as string) ?? "", address: (data?.address as string | null) ?? null, phone: (data?.contact_phone as string | null) ?? null, email: support ?? null };
}

/** Send one email (a test, or a queued recipient). */
export async function sendOne(db: SupabaseClient, orgId: string, m: { subject: string; body: string }, to: { email: string; name: string | null; token: string }) {
  const from = await senderFor(db, orgId);
  const unsub = unsubscribeUrl(to.token);
  const e = render(m, { firstName: to.name, unsubscribeUrl: unsub }, from);
  await sendEmail({
    to: to.email, subject: e.subject, html: e.html, text: e.text, replyTo: from.email, fromName: from.name, orgId,
    headers: { "List-Unsubscribe": `<${oneClickUrl(to.token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One batch for every mail-out that's sending (called every 5 minutes). Stops early when time runs short. */
export async function runMailouts(db: SupabaseClient, budgetMs = 100_000) {
  const started = Date.now();
  const log: string[] = [];
  const { data: outs } = await db.from("nh_mailouts").select("id, organisation_id, subject, body, per_run").eq("status", "sending").order("started_at");
  for (const m of (outs ?? []) as { id: string; organisation_id: string; subject: string; body: string; per_run: number }[]) {
    const { data: queue } = await db.from("nh_mailout_sends").select("id, email, name, token, customer_id").eq("mailout_id", m.id).eq("status", "queued").order("created_at").limit(m.per_run);
    let sent = 0, failed = 0, skipped = 0;
    for (const q of (queue ?? []) as { id: string; email: string; name: string | null; token: string; customer_id: string | null }[]) {
      if (Date.now() - started > budgetMs) break;
      // unsubscribed since it was queued
      if (q.customer_id) {
        const { data: c } = await db.from("customers").select("unsubscribed_at").eq("id", q.customer_id).maybeSingle();
        if (c?.unsubscribed_at) { await db.from("nh_mailout_sends").update({ status: "skipped", error: "Unsubscribed" }).eq("id", q.id); skipped++; continue; }
      }
      try {
        await sendOne(db, m.organisation_id, m, q);
        await db.from("nh_mailout_sends").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", q.id);
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // too many requests: leave it queued for the next run
        if (/\(429\)/.test(msg)) { await sleep(2000); continue; }
        await db.from("nh_mailout_sends").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", q.id);
        failed++;
      }
      await sleep(600); // stay well inside Resend's per-second limit
    }
    const [{ count: s }, { count: f }, { count: left }] = await Promise.all([
      db.from("nh_mailout_sends").select("id", { count: "exact", head: true }).eq("mailout_id", m.id).eq("status", "sent"),
      db.from("nh_mailout_sends").select("id", { count: "exact", head: true }).eq("mailout_id", m.id).eq("status", "failed"),
      db.from("nh_mailout_sends").select("id", { count: "exact", head: true }).eq("mailout_id", m.id).eq("status", "queued"),
    ]);
    await db.from("nh_mailouts").update({ sent: s ?? 0, failed: f ?? 0, ...(left === 0 ? { status: "done", finished_at: new Date().toISOString() } : {}) }).eq("id", m.id);
    log.push(`${m.id}: +${sent} sent, ${failed} failed, ${skipped} skipped, ${left ?? "?"} left`);
    if (Date.now() - started > budgetMs) break;
  }
  return log;
}
