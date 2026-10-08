"use server";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/integrations/runtime";
import { HIRE_KINDS, type CateringOrder, type HireKind, type HireRequest } from "@/lib/events/core";
import { rememberCart } from "@/lib/reminders/server";
import type { CartSection } from "@/lib/reminders/core";
import { availability, eventsOrg, monthFree, submitCatering, submitHire, type SubmitResult } from "@/lib/events/server";

const SECTIONS = ["events", "catering", "branding", "drinks", "shop", "classes", "gifts", "giftcards", "cafe", "club", "wholesale"] as const;
type Section = (typeof SECTIONS)[number];
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function ip() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 45) || null;
}

/** Contact form on any page → an enquiry in the office (Enquiries), using the business's own website form key. */
export async function sendEnquiry(slug: string, section: string, f: Record<string, string>): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  if (str(f.website, 5)) return { ok: true, reference: "" }; // honeypot
  const db = createServiceClient();
  const { data: org } = await db.from("organisations").select("public_form_key, name").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!org) return { ok: false, error: "This form isn't available." };
  const name = str(f.name, 160), email = str(f.email, 254);
  if (name.length < 2) return { ok: false, error: "Add your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Add a valid email so we can reply." };
  const sec: Section = (SECTIONS as readonly string[]).includes(section) ? (section as Section) : "events";
  const topic = { events: "Event hire", catering: "Catering", branding: "Branding & cart wrap", drinks: "Drinks menu", shop: "Coffee shop", classes: "Classes", gifts: "Gift certificates", giftcards: "Gift cards", cafe: "Café", club: "Roasting Club", wholesale: "Wholesale coffee" }[sec];
  const payload = {
    name, email, phone: str(f.phone, 40), company: str(f.company, 160), event_type: str(f.event_type, 80) || topic,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(f.event_date ?? "") ? f.event_date : "", guests: str(f.guests, 8), venue: str(f.venue, 200),
    message: str(f.message, 4000), title: `${topic} enquiry — ${str(f.company, 160) || name}`,
  };
  const { data, error } = await db.rpc("capture_website_enquiry", { p_slug: slug, p_key: org.public_form_key, p_payload: payload, p_ip: await ip() });
  if (error) return { ok: false, error: /too many/i.test(error.message) ? "Lots of messages just now — please try again in a few minutes." : "Couldn't send that — please try again or call us." };
  return { ok: true, reference: (data as { reference?: string })?.reference ?? "" };
}

export async function requestHireQuote(slug: string, r: HireRequest): Promise<SubmitResult> {
  try { return await submitHire(slug, sanitiseHire(r)); }
  catch (e) { console.error("[hire] submit", e); return { ok: false, error: "Something went wrong sending your request — please try again." }; }
}

export async function requestCatering(slug: string, o: CateringOrder): Promise<SubmitResult> {
  try { return await submitCatering(slug, sanitiseCatering(o)); }
  catch (e) { console.error("[catering] submit", e); return { ok: false, error: "Something went wrong sending your order — please try again." }; }
}

/** Live availability for the dates in the builder. */
export async function checkDates(slug: string, kind: string, dates: string[], units: number) {
  const eo = await eventsOrg(slug);
  if (!eo || !HIRE_KINDS.includes(kind as HireKind) || !Array.isArray(dates)) return [];
  const leadDays = eo.s.leadDays;
  const list = await availability(eo, kind as HireKind, dates.slice(0, 14).map(String), Math.max(1, Math.min(50, Math.round(Number(units) || 1))));
  return list.map((d) => ({ ...d, tentative: Math.round((Date.parse(d.date) - Date.parse(eo.today)) / 864e5) < leadDays }));
}

/** Free units per day for the calendar (only dates that have bookings are listed). */
export async function monthAvailability(slug: string, kind: string, from: string) {
  const eo = await eventsOrg(slug);
  if (!eo || !HIRE_KINDS.includes(kind as HireKind) || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return {};
  return monthFree(eo, kind as HireKind, from < eo.today ? eo.today : from);
}

/**
 * Remember an unfinished quote / order once the customer has typed their email, so the business can (optionally) send a
 * friendly reminder. Nothing is sent unless reminders are switched on in Settings → Website reminders.
 */
export async function saveCart(slug: string, section: string, c: { email: string; name?: string; summary?: string; total?: number | null; resume?: string; detail?: Record<string, unknown> }) {
  const email = str(c.email, 254).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  if (!["shop", "classes", "gifts", "giftcards", "events", "catering"].includes(section)) return;
  const db = createServiceClient();
  const { data: org } = await db.from("organisations").select("id").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!org) return;
  const resume = str(c.resume, 500);
  const detail = Object.fromEntries(Object.entries(c.detail ?? {}).slice(0, 12).map(([k, v]) => [k.slice(0, 30), typeof v === "string" ? v.slice(0, 120) : typeof v === "number" || typeof v === "boolean" ? v : null]));
  await rememberCart(db, org.id, section as CartSection, { email, name: str(c.name, 160), summary: str(c.summary, 300), total: typeof c.total === "number" && Number.isFinite(c.total) ? Math.round(c.total * 100) / 100 : null, resume, detail });
}

/* ------------------------------------------------------------------ input cleaning (never trust the browser) */

function sanitiseHire(r: HireRequest): HireRequest {
  const n = (v: unknown, lo: number, hi: number, d = 0) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const c = (r?.contact ?? {}) as HireRequest["contact"];
  return {
    kind: HIRE_KINDS.includes(r?.kind) ? r.kind : "cart", units: n(r?.units, 0, 50, 1),
    days: (Array.isArray(r?.days) ? r.days : []).slice(0, 15).map((d) => ({ date: str(d?.date, 10), start: str(d?.start, 5), end: str(d?.end, 5), staff: n(d?.staff, 0, 50, 1), serves: n(d?.serves, 0, 10000, 0) })),
    eventType: str(r?.eventType, 80), guests: r?.guests == null || (r.guests as unknown) === "" ? null : n(r.guests, 0, 100000),
    venue: str(r?.venue, 200), address: str(r?.address, 400), delivery: r?.delivery !== false,
    stickers: n(r?.stickers, 0, 20000), wrap: !!r?.wrap, catering: !!r?.catering, notes: str(r?.notes, 3000),
    contact: { name: str(c.name, 160), email: str(c.email, 254), phone: str(c.phone, 40), company: str(c.company, 160) },
  };
}

function sanitiseCatering(o: CateringOrder): CateringOrder {
  const c = (o?.contact ?? {}) as CateringOrder["contact"];
  return {
    date: str(o?.date, 10), venue: str(o?.venue, 200), address: str(o?.address, 400), notes: str(o?.notes, 3000),
    guests: o?.guests == null ? null : Math.max(0, Math.min(100000, Math.round(Number(o.guests)) || 0)),
    slots: (Array.isArray(o?.slots) ? o.slots : []).slice(0, 3).map((s) => ({
      slot: (["morning", "lunch", "afternoon"].includes(s?.slot) ? s.slot : "morning"), time: str(s?.time, 5),
      items: (Array.isArray(s?.items) ? s.items : []).slice(0, 60).map((l) => ({ serviceId: str(l?.serviceId, 36), qty: Math.max(0, Math.min(5000, Math.round(Number(l?.qty)) || 0)) })),
    })),
    contact: { name: str(c.name, 160), email: str(c.email, 254), phone: str(c.phone, 40), company: str(c.company, 160) },
    pickup: o?.pickup === true,
  };
}
