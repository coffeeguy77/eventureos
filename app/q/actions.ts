"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/integrations/runtime";
import { createClient } from "@/lib/supabase/server";

const TOKEN = /^[0-9a-f]{64}$/;

export async function requestInfo(h?: Headers) {
  h = h ?? (await headers());
  const dec = (v: string | null) => { if (!v) return null; try { return decodeURIComponent(v).slice(0, 100); } catch { return v.slice(0, 100); } };
  return {
    ip: (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64) || null,
    ua: (h.get("user-agent") ?? "").slice(0, 400) || null,
    // Vercel adds these from the visitor's IP address — approximate, and absent when running locally
    city: dec(h.get("x-vercel-ip-city")),
    region: dec(h.get("x-vercel-ip-country-region")),
    country: dec(h.get("x-vercel-ip-country"))?.slice(0, 8) ?? null,
  };
}

/** Called by the page once it has loaded in a real browser — link scanners that only fetch the page don't count. */
export async function recordQuoteLinkView(token: string): Promise<void> {
  if (!TOKEN.test(token)) return;
  const db = createServiceClient();
  // Someone from the business opening the link (e.g. from Gmail's Sent folder) isn't the customer viewing it
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (user) {
      const { data: r } = await db.from("email_send_recipients").select("organisation_id").eq("token", token).maybeSingle();
      if (r) {
        const { data: m } = await db.from("organisation_users").select("id").eq("organisation_id", r.organisation_id)
          .eq("user_id", user.id).neq("role", "customer").limit(1);
        if (m?.length) return;
      }
    }
  } catch { /* not signed in */ }
  const i = await requestInfo();
  const { error } = await db.rpc("quote_link_viewed", {
    p_token: token, p_ip: i.ip, p_user_agent: i.ua, p_city: i.city, p_region: i.region, p_country: i.country,
  });
  if (error) console.error("quote_link_viewed failed", error.message);
}

export type LinkRespondState = { ok?: boolean; decision?: "accepted" | "declined"; error?: string; late?: boolean; payUrl?: string | null; phone?: string | null } | undefined;

export async function respondViaQuoteLink(_prev: LinkRespondState, form: FormData): Promise<LinkRespondState> {
  try {
    const token = String(form.get("token") ?? "");
    if (!TOKEN.test(token)) return { error: "This link isn't valid." };
    const decision = String(form.get("decision") ?? "");
    if (decision !== "accepted" && decision !== "declined") return { error: "Choose to accept or decline." };
    const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
    const reason = String(form.get("reason") ?? "").trim();
    if (decision === "accepted") {
      if (name.length < 2 || name.length > 120) return { error: "Type your full name to accept the quote." };
      if (form.get("agree") !== "on") return { error: "Tick the box to confirm you accept the quote and its terms." };
    }
    if (reason.length > 1000) return { error: "Please keep the reason under 1,000 characters." };
    const i = await requestInfo();
    const db = createServiceClient();
    const { data: eventId, error } = await db.rpc("quote_link_respond", {
      p_token: token, p_decision: decision, p_name: decision === "accepted" ? name : name || null,
      p_reason: decision === "declined" ? reason || null : null, p_ip: i.ip, p_user_agent: i.ua,
    });
    if (error) return { error: error.message };
    if (decision === "accepted" && eventId) {
      // Where the event is, if they confirmed it — saved before the calendar entry goes out so it carries the location
      const loc = readLocation(form.get("location"));
      if (loc) await saveEventLocation(db, eventId as string, loc).catch(() => undefined);
      const { alertBookingApproval } = await import("@/lib/email/booking-approval");
      await alertBookingApproval(db, eventId as string);
      // The calendar entry goes to Google now, not on the next sync
      const { afterQuoteAccepted } = await import("@/lib/quotes/after-accept");
      const a = await afterQuoteAccepted(db, eventId as string, { byCustomer: true });
      revalidatePath(`/q/${token}`);
      return { ok: true, decision, late: a.late, payUrl: a.payUrl, phone: a.phone };
    }
    revalidatePath(`/q/${token}`);
    return { ok: true, decision };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}

interface ConfirmedLocation { address: string | null; lat: number | null; lng: number | null; pinned: boolean; note: string | null }

/** The location the customer gave with their acceptance (address search or a dropped pin), checked. */
function readLocation(raw: FormDataEntryValue | null): ConfirmedLocation | null {
  if (typeof raw !== "string" || !raw) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const txt = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) || null : null);
  const num = (v: unknown, lim: number) => { const x = typeof v === "number" ? v : NaN; return Number.isFinite(x) && Math.abs(x) <= lim ? Math.round(x * 1e6) / 1e6 : null; };
  let lat = num(o.lat, 90), lng = num(o.lng, 180);
  if (lat == null || lng == null) lat = lng = null;
  const address = txt(o.address, 300), note = txt(o.note, 300);
  if (!address && lat == null && !note) return null;
  return { address, lat, lng, pinned: !!o.pinned && lat != null, note };
}

