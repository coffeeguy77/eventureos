import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/integrations/registry";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { shell } from "@/lib/bookings/emails";
import { readEvents, HIRE_KINDS, type HireKind } from "@/lib/events/core";
import { CART_SECTIONS, dueReminder, fill, fomoLine, readReminders, type CartRow, type CartSection } from "./core";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Remember an unfinished checkout (only used for a reminder if the business turns reminders on). Never throws. */
export async function rememberCart(db: SupabaseClient, orgId: string, section: CartSection, c: { email: string | null | undefined; name?: string | null; summary?: string | null; total?: number | null; resume?: string | null; detail?: Record<string, unknown> }) {
  try {
    const email = (c.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return;
    const row = { name: c.name?.slice(0, 160) || null, summary: c.summary?.slice(0, 300) || null, total: c.total ?? null, resume_path: c.resume?.startsWith("/") ? c.resume.slice(0, 500) : null, detail: c.detail ?? {} };
    const { data: existing } = await db.from("site_carts").select("id, status").eq("organisation_id", orgId).eq("section", section).eq("email", email).maybeSingle();
    if (existing?.status === "stopped") return;
    if (existing) await db.from("site_carts").update({ ...row, status: "open", ...(existing.status === "done" ? { reminders_sent: 0, last_reminded_at: null } : {}) }).eq("id", existing.id);
    else await db.from("site_carts").insert({ organisation_id: orgId, section, email, ...row });
  } catch (e) { console.error("[carts] remember", e); }
}

/** They finished (paid / sent the request): no reminders. Never throws. */
export async function finishCart(db: SupabaseClient, orgId: string, section: CartSection, email: string | null | undefined) {
  try {
    const e = (email ?? "").trim().toLowerCase();
    if (!e) return;
    await db.from("site_carts").update({ status: "done" }).eq("organisation_id", orgId).eq("section", section).eq("email", e).eq("status", "open");
  } catch (e) { console.error("[carts] finish", e); }
}

/** Daily: send any reminders that are due, for businesses that switched them on. */
export async function runReminders(db: SupabaseClient, now = new Date()) {
  const out = { sent: 0, skipped: 0, orgs: 0 };
  if (!emailConfigured()) return out;
  const { data: orgs } = await db.from("organisations").select("id, settings").eq("status", "active");
  for (const o of (orgs ?? []) as { id: string; settings: Record<string, unknown> | null }[]) {
    const r = readReminders(o.settings);
    const on = CART_SECTIONS.filter((k) => r.enabled && r.sections[k].on);
    if (!on.length) continue;
    out.orgs++;
    const { data: carts } = await db.from("site_carts").select("id, section, email, name, summary, reminders_sent, last_reminded_at, updated_at, detail, resume_path, stop_token")
      .eq("organisation_id", o.id).eq("status", "open").in("section", on).lt("reminders_sent", 2).lt("updated_at", new Date(now.getTime() - 3600e3).toISOString()).limit(200);
    if (!carts?.length) continue;
    const { orgById } = await import("@/lib/bookings/server");
    const org = await orgById(db, o.id);
    const ev = readEvents(o.settings);
    for (const c of carts as (CartRow & { resume_path: string | null; stop_token: string })[]) {
      // Older than a fortnight: let it go
      if (now.getTime() - Date.parse(c.updated_at) > 14 * 864e5) { await db.from("site_carts").update({ status: "stopped" }).eq("id", c.id); continue; }
      const sec = r.sections[c.section];
      const which = dueReminder(c, sec, now);
      if (!which) { out.skipped++; continue; }
      let fomo = "";
      const date = typeof c.detail?.date === "string" ? c.detail.date : "";
      if (c.section === "events" && HIRE_KINDS.includes(c.detail?.kind as HireKind)) {
        const kind = c.detail.kind as HireKind;
        if (date && date < new Date(now.getTime()).toISOString().slice(0, 10)) { await db.from("site_carts").update({ status: "stopped" }).eq("id", c.id); continue; }
        let free = ev.fleet[kind];
        if (date) {
          const { data: b } = await db.rpc("fleet_booked", { p_org: o.id, p_from: date, p_to: date });
          free = Math.max(0, ev.fleet[kind] - ((b ?? []) as { kind: string; units: number }[]).filter((x) => x.kind === kind).reduce((a, x) => a + Number(x.units), 0));
        }
        fomo = fomoLine(kind, date, free, ev.fleet[kind], ev.labels[kind]);
      }
      const w = which === 1 ? sec.first : sec.last;
      const vars = { first: (c.name ?? "").trim().split(/\s+/)[0] || "there", summary: c.summary ?? "your order", date: date ? new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z")) : "", fomo, business: org.name };
      const stop = `${appBaseUrl()}/api/public/cart-stop?t=${c.stop_token}`;
      const m = shell({ businessName: org.name, logoUrl: org.logo_url, brand: org.brand_colour, contactEmail: org.settings.reply_to ?? org.contact_email, contactPhone: org.contact_phone }, {
        title: fill(w.subject, vars), heading: fill(w.subject, vars), intro: [fill(w.body, vars)],
        buttons: c.resume_path ? [{ label: w.button, url: `${appBaseUrl()}${c.resume_path}` }] : [],
        after: [`Don't want these reminders? Stop them here: ${stop}`],
      });
      try {
        await sendEmail({ to: c.email, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name, headers: { "List-Unsubscribe": `<${stop}>` } });
        await db.from("site_carts").update({ reminders_sent: c.reminders_sent + 1, last_reminded_at: now.toISOString() }).eq("id", c.id);
        out.sent++;
      } catch (e) { console.error("[carts] send", e); }
    }
  }
  return out;
}
