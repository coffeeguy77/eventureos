import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { loadStripe } from "@/lib/payments/service";
import { createCheckout, getCheckoutSession, toCents, type CheckoutSession } from "@/lib/payments/stripe";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { money } from "@/lib/format";
import {
  agencyLineDescription, bookedSeats, cleanEmail, cleanPhone, giftCode, googleCalendarLink, hoursUntil, normCode, readSettings, seatCount, sessionWhen, splitGst,
  type BookingSettings, type CourseRow, type SessionRow,
} from "./core";
import { confirmationEmail, giftEmail, officeAlertEmail, reminderEmail, seatOpenEmail, thankYouEmail, waitlistEmail, type Brand } from "./emails";

/* ------------------------------------------------------------------ organisation */

export interface PublicOrg {
  id: string; name: string; slug: string; logo_url: string | null; brand_colour: string | null; contact_email: string | null; contact_phone: string | null;
  website: string | null; address: string | null; timezone: string; currency: string; settings: BookingSettings; rawSettings: Record<string, unknown>; stripeReady: boolean;
}

const ORG_COLS = "id, name, slug, logo_url, brand_colour, contact_email, contact_phone, website, address, timezone, currency, settings, status";

function toOrg(o: Record<string, unknown>, stripeReady: boolean): PublicOrg {
  return {
    id: o.id as string, name: o.name as string, slug: o.slug as string, logo_url: (o.logo_url as string) ?? null, brand_colour: (o.brand_colour as string) ?? null,
    contact_email: (o.contact_email as string) ?? null, contact_phone: (o.contact_phone as string) ?? null, website: (o.website as string) ?? null, address: (o.address as string) || null,
    timezone: (o.timezone as string) || "Australia/Sydney", currency: (o.currency as string) || "AUD",
    settings: readSettings(o.settings), rawSettings: (o.settings ?? {}) as Record<string, unknown>, stripeReady,
  };
}

export async function publicOrg(slug: string, db = createServiceClient()): Promise<PublicOrg | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { data } = await db.from("organisations").select(ORG_COLS).eq("slug", slug).maybeSingle();
  if (!data || data.status !== "active") return null;
  const { data: integ } = await db.from("integrations").select("status").eq("organisation_id", data.id).eq("provider", "stripe").maybeSingle();
  return toOrg(data, integ?.status === "connected");
}

export async function orgById(db: SupabaseClient, id: string): Promise<PublicOrg> {
  const { data, error } = await db.from("organisations").select(ORG_COLS).eq("id", id).single();
  if (error || !data) throw new Error("Organisation not found");
  const { data: integ } = await db.from("integrations").select("status").eq("organisation_id", id).eq("provider", "stripe").maybeSingle();
  return toOrg(data, integ?.status === "connected");
}

export const brandOf = (o: PublicOrg): Brand => ({ businessName: o.name, logoUrl: o.logo_url, brand: o.brand_colour, contactEmail: o.settings.reply_to ?? o.contact_email, contactPhone: o.contact_phone });
export const bookUrl = (o: Pick<PublicOrg, "slug">, path = "") => `${appBaseUrl()}/book/${o.slug}${path}`;

/* ------------------------------------------------------------------ catalogue */

export const COURSE_COLS = "id, slug, name, summary, description, duration_minutes, price, capacity, location, what_to_bring, image_url, colour, calendar_connection_id, active, public, position, max_seats_per_booking, waitlist, gift_enabled, agency_price, xero_item_code, xero_account_code, invoice_title, questions, external_names";
export const SESSION_COLS = "id, course_id, starts_at, ends_at, capacity, price, status, external_seats, external_note, note, calendar_event_id";

export interface PublicSession { id: string; course_id: string; starts_at: string; ends_at: string; price: number; capacity: number; left: number; full: boolean; status: string }

/** Seats taken per session (bookings + seats sold elsewhere). */
export async function seatsFor(db: SupabaseClient, sessions: Pick<SessionRow, "id" | "capacity" | "external_seats">[]) {
  const out = new Map<string, ReturnType<typeof seatCount>>();
  if (!sessions.length) return out;
  const rows: { session_id: string; seats: number; status: string; hold_expires_at: string | null }[] = [];
  for (let i = 0; i < sessions.length; i += 150) {
    const { data } = await db.from("bookings").select("session_id, seats, status, hold_expires_at")
      .in("session_id", sessions.slice(i, i + 150).map((s) => s.id)).in("status", ["held", "confirmed", "attended", "no_show"]);
    rows.push(...((data ?? []) as typeof rows));
  }
  for (const s of sessions) out.set(s.id, seatCount(s.capacity, bookedSeats(rows.filter((r) => r.session_id === s.id)), s.external_seats));
  return out;
}

export async function catalogue(org: PublicOrg, opts: { courseSlug?: string; days?: number } = {}, db = createServiceClient()) {
  let q = db.from("booking_courses").select(COURSE_COLS).eq("organisation_id", org.id).eq("active", true).eq("public", true).order("position").order("name");
  if (opts.courseSlug) q = q.eq("slug", opts.courseSlug);
  const { data: c, error } = await q;
  if (error) throw new Error(error.message);
  const courses = (c ?? []) as unknown as CourseRow[];
  if (!courses.length) return { courses, sessions: [] as PublicSession[] };
  const until = new Date(Date.now() + (opts.days ?? 180) * 86400e3).toISOString();
  const { data: s } = await db.from("booking_sessions").select(SESSION_COLS).eq("organisation_id", org.id).in("course_id", courses.map((x) => x.id))
    .eq("status", "open").gt("starts_at", new Date().toISOString()).lt("starts_at", until).order("starts_at").limit(500);
  const sessions = (s ?? []) as unknown as SessionRow[];
  const seats = await seatsFor(db, sessions);
  const byId = new Map(courses.map((x) => [x.id, x]));
  return {
    courses,
    sessions: sessions.map((x) => {
      const n = seats.get(x.id)!;
      return { id: x.id, course_id: x.course_id, starts_at: x.starts_at, ends_at: x.ends_at, price: Number(x.price ?? byId.get(x.course_id)!.price), capacity: x.capacity, left: n.left, full: n.full, status: x.status };
    }),
  };
}

/** Does this business give certificates? (a certificate design exists and is switched on) */
export async function certificatesOffered(orgId: string, db = createServiceClient()) {
  const { data, error } = await db.from("booking_certificate_templates").select("auto_issue").eq("organisation_id", orgId).eq("is_default", true).maybeSingle();
  return !error && !!data;
}

/* ------------------------------------------------------------------ students */