/** Saves it on the job (falls back to the address alone before the 0124 database update). */
async function saveEventLocation(db: ReturnType<typeof createServiceClient>, eventId: string, l: ConfirmedLocation) {
  const address = l.address ?? (l.lat != null ? `Pin ${l.lat}, ${l.lng}` : null);
  const full: Record<string, unknown> = { ...(address ? { address } : {}), location_lat: l.lat, location_lng: l.lng, location_pinned: l.pinned, location_note: l.note };
  const { error } = await db.from("events").update(full).eq("id", eventId);
  if (error && /location_/.test(error.message)) {
    const text = [address, l.lat != null && l.pinned ? `(${l.lat}, ${l.lng})` : null, l.note].filter(Boolean).join(" — ");
    if (text) await db.from("events").update({ address: text.slice(0, 500) }).eq("id", eventId);
  }
}

export type ChangeResult = { ok: true; version: number; total: number } | { ok: false; error: string };

/** The customer changed their quote on the link (catering / drinks): saved as the next version, ready to accept. */
export async function customerChangeQuote(token: string, change: unknown): Promise<ChangeResult> {
  try {
    if (!/^[0-9a-f]{64}$/.test(String(token))) return { ok: false, error: "This link isn't valid." };
    const db = createServiceClient();
    const { data: r } = await db.from("email_send_recipients").select("name, email").eq("token", token).maybeSingle();
    const who = (r?.name as string | null)?.trim() || (r?.email as string | null) || "The customer";
    const { applyCustomerChange } = await import("@/lib/quotes/customer-edit-server");
    const res = await applyCustomerChange(db, token, change, who);
    // Let the business know by email too (the bell notification is already there)
    try {
      const { emailConfigured, sendEmail } = await import("@/lib/email/send");
      const { appBaseUrl } = await import("@/lib/integrations/registry");
      const { data: q } = await db.from("email_send_recipients").select("quote:quotes(id, number, organisation:organisations(name, contact_email))").eq("token", token).maybeSingle();
      const quote = q?.quote as unknown as { id: string; number: number; organisation: { name: string; contact_email: string | null } | null } | null;
      const to = quote?.organisation?.contact_email;
      if (to && emailConfigured()) {
        const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
        const url = `${appBaseUrl()}/quotes/${quote!.id}`;
        const total = res.total.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
        await sendEmail({ to, subject: `${who} changed Q-${quote!.number}`,
          text: `${who} changed Quote Q-${quote!.number} on their quote link:\n${res.what}\n\nIt's now version ${res.version} (${total}), waiting for them to accept.\n${url}`,
          html: `<p><b>${esc(who)}</b> changed Quote Q-${quote!.number} on their quote link:</p><p>${esc(res.what)}</p><p>It's now version ${res.version} (${total}), waiting for them to accept.</p><p><a href="${url}">Open the quote</a></p>` }).catch(() => undefined);
      }
    } catch { /* the notification is enough */ }
    revalidatePath(`/q/${token}`);
    return { ok: true, version: res.version, total: res.total };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}