export async function ensureStudent(db: SupabaseClient, orgId: string, p: { name: string; email: string | null; phone: string | null; marketing?: boolean; source?: string }) {
  const name = p.name.trim().slice(0, 160) || "Guest";
  if (p.email) {
    const { data: found } = await db.from("booking_students").select("id, phone, marketing_ok").eq("organisation_id", orgId).ilike("email", p.email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (found) {
      const patch: Record<string, unknown> = {};
      if (p.phone && !found.phone) patch.phone = p.phone;
      if (p.marketing && !found.marketing_ok) patch.marketing_ok = true;
      if (Object.keys(patch).length) await db.from("booking_students").update(patch).eq("id", found.id);
      return found.id as string;
    }
  }
  const { data, error } = await db.from("booking_students").insert({ organisation_id: orgId, name, email: p.email, phone: p.phone, marketing_ok: !!p.marketing, source: p.source ?? null }).select("id").single();
  if (error) {
    // Two bookings at once for the same new email: use the one that won
    if (p.email && /duplicate|unique/i.test(error.message)) {
      const { data: again } = await db.from("booking_students").select("id").eq("organisation_id", orgId).ilike("email", p.email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
      if (again) return again.id as string;
    }
    throw new Error(error.message);
  }
  return data.id as string;
}

/* ------------------------------------------------------------------ booking */

export interface StartBookingInput {
  orgSlug: string; sessionId: string; seats: number;
  name: string; email: string; phone?: string | null; attendees?: string[]; answers?: Record<string, string>; notes?: string | null; marketing?: boolean;
  giftCode?: string | null; agencyCode?: string | null; po?: { number?: string | null; site?: string | null; contact?: string | null } | null;
  waitlist?: boolean; utm?: Record<string, string>; source?: "website" | "wordpress";
  /** An offer code (Offers): money off the class */
  promoCode?: string | null;
  /** Agency bookings: the case manager (picked from the list, or the signed-in one), or a new one typed in */
  caseManagerId?: string | null; newCaseManager?: { name: string; email: string; phone?: string | null; site?: string | null } | null;
  /** Set only by the server action when a signed-in case manager is booking (their job seeker's email is then optional) */
  agentBooking?: boolean;
}
export type StartResult = { ok: true; redirect: string } | { ok: false; error: string; soldOut?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dbMsg = (m: string) => m.replace(/^.*?ERROR:\s*/, "").replace(/\s*CONTEXT:.*$/s, "");

/** Public checkout: takes the seats, then sends the customer to Stripe (or confirms straight away for gift / agency / free). */
export async function startBooking(input: StartBookingInput): Promise<StartResult> {
  const db = createServiceClient();
  const org = await publicOrg(input.orgSlug, db);
  if (!org || !org.settings.enabled) return { ok: false, error: "Online booking isn't available." };
  if (!UUID.test(input.sessionId)) return { ok: false, error: "Choose a session." };
  const { data: sRow } = await db.from("booking_sessions").select(`${SESSION_COLS}, course:booking_courses(${COURSE_COLS})`).eq("organisation_id", org.id).eq("id", input.sessionId).maybeSingle();
  const session = sRow as unknown as (SessionRow & { course: CourseRow }) | null;
  if (!session || !session.course?.active || !session.course.public) return { ok: false, error: "That session isn't available any more." };
  const course = session.course;

  const name = (input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  const email = cleanEmail(input.email);
  const phone = cleanPhone(input.phone);
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  // A case manager booking a job seeker may not have their email — everything then goes to the case manager
  const viaCaseManager = !!input.agentBooking && !!input.agencyCode?.trim() && !!input.caseManagerId;
  if (!email && (!viaCaseManager || (input.email ?? "").trim())) return { ok: false, error: "Enter a valid email address — your booking confirmation goes there." };
  const seats = Math.max(1, Math.min(course.max_seats_per_booking, Math.round(Number(input.seats) || 1)));
  const attendees = (input.attendees ?? []).map((a) => (a ?? "").trim().slice(0, 160)).slice(0, seats);
  while (attendees.length < seats) attendees.push(attendees.length === 0 ? name : "");
  // Required questions
  for (const q of course.questions ?? []) {
    if (q.required && !(input.answers?.[q.id] ?? "").toString().trim()) return { ok: false, error: `Please answer: ${q.label}` };
  }

  // Agency (employment services) booking: code + purchase order → confirmed now, draft invoice to the agency
  type Agency = { id: string; name: string; price: number | null; po_required: boolean };
  let agency: Agency | null = null;
  if (input.agencyCode?.trim()) {
    const { data: a } = await db.from("booking_agencies").select("id, name, price, po_required").eq("organisation_id", org.id).eq("code", normCode(input.agencyCode)).eq("active", true).maybeSingle();
    if (!a) return { ok: false, error: "That agency code isn't recognised. Check it with your case manager, or pay by card." };
    agency = a as Agency;
    if (agency.po_required && !input.po?.number?.trim()) return { ok: false, error: "Enter the purchase order number from your agency." };
  }
  // The agency's case manager for this job seeker
  let caseManager: { id: string; name: string; site: string | null } | null = null;
  if (agency && (input.caseManagerId || input.newCaseManager)) {
    const { addCaseManager, caseManagerById } = await import("./agents");
    if (input.caseManagerId) {
      const cm = await caseManagerById(db, org.id, input.caseManagerId, agency.id);
      if (!cm || !cm.active) return { ok: false, error: "Choose your case manager again." };
      caseManager = cm;
    } else if (input.newCaseManager) {
      const r = await addCaseManager(db, org.id, agency.id, input.newCaseManager, "booking");
      if (!r.ok) return { ok: false, error: r.error };
      caseManager = r.data;
    }
  }
  if (!email && !(caseManager && viaCaseManager)) return { ok: false, error: "Enter a valid email address — your booking confirmation goes there." };
  let priceEach = agency ? Number(agency.price ?? course.agency_price ?? session.price ?? course.price) : Number(session.price ?? course.price);

  // Offer code: money off the seats (not for agency bookings, which are invoiced at the agency price)
  let promo: { id: string; code: string; discount: number } | null = null;
  if (input.promoCode?.trim() && !agency) {
    const { quoteOffer } = await import("@/lib/offers/server");
    const { discountedEach } = await import("@/lib/offers/core");
    const q = await quoteOffer(db, org, { code: input.promoCode, place: "classes", courseId: course.id, subtotal: Math.round(priceEach * seats * 100) / 100, email });
    if (!q.ok) return { ok: false, error: q.error };
    const before = priceEach;
    priceEach = discountedEach(priceEach, seats, q.discount);
    promo = { id: q.offer.id, code: q.offer.code, discount: Math.round((before - priceEach) * seats * 100) / 100 };
  }

  // No email (booked by a case manager): reuse a student with the same name and phone rather than making a duplicate
  let studentId: string | null = null;
  if (!email && phone) {
    const { data: same } = await db.from("booking_students").select("id").eq("organisation_id", org.id).eq("phone", phone).ilike("name", name.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
    studentId = (same?.id as string) ?? null;
  }
  studentId ??= await ensureStudent(db, org.id, { name, email, phone, marketing: input.marketing, source: input.source ?? "website" });
  const holdMinutes = org.settings.hold_minutes;
  const payload = {
    student_id: studentId, contact_name: name, contact_email: email, contact_phone: phone,
    attendees: attendees.map((n, i) => ({ name: n || (i === 0 ? name : `Guest ${i + 1}`) })),
    answers: input.answers ?? {}, notes: input.notes?.trim().slice(0, 2000) || null, price_each: priceEach,
    payment_method: agency ? "agency" : "stripe", source: input.source ?? "website",
    agency_id: agency?.id ?? null, po_number: input.po?.number?.trim().slice(0, 60) || null,
    po_site: input.po?.site?.trim().slice(0, 160) || caseManager?.site || null, po_contact: caseManager?.name ?? (input.po?.contact?.trim().slice(0, 160) || null),
    utm: input.utm ?? {},
  };
  const reserve = (waitlist: boolean) => db.rpc("booking_reserve", {
    p_org: org.id, p_session: session.id, p_seats: seats, p_booking: payload,
    // +2 minutes so a payment finishing on the Stripe page's last minute still finds its seat
    p_hold_minutes: agency ? 0 : holdMinutes + 2, p_force: false, p_waitlist: waitlist, p_gift_code: agency ? null : input.giftCode?.trim() || null,
  });
  let { data: id, error } = await reserve(!!input.waitlist && org.settings.waitlist);
  if (error) {
    const msg = dbMsg(error.message);
    return { ok: false, error: msg, soldOut: /sold out|seats? left/i.test(msg) };
  }
  const bookingId = id as string;
  if (promo) {
    // Remember the code on the booking (needs the offers database update; the discount is already in the price)
    const { error: pErr } = await db.from("bookings").update({ coupon_id: promo.id, coupon_code: promo.code, discount: promo.discount }).eq("id", bookingId);
    if (pErr) console.error("booking offer", pErr.message);
  }
  if (caseManager) {
    const { error: cmErr } = await db.from("bookings").update({ case_manager_id: caseManager.id }).eq("id", bookingId);
    if (cmErr) console.error("case manager link", cmErr.message);
    await db.from("booking_case_managers").update({ last_used_at: new Date().toISOString() }).eq("id", caseManager.id);
  }
  const { data: b } = await db.from("bookings").select("id, reference, status, total, gift_amount, manage_token").eq("id", bookingId).single();
  const bk = b as { id: string; reference: string; status: string; total: number; gift_amount: number; manage_token: string };
  const doneUrl = bookUrl(org, `/done/${bk.manage_token}`);

  if (bk.status === "waitlist") { await finalizeBooking(db, bookingId).catch((e) => console.error("finalize waitlist", e)); return { ok: true, redirect: doneUrl }; }
  const due = Math.round((Number(bk.total) - Number(bk.gift_amount)) * 100) / 100;
  if (agency || due <= 0) {
    if (!agency) {
      await db.from("bookings").update({ status: "confirmed", hold_expires_at: null, confirmed_at: new Date().toISOString(), amount_paid: bk.gift_amount, payment_method: Number(bk.total) > 0 ? "gift" : "free" }).eq("id", bookingId);
      if (promo) { const { offerUsed } = await import("@/lib/offers/server"); await offerUsed(db, promo.id).catch(() => undefined); }
    }
    await finalizeBooking(db, bookingId).catch((e) => console.error("finalize booking", e));
    return { ok: true, redirect: doneUrl };
  }

  const cancelHold = async (why: string) => {
    await db.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString(), cancel_reason: why }).eq("id", bookingId);
    await db.rpc("booking_release_expired", { p_org: org.id });
  };
  const cfg = org.stripeReady ? await loadStripe(db, org.id).catch(() => null) : null;
  if (!cfg) { await cancelHold("Card payments not set up"); return { ok: false, error: `${org.name} can't take card payments online right now. Please contact them to book.` }; }
  const w = sessionWhen(session.starts_at, session.ends_at, org.timezone);
  try {
    const cs = await createCheckout(cfg.secretKey, {
      amountCents: toCents(due), currency: org.currency, name: `${course.name}${seats > 1 ? ` × ${seats}` : ""}`,
      description: `${w.day}, ${w.time}${promo ? ` · ${promo.code} −${money(promo.discount, org.currency, { cents: true })}` : ""}${Number(bk.gift_amount) > 0 ? ` · gift certificate ${money(bk.gift_amount, org.currency, { cents: true })} applied` : ""} · ${bk.reference}`,
      email, successUrl: `${doneUrl}?paid=1`, cancelUrl: bookUrl(org, `/done/${bk.manage_token}?cancelled=1`),
      metadata: { eventureos_booking_id: bookingId, eventureos_org_id: org.id, booking_reference: bk.reference },
      idempotencyKey: `bk-${bookingId}`, account: cfg.account, expiresAt: Math.floor(Date.now() / 1000) + holdMinutes * 60,
    });
    if (!cs.url) throw new Error("Stripe didn't return a payment page");
    await db.from("bookings").update({ stripe_session_id: cs.id }).eq("id", bookingId);
    return { ok: true, redirect: cs.url };
  } catch (e) {
    await cancelHold("Couldn't start the card payment");
    return { ok: false, error: `Couldn't open the card payment page: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Stripe says a booking is paid (webhook). Safe to call twice. */
export async function confirmPaidBooking(db: SupabaseClient, orgId: string, bookingId: string, s: CheckoutSession & { id: string }) {
  const { data: b } = await db.from("bookings").select("id, status, total, gift_amount, reference, stripe_payment_intent").eq("id", bookingId).eq("organisation_id", orgId).maybeSingle();
  if (!b) throw new Error("Booking not found");
  if (b.stripe_payment_intent && ["confirmed", "attended", "no_show"].includes(b.status as string)) return `booking ${b.reference} already confirmed`;
  const paid = (s.amount_total ?? 0) / 100;
  const late = b.status === "cancelled";
  await db.from("bookings").update({
    status: "confirmed", hold_expires_at: null, confirmed_at: new Date().toISOString(), cancelled_at: null, cancel_reason: null,
    amount_paid: Math.round((Number(b.gift_amount) + paid) * 100) / 100, payment_method: "stripe",
    stripe_session_id: s.id, stripe_payment_intent: s.payment_intent ?? s.id,
  }).eq("id", bookingId);
  {
    // An offer code on the booking counts as used once it's paid
    const { data: cp, error: cpErr } = await db.from("bookings").select("coupon_id").eq("id", bookingId).maybeSingle();
    if (!cpErr && cp?.coupon_id) { const { offerUsed } = await import("@/lib/offers/server"); await offerUsed(db, cp.coupon_id as string).catch(() => undefined); }
  }
  if (late) {
    await db.from("activity_logs").insert({ organisation_id: orgId, actor_type: "system", actor_label: "Bookings", action: "booking.paid_late", entity_type: "booking", entity_id: bookingId,
      summary: `${b.reference} was paid after its seat hold ran out — it's confirmed, but check the session isn't overbooked` });
  }
  await finalizeBooking(db, bookingId);
  return `booking ${b.reference} confirmed (${paid})`;
}

interface FullBooking {
  id: string; organisation_id: string; reference: string; status: string; seats: number; attendees: { name: string }[]; contact_name: string; contact_email: string | null; contact_phone: string | null;
  price_each: number; total: number; gift_amount: number; amount_paid: number; payment_method: string; source: string; agency_id: string | null; po_number: string | null; po_site: string | null; po_contact: string | null;
  invoice_id: string | null; manage_token: string; confirmation_sent_at: string | null; reminder_sent_at: string | null; session_id: string; course_id: string; notes: string | null; stripe_session_id: string | null; created_at: string;
  session: SessionRow; course: CourseRow;
}
const FULL = `id, organisation_id, reference, status, seats, attendees, contact_name, contact_email, contact_phone, price_each, total, gift_amount, amount_paid, payment_method, source, agency_id, po_number, po_site, po_contact, invoice_id, manage_token, confirmation_sent_at, reminder_sent_at, session_id, course_id, notes, stripe_session_id, created_at, session:booking_sessions(${SESSION_COLS}), course:booking_courses(${COURSE_COLS})`;

const FULL_INNER = FULL.replace("session:booking_sessions(", "session:booking_sessions!inner(");

export async function loadBooking(db: SupabaseClient, id: string) {
  const { data } = await db.from("bookings").select(FULL).eq("id", id).maybeSingle();
  return data as unknown as FullBooking | null;
}
export async function bookingByToken(token: string, db = createServiceClient()) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { data } = await db.from("bookings").select(FULL).eq("manage_token", token).maybeSingle();
  return data as unknown as FullBooking | null;
}

export function emailBits(org: PublicOrg, b: FullBooking) {
  const w = sessionWhen(b.session.starts_at, b.session.ends_at, org.timezone);
  const manageUrl = bookUrl(org, `/manage/${b.manage_token}`);
  const icsUrl = `${appBaseUrl()}/api/book/ics/${b.manage_token}`;
  const googleUrl = googleCalendarLink({ start: b.session.starts_at, end: b.session.ends_at, title: `${b.course.name} — ${org.name}`, details: `Booking ${b.reference}. Change or cancel: ${manageUrl}`, location: b.course.location });
  const paidLine = b.payment_method === "agency" ? "Invoiced to your agency" :
    Number(b.amount_paid) > 0 && Number(b.gift_amount) >= Number(b.amount_paid) ? "Paid with a gift certificate" :
    Number(b.amount_paid) > 0 ? `${money(b.amount_paid, org.currency, { cents: true })} paid${Number(b.gift_amount) > 0 ? ` (${money(b.gift_amount, org.currency, { cents: true })} by gift certificate)` : ""}` :
    Number(b.total) === 0 ? null : b.payment_method === "office" ? "Pay on the day / as arranged" : null;
  return {
    w, manageUrl, icsUrl, googleUrl,
    input: {
      firstName: b.contact_name.split(/\s+/)[0], course: b.course.name, reference: b.reference, when: w.day, time: w.time, location: b.course.location, seats: b.seats,
      attendees: (b.attendees ?? []).map((a) => a.name).filter(Boolean), paidLine, whatToBring: b.course.what_to_bring, manageUrl, icsUrl, googleUrl, cancelHours: org.settings.cancel_hours,
    },
  };
}

async function safeSend(m: Parameters<typeof sendEmail>[0]) {
  if (!emailConfigured()) return false;
  try { await sendEmail(m); return true; } catch (e) { console.error("booking email failed", e); return false; }
}

/**
 * After a booking is confirmed (or waitlisted): agency draft invoice, customer email, office alert, calendar block when full.
 * Each step only happens once, so it's safe to run again.
 */
export async function finalizeBooking(db: SupabaseClient, bookingId: string) {
  const b = await loadBooking(db, bookingId);
  if (!b) return;
  const org = await orgById(db, b.organisation_id);
  const brand = brandOf(org);
  const notes: string[] = [];

  if (b.status === "confirmed" && b.agency_id && !b.invoice_id) {
    try { const inv = await createAgencyInvoice(db, org, b); if (inv) notes.push(`draft invoice ${inv}`); }
    catch (e) { notes.push(`no draft invoice: ${e instanceof Error ? e.message : String(e)}`); }
  }

  if (!b.confirmation_sent_at && ["confirmed", "waitlist"].includes(b.status)) {
    const bits = emailBits(org, b);
    if (b.contact_email) {
      const mail = b.status === "waitlist" ? waitlistEmail(brand, { ...bits.input, manageUrl: bookUrl(org) }) : confirmationEmail(brand, bits.input);
      const sent = await safeSend({ to: b.contact_email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name });
      if (!sent) notes.push("confirmation email not sent");
    }
    const to = org.settings.notify_email ?? org.contact_email;
    if (to) {
      const alert = officeAlertEmail(brand, {
        heading: `${b.status === "waitlist" ? "Waitlist" : "New booking"}: ${b.course.name} — ${bits.w.short} ${bits.w.start}`,
        lines: [
          { label: "Booking", value: b.reference }, { label: "Name", value: b.contact_name }, ...(b.contact_email ? [{ label: "Email", value: b.contact_email }] : []),
          ...(b.contact_phone ? [{ label: "Phone", value: b.contact_phone }] : []), { label: "Seats", value: String(b.seats) },
          { label: "Payment", value: b.payment_method === "agency" ? `Agency — PO ${b.po_number ?? "(none)"}${b.invoice_id ? " · draft invoice ready to check" : ""}` : bits.input.paidLine ?? b.payment_method },
          ...(b.notes ? [{ label: "Notes", value: b.notes }] : []),
        ],
        url: `${appBaseUrl()}/bookings/sessions/${b.session_id}`,
      });
      await safeSend({ to, subject: alert.subject, html: alert.html, text: alert.text, fromName: "EventureOS" });
    }
    await db.from("bookings").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", b.id);
    await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Bookings", action: b.status === "waitlist" ? "booking.waitlisted" : "booking.confirmed",
      entity_type: "booking", entity_id: b.id, summary: `${b.reference} ${b.status === "waitlist" ? "joined the waitlist for" : "booked"} ${b.course.name} (${bits.w.short}) — ${b.contact_name}, ${b.seats} seat${b.seats === 1 ? "" : "s"}${notes.length ? ` · ${notes.join("; ")}` : ""}` });
  }
  if (b.agency_id && ["confirmed", "waitlist"].includes(b.status)) {
    try { const { notifyCaseManager } = await import("./agents"); await notifyCaseManager(db, b.id); } catch (e) { console.error("case manager email", e); }
  }
  await syncSessionBlock(db, org, b.session_id).catch((e) => console.error("session block", e));
}

/* ------------------------------------------------------------------ agency invoice (draft, for the office to check) */

async function agencyLines(db: SupabaseClient, org: PublicOrg, b: FullBooking) {
  const { data: a } = await db.from("booking_agencies").select("id, name, customer_id, contact_label, po_label, site_label").eq("id", b.agency_id!).maybeSingle();
  const w = sessionWhen(b.session.starts_at, b.session.ends_at, org.timezone);
  const title = b.course.invoice_title?.trim() || b.course.name;
  const names = (b.attendees ?? []).map((x) => x.name).filter(Boolean);
  while (names.length < b.seats) names.push(b.contact_name);
  const each = Number(b.price_each);
  const lines = names.slice(0, b.seats).map((n) => ({
    quantity: 1, unit_amount: each, line_amount: each,
    item_code: b.course.xero_item_code || null, account_code: b.course.xero_account_code || null,
    description: agencyLineDescription({ title, student: n, dateKey: w.dateKey, po: b.po_number, site: b.po_site, contact: b.po_contact, contactLabel: (a?.contact_label as string) ?? "Contact", poLabel: a?.po_label as string, siteLabel: a?.site_label as string }),
  }));
  return { a, w, lines, gst: splitGst(each * lines.length) };
}

async function createAgencyInvoice(db: SupabaseClient, org: PublicOrg, b: FullBooking): Promise<string | null> {
  const { a, w, lines, gst: g } = await agencyLines(db, org, b);
  if (!a?.customer_id) throw new Error("the agency isn't linked to a client yet (Bookings → Agencies)");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date());
  const terms = Math.max(0, Number((org.rawSettings.default_payment_terms_days as number | undefined) ?? 14) || 0);
  const due = new Date(today + "T00:00:00Z"); due.setUTCDate(due.getUTCDate() + terms);
  const { data: inv, error } = await db.from("invoices").insert({
    organisation_id: org.id, customer_id: a.customer_id, kind: "other", status: "draft", issue_date: today, due_date: due.toISOString().slice(0, 10),
    subtotal: g.subtotal, tax_total: g.tax, total: g.total, currency: org.currency, reference: b.po_number ? `PO ${b.po_number}` : b.reference, line_items: lines,
  }).select("id, number").single();
  if (error) throw new Error(error.message);
  await db.from("bookings").update({ invoice_id: inv.id }).eq("id", b.id);
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Bookings", action: "invoice.created", entity_type: "invoice", entity_id: inv.id, customer_id: a.customer_id,
    summary: `Draft invoice ${inv.number} for ${a.name} — ${b.contact_name}, ${b.course.name} ${w.short}${b.po_number ? `, PO ${b.po_number}` : ""}. Check it, then approve to send to Xero.` });
  return inv.number as string;
}

/**
 * An agency booking changed (moved, cancelled, edited) while its invoice is still a draft that hasn't gone to Xero:
 * cancelled → the draft is voided; otherwise its lines are rewritten (new date, names, PO). Approved invoices are left for the office.
 */
export async function refreshAgencyDraft(db: SupabaseClient, bookingId: string) {
  const b = await loadBooking(db, bookingId);
  if (!b?.invoice_id || !b.agency_id) return;
  const { data: inv } = await db.from("invoices").select("id, number, status, xero_invoice_id").eq("id", b.invoice_id).maybeSingle();
  if (!inv || inv.status !== "draft" || inv.xero_invoice_id) return;
  if (b.status === "cancelled") {
    await db.from("invoices").update({ status: "void" }).eq("id", inv.id);
    await db.from("activity_logs").insert({ organisation_id: b.organisation_id, actor_type: "system", actor_label: "Bookings", action: "invoice.voided", entity_type: "invoice", entity_id: inv.id,
      summary: `Draft invoice ${inv.number} voided — booking ${b.reference} was cancelled` });
    return;
  }
  const org = await orgById(db, b.organisation_id);
  const { lines, gst: g } = await agencyLines(db, org, b);
  await db.from("invoices").update({ line_items: lines, subtotal: g.subtotal, tax_total: g.tax, total: g.total, reference: b.po_number ? `PO ${b.po_number}` : b.reference }).eq("id", inv.id);
}

/* ------------------------------------------------------------------ calendar block when full */

/**
 * When a session fills up, put a busy entry on the course's calendar (e.g. "Barista Courses") so other platforms that read
 * that calendar (Bookly, ClassBento) stop selling it. When seats free up again, the entry is removed.
 */
export async function syncSessionBlock(db: SupabaseClient, org: PublicOrg, sessionId: string) {
  const { data: s } = await db.from("booking_sessions").select(`${SESSION_COLS}, course:booking_courses(name, calendar_connection_id, location)`).eq("id", sessionId).maybeSingle();
  const row = s as unknown as (SessionRow & { course: { name: string; calendar_connection_id: string | null; location: string | null } }) | null;
  if (!row) return;
  const n = (await seatsFor(db, [row])).get(row.id)!;
  const shouldBlock = (n.full || row.status === "closed") && row.status !== "cancelled" && !!row.course.calendar_connection_id && Date.parse(row.ends_at) > Date.now();
  const { buildContext } = await import("@/lib/integrations/sync-runner");
  const gcal = await import("@/lib/integrations/google-calendar");
  const ctx = await buildContext(db, "service", org.id, "google_calendar", null).catch(() => null);
  if (shouldBlock && !row.calendar_event_id) {
    const { data: ce, error } = await db.from("calendar_events").insert({
      organisation_id: org.id, calendar_connection_id: row.course.calendar_connection_id, title: `${row.course.name} — FULL (EventureOS)`,
      starts_at: row.starts_at, ends_at: row.ends_at, all_day: false, location: row.course.location, kind: "hold", sync_status: ctx ? "pending" : "local",
    }).select("id").single();
    if (error) throw new Error(error.message);
    await db.from("booking_sessions").update({ calendar_event_id: ce.id }).eq("id", row.id);
    if (ctx) await gcal.pushCalendarEntry(ctx, ce.id as string, `${row.course.name} is full (${n.taken}/${n.capacity}). Added by EventureOS bookings so other booking platforms stop selling it.`).catch((e) => console.error("push block", e));
  } else if (!shouldBlock && row.calendar_event_id) {
    const { data: ce } = await db.from("calendar_events").select("id, external_event_id, conn:calendar_connections(external_calendar_id)").eq("id", row.calendar_event_id).maybeSingle();
    const c = ce as unknown as { id: string; external_event_id: string | null; conn: { external_calendar_id: string | null } | null } | null;
    if (c?.external_event_id && c.conn?.external_calendar_id) {
      if (!ctx) return; // can't remove it from Google right now — keep it so it isn't lost
      await gcal.deleteGoogleEvent(ctx, c.conn.external_calendar_id, c.external_event_id);
    }
    await db.from("booking_sessions").update({ calendar_event_id: null }).eq("id", row.id);
    if (c) await db.from("calendar_events").delete().eq("id", c.id);
    await notifyWaitlist(db, org, row.id).catch((e) => console.error("waitlist notify", e));
  } else if (!n.full) {
    await notifyWaitlist(db, org, row.id).catch((e) => console.error("waitlist notify", e));
  }
}

/** Seats free on a session that has a waitlist → email the waitlist (at most every 6 hours per person). */
async function notifyWaitlist(db: SupabaseClient, org: PublicOrg, sessionId: string) {
  const { data } = await db.from("bookings").select("id, contact_name, contact_email, reminder_sent_at, seats").eq("session_id", sessionId).eq("status", "waitlist");
  const wl = (data ?? []) as { id: string; contact_name: string; contact_email: string | null; reminder_sent_at: string | null; seats: number }[];
  if (!wl.length) return;
  const { data: s } = await db.from("booking_sessions").select(`${SESSION_COLS}, course:booking_courses(name, slug)`).eq("id", sessionId).single();
  const row = s as unknown as SessionRow & { course: { name: string; slug: string } };
  if (row.status !== "open" || Date.parse(row.starts_at) < Date.now()) return;
  const left = (await seatsFor(db, [row])).get(row.id)!.left;
  if (left <= 0) return;
  const w = sessionWhen(row.starts_at, row.ends_at, org.timezone);
  for (const x of wl) {
    if (!x.contact_email || (x.reminder_sent_at && Date.now() - Date.parse(x.reminder_sent_at) < 6 * 3600e3)) continue;
    const m = seatOpenEmail(brandOf(org), { firstName: x.contact_name.split(/\s+/)[0], course: row.course.name, when: w.day, time: w.time, bookUrl: bookUrl(org, `/${row.course.slug}?session=${row.id}`) });
    if (await safeSend({ to: x.contact_email, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name })) {
      await db.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", x.id);
    }
  }
}

/* ------------------------------------------------------------------ customer self-service */

export async function customerCancel(token: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const db = createServiceClient();
  const b = await bookingByToken(token, db);
  if (!b) return { ok: false, error: "Booking not found." };
  const org = await orgById(db, b.organisation_id);
  if (!["confirmed", "waitlist", "held"].includes(b.status)) return { ok: false, error: "This booking is already cancelled." };
  if (b.status === "confirmed" && hoursUntil(b.session.starts_at) < org.settings.cancel_hours) return { ok: false, error: `Bookings can only be cancelled online up to ${org.settings.cancel_hours} hours before. Please contact ${org.name}.` };
  await db.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Cancelled by the customer online", hold_expires_at: null }).eq("id", b.id);
  const paid = Number(b.amount_paid) > 0;
  const to = org.settings.notify_email ?? org.contact_email;
  const w = sessionWhen(b.session.starts_at, b.session.ends_at, org.timezone);
  if (to && b.status === "confirmed") {
    const m = officeAlertEmail(brandOf(org), { heading: `Cancelled: ${b.course.name} — ${w.short} ${w.start}`, url: `${appBaseUrl()}/bookings/sessions/${b.session_id}`,
      lines: [{ label: "Booking", value: b.reference }, { label: "Name", value: b.contact_name }, { label: "Seats", value: String(b.seats) },
        { label: "Paid", value: paid ? `${money(b.amount_paid, org.currency, { cents: true })} (${b.payment_method}) — refund or credit needed` : "Nothing paid" }] });
    await safeSend({ to, subject: m.subject, html: m.html, text: m.text, fromName: "EventureOS" });
  }
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Bookings", action: "booking.cancelled", entity_type: "booking", entity_id: b.id,
    summary: `${b.contact_name} cancelled ${b.reference} (${b.course.name}, ${w.short}) online${paid ? " — refund or credit needed" : ""}` });
  await refreshAgencyDraft(db, b.id).catch(() => undefined);
  await syncSessionBlock(db, org, b.session_id).catch(() => undefined);
  return { ok: true, message: paid ? `Your booking is cancelled. ${org.name} will be in touch about your refund or credit.` : "Your booking is cancelled." };
}

export async function customerMove(token: string, sessionId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const db = createServiceClient();
  const b = await bookingByToken(token, db);
  if (!b) return { ok: false, error: "Booking not found." };
  const org = await orgById(db, b.organisation_id);
  if (b.status !== "confirmed") return { ok: false, error: "Only confirmed bookings can be moved." };
  if (hoursUntil(b.session.starts_at) < org.settings.cancel_hours) return { ok: false, error: `Bookings can only be moved online up to ${org.settings.cancel_hours} hours before. Please contact ${org.name}.` };
  if (!UUID.test(sessionId)) return { ok: false, error: "Choose a new date." };
  const { error } = await db.rpc("booking_move", { p_org: org.id, p_booking: b.id, p_session: sessionId, p_force: false });
  if (error) return { ok: false, error: dbMsg(error.message) };
  await db.from("bookings").update({ confirmation_sent_at: null }).eq("id", b.id);
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Bookings", action: "booking.moved", entity_type: "booking", entity_id: b.id,
    summary: `${b.contact_name} moved ${b.reference} to another date online` });
  await refreshAgencyDraft(db, b.id).catch(() => undefined);
  await finalizeBooking(db, b.id); // new confirmation email
  await syncSessionBlock(db, org, b.session_id).catch(() => undefined); // the old session
  return { ok: true, message: "Done — your booking has moved. A new confirmation is on its way." };
}

/* ------------------------------------------------------------------ gift certificates */

export const newGiftCode = () => giftCode((n) => randomBytes(n));

export interface GiftInput { orgSlug: string; courseId?: string | null; amount?: number | null; purchaserName: string; purchaserEmail: string; recipientName?: string | null; recipientEmail?: string | null; message?: string | null; sendOn?: string | null; promoCode?: string | null }

export async function startGiftPurchase(input: GiftInput): Promise<StartResult> {
  const db = createServiceClient();
  const org = await publicOrg(input.orgSlug, db);
  if (!org || !org.settings.enabled) return { ok: false, error: "Gift certificates aren't available." };
  const purchaserName = input.purchaserName?.trim().slice(0, 160) ?? "";
  const purchaserEmail = cleanEmail(input.purchaserEmail);
  if (purchaserName.length < 2) return { ok: false, error: "Enter your name." };
  if (!purchaserEmail) return { ok: false, error: "Enter a valid email — the certificate is emailed to you." };
  const recipientEmail = input.recipientEmail?.trim() ? cleanEmail(input.recipientEmail) : null;
  if (input.recipientEmail?.trim() && !recipientEmail) return { ok: false, error: "The recipient's email doesn't look right." };
  let course: { id: string; name: string; price: number } | null = null;
  let amount = 0;
  if (input.courseId) {
    if (!UUID.test(input.courseId)) return { ok: false, error: "Choose a course." };
    const { data } = await db.from("booking_courses").select("id, name, price, gift_enabled, active").eq("organisation_id", org.id).eq("id", input.courseId).maybeSingle();
    if (!data?.active || !data.gift_enabled) return { ok: false, error: "That course isn't available as a gift." };
    course = { id: data.id as string, name: data.name as string, price: Number(data.price) };
    amount = course.price;
  } else {
    amount = Math.round(Number(input.amount) || 0);
    if (!org.settings.gift_amounts.includes(amount)) return { ok: false, error: "Choose a gift amount." };
  }
  if (amount <= 0) return { ok: false, error: "Choose a gift." };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date());
  const sendOn = input.sendOn && /^\d{4}-\d{2}-\d{2}$/.test(input.sendOn) && input.sendOn > today ? input.sendOn : null;
  // Offer code: money off what they pay — the certificate keeps its full value
  let promo: { id: string; code: string; discount: number } | null = null;
  if (input.promoCode?.trim()) {
    const { quoteOffer } = await import("@/lib/offers/server");
    const q = await quoteOffer(db, org, { code: input.promoCode, place: "gifts", courseId: course?.id ?? null, subtotal: amount, email: purchaserEmail });
    if (!q.ok) return { ok: false, error: q.error };
    promo = { id: q.offer.id, code: q.offer.code, discount: q.discount };
  }
  const due = Math.max(0, Math.round((amount - (promo?.discount ?? 0)) * 100) / 100);
  const cfg = org.stripeReady ? await loadStripe(db, org.id).catch(() => null) : null;
  if (!cfg && due > 0) return { ok: false, error: `${org.name} can't take card payments online right now.` };

  type NewGift = { id: string; code: string; view_token: string };
  let gift: NewGift | null = null;
  const row = {
    organisation_id: org.id, course_id: course?.id ?? null, amount, balance: amount, status: "pending",
    purchaser_name: purchaserName, purchaser_email: purchaserEmail, recipient_name: input.recipientName?.trim().slice(0, 160) || null, recipient_email: recipientEmail,
    message: input.message?.trim().slice(0, 1000) || null, send_on: sendOn, source: "stripe",
  };
  const withPromo = promo ? { coupon_id: promo.id, coupon_code: promo.code, discount: promo.discount } : {};
  for (let i = 0; i < 4 && !gift; i++) {
    let { data, error } = await db.from("booking_gifts").insert({ ...row, ...withPromo, code: newGiftCode() }).select("id, code, view_token").single();
    // Before the offers database update the code columns don't exist yet: keep the sale going without them
    if (error && promo && /coupon_id|coupon_code|discount/.test(error.message)) ({ data, error } = await db.from("booking_gifts").insert({ ...row, code: newGiftCode() }).select("id, code, view_token").single());
    if (!error) gift = data as NewGift;
    else if (!/duplicate|unique/i.test(error.message)) return { ok: false, error: error.message };
  }
  if (!gift) return { ok: false, error: "Couldn't create the certificate — please try again." };
  if (due <= 0) {
    // Fully covered by the offer: nothing to pay, so it's ready now
    await activateGiftNow(db, org, gift.id, promo?.id ?? null, "offer");
    return { ok: true, redirect: bookUrl(org, `/gift/${gift.view_token}?paid=1`) };
  }
  try {
    const cs = await createCheckout(cfg!.secretKey, {
      amountCents: toCents(due), currency: org.currency, name: `Gift certificate — ${course ? course.name : money(amount, org.currency)}`,
      description: [input.recipientName?.trim() ? `For ${input.recipientName.trim()}` : `${org.name} gift certificate`, promo ? `${promo.code} −${money(promo.discount, org.currency, { cents: true })} (certificate value ${money(amount, org.currency)})` : null].filter(Boolean).join(" · "), email: purchaserEmail,
      successUrl: bookUrl(org, `/gift/${gift.view_token}?paid=1`), cancelUrl: bookUrl(org, "/gift"),
      metadata: { eventureos_gift_id: gift.id, eventureos_org_id: org.id }, idempotencyKey: `gift-${gift.id}`, account: cfg!.account,
    });
    if (!cs.url) throw new Error("Stripe didn't return a payment page");
    await db.from("booking_gifts").update({ stripe_session_id: cs.id }).eq("id", gift.id);
    return { ok: true, redirect: cs.url };
  } catch (e) {
    await db.from("booking_gifts").update({ status: "void" }).eq("id", gift.id);
    return { ok: false, error: `Couldn't open the card payment page: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function giftByToken(token: string, db = createServiceClient()) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { data } = await db.from("booking_gifts").select("id, organisation_id, code, amount, balance, status, purchaser_name, recipient_name, recipient_email, message, expires_on, stripe_session_id, course:booking_courses(name, slug)").eq("view_token", token).maybeSingle();
  return data as unknown as { id: string; organisation_id: string; code: string; amount: number; balance: number; status: string; purchaser_name: string | null; recipient_name: string | null; recipient_email: string | null; message: string | null; expires_on: string | null; stripe_session_id: string | null; course: { name: string; slug: string } | null } | null;
}

/** Stripe says a gift certificate is paid: activate it and email it. */
export async function activateGift(db: SupabaseClient, orgId: string, giftId: string, s: CheckoutSession & { id: string }) {
  const { data: g } = await db.from("booking_gifts").select("id, status, code").eq("id", giftId).eq("organisation_id", orgId).maybeSingle();
  if (!g) throw new Error("Gift certificate not found");
  if (g.status !== "pending") return `gift ${g.code} already ${g.status}`;
  const org = await orgById(db, orgId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date());
  const exp = new Date(today + "T00:00:00Z"); exp.setUTCMonth(exp.getUTCMonth() + org.settings.gift_expiry_months);
  await db.from("booking_gifts").update({ status: "active", expires_on: exp.toISOString().slice(0, 10), stripe_session_id: s.id, stripe_payment_intent: s.payment_intent ?? s.id }).eq("id", giftId);
  {
    const { data: cp, error: cpErr } = await db.from("booking_gifts").select("coupon_id").eq("id", giftId).maybeSingle();
    if (!cpErr && cp?.coupon_id) { const { offerUsed } = await import("@/lib/offers/server"); await offerUsed(db, cp.coupon_id as string).catch(() => undefined); }
  }
  await deliverGift(db, org, giftId, true);
  await db.from("activity_logs").insert({ organisation_id: orgId, actor_type: "system", actor_label: "Bookings", action: "gift.sold", entity_type: "booking_gift", entity_id: giftId,
    summary: `Gift certificate ${g.code} sold online (${money((s.amount_total ?? 0) / 100, org.currency)})` });
  return `gift ${g.code} activated`;
}

/** A gift certificate with nothing to pay (fully covered by an offer code): activate and email it now. */
async function activateGiftNow(db: SupabaseClient, org: PublicOrg, giftId: string, offerId: string | null, why: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date());
  const exp = new Date(today + "T00:00:00Z"); exp.setUTCMonth(exp.getUTCMonth() + org.settings.gift_expiry_months);
  const { data: g } = await db.from("booking_gifts").update({ status: "active", expires_on: exp.toISOString().slice(0, 10) }).eq("id", giftId).eq("status", "pending").select("code").maybeSingle();
  if (!g) return;
  if (offerId) { const { offerUsed } = await import("@/lib/offers/server"); await offerUsed(db, offerId).catch(() => undefined); }
  await deliverGift(db, org, giftId, true).catch((e) => console.error("deliver gift", e));
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Bookings", action: "gift.sold", entity_type: "booking_gift", entity_id: giftId,
    summary: `Gift certificate ${g.code} issued online with nothing to pay (${why})` });
}

/** Email the certificate: to the purchaser (once), and to the recipient when their send date arrives. */
export async function deliverGift(db: SupabaseClient, org: PublicOrg, giftId: string, toPurchaser: boolean) {
  const { data } = await db.from("booking_gifts").select("id, code, amount, purchaser_name, purchaser_email, recipient_name, recipient_email, message, send_on, sent_at, expires_on, view_token, course:booking_courses(name)").eq("id", giftId).single();
  const g = data as unknown as { id: string; code: string; amount: number; purchaser_name: string | null; purchaser_email: string | null; recipient_name: string | null; recipient_email: string | null; message: string | null; send_on: string | null; sent_at: string | null; expires_on: string | null; view_token: string; course: { name: string } | null };
  const brand = brandOf(org);
  const common = { purchaserName: g.purchaser_name, recipientName: g.recipient_name, code: g.code, amount: money(g.amount, org.currency), course: g.course?.name ?? null, message: g.message,
    expires: g.expires_on ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(g.expires_on + "T00:00:00Z")) : null,
    viewUrl: bookUrl(org, `/gift/${g.view_token}`), bookUrl: bookUrl(org) };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date());
  const toRecipient = !!g.recipient_email && !g.sent_at && (!g.send_on || g.send_on <= today);
  // The printable certificate (front + back) goes with the email; if it can't be made, the email still goes with its link
  let attachments: { filename: string; content: string }[] | undefined;
  if ((toPurchaser && g.purchaser_email) || toRecipient) {
    try {
      const { giftPdf } = await import("./gift-pdf");
      const pdf = await giftPdf(org, g);
      if (pdf) attachments = [{ filename: pdf.file, content: Buffer.from(pdf.bytes).toString("base64") }];
    } catch (e) { console.error("gift pdf attach", e); }
  }
  if (toPurchaser && g.purchaser_email) {
    const m = giftEmail(brand, { ...common, to: "purchaser" });
    await safeSend({ to: g.purchaser_email, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name, attachments });
  }
  if (toRecipient && g.recipient_email) {
    const m = giftEmail(brand, { ...common, to: "recipient" });
    if (await safeSend({ to: g.recipient_email, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name, attachments })) {
      await db.from("booking_gifts").update({ sent_at: new Date().toISOString() }).eq("id", g.id);
    }
  }
}

/* ------------------------------------------------------------------ background jobs (cron) */

/** Reminders, thank-yous, scheduled gift emails, expired holds. Runs from the background sync. */
export async function runBookingJobs(db: SupabaseClient) {
  const out = { released: 0, reminders: 0, thanks: 0, gifts: 0 };
  const { data: rel } = await db.rpc("booking_release_expired", { p_org: null });
  out.released = Number(rel ?? 0);
  const now = Date.now();
  const orgs = new Map<string, PublicOrg>();
  const getOrg = async (id: string) => { if (!orgs.has(id)) orgs.set(id, await orgById(db, id)); return orgs.get(id)!; };

  // Weekly timetables: keep dates open the set number of days ahead
  try {
    const { fillAllSchedules } = await import("./schedules");
    (out as Record<string, number>).timetable = await fillAllSchedules(db);
  } catch { /* never block the other jobs */ }

  // Reminders: confirmed bookings for sessions in the next 14 days
  const { data: soon } = await db.from("bookings").select(FULL_INNER).eq("status", "confirmed").is("reminder_sent_at", null).in("source", ["website", "wordpress", "office"])
    .gt("session.starts_at", new Date(now).toISOString()).lt("session.starts_at", new Date(now + 14 * 86400e3).toISOString()).not("contact_email", "is", null).limit(200);
  for (const b of ((soon ?? []) as unknown as FullBooking[]).filter((x) => x.session)) {
    const org = await getOrg(b.organisation_id);
    if (!org.settings.reminder_hours || hoursUntil(b.session.starts_at, now) > org.settings.reminder_hours) continue;
    const m = reminderEmail(brandOf(org), emailBits(org, b).input);
    if (await safeSend({ to: b.contact_email!, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name })) {
      await db.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);
      out.reminders++;
    }
  }

  // Certificates for finished classes (before the thank-you, so it can link to them)
  try {
    const { runCertificateJobs, sendCertificateEmails } = await import("./certificates");
    (out as Record<string, number>).certificates = await runCertificateJobs(db);
    (out as Record<string, number>).certificateEmails = await sendCertificateEmails(db);
  } catch { /* before the 0050 update */ }
  try {
    const { sendCaseManagerCertificates } = await import("./agents");
    (out as Record<string, number>).caseManagerCertificates = await sendCaseManagerCertificates(db);
  } catch { /* before the 0052 update */ }

  // Thank-you: 2+ hours after the session ended, within 3 days (not imported history)
  const { data: done } = await db.from("bookings").select(FULL_INNER).in("status", ["confirmed", "attended"]).is("followup_sent_at", null).in("source", ["website", "wordpress", "office"])
    .lt("session.ends_at", new Date(now - 2 * 3600e3).toISOString()).gt("session.ends_at", new Date(now - 3 * 86400e3).toISOString()).not("contact_email", "is", null).limit(200);
  for (const b of ((done ?? []) as unknown as FullBooking[]).filter((x) => x.session)) {
    const org = await getOrg(b.organisation_id);
    if (!org.settings.followup) { await db.from("bookings").update({ followup_sent_at: new Date().toISOString() }).eq("id", b.id); continue; }
    const { data: cert } = await db.from("booking_certificates").select("verify_token").eq("booking_id", b.id).eq("attendee_index", 0).eq("status", "issued").maybeSingle();
    const m = thankYouEmail(brandOf(org), { firstName: b.contact_name.split(/\s+/)[0], course: b.course.name, reviewUrl: org.settings.review_url, bookUrl: bookUrl(org),
      giftUrl: b.course.gift_enabled ? bookUrl(org, "/gift") : null, social: org.settings.social,
      certificateUrl: cert ? bookUrl(org, `/certificate/${cert.verify_token}`) : null, accountUrl: cert ? bookUrl(org, "/account") : null });
    if (await safeSend({ to: b.contact_email!, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name })) {
      await db.from("bookings").update({ followup_sent_at: new Date().toISOString() }).eq("id", b.id);
      out.thanks++;
    }
  }

  // Gift certificates scheduled to reach the recipient today
  const { data: gifts } = await db.from("booking_gifts").select("id, organisation_id").eq("status", "active").is("sent_at", null).not("recipient_email", "is", null).not("send_on", "is", null).limit(100);
  for (const g of (gifts ?? []) as { id: string; organisation_id: string }[]) {
    await deliverGift(db, await getOrg(g.organisation_id), g.id, false).catch((e) => console.error("gift delivery", e));
    out.gifts++;
  }
  return out;
}

/* ------------------------------------------------------------------ back from Stripe before the webhook */

/** The customer is back from Stripe: if the webhook hasn't confirmed it yet, ask Stripe directly. */
export async function settleFromStripe(kind: "booking" | "gift", id: string, orgId: string, stripeSessionId: string | null) {
  if (!stripeSessionId) return;
  const db = createServiceClient();
  const cfg = await loadStripe(db, orgId).catch(() => null);
  if (!cfg) return;
  const s = await getCheckoutSession(cfg.secretKey, stripeSessionId, cfg.account).catch(() => null);
  if (!s || s.payment_status !== "paid") return;
  const meta = s.metadata ?? {};
  if (meta.eventureos_org_id !== orgId) return;
  if (kind === "booking" && meta.eventureos_booking_id === id) await confirmPaidBooking(db, orgId, id, s as CheckoutSession & { id: string });
  if (kind === "gift" && meta.eventureos_gift_id === id) await activateGift(db, orgId, id, s as CheckoutSession & { id: string });
}
