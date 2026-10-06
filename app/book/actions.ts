"use server";

import { createServiceClient } from "@/lib/integrations/runtime";
import { normCode } from "@/lib/bookings/core";
import { customerCancel, customerMove, publicOrg, startBooking, startGiftPurchase, type GiftInput, type StartBookingInput, type StartResult } from "@/lib/bookings/server";

const fail = (e: unknown): StartResult => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong — please try again." });
const notReady = (m: string) => /booking_|relation .* does not exist|schema cache/i.test(m);

export async function startBookingAction(input: StartBookingInput): Promise<StartResult> {
  try {
    // A signed-in case manager booking with their own agency's code: the booking is theirs (never trust the browser for this)
    if (input.agencyCode?.trim()) {
      const org = await publicOrg(input.orgSlug);
      const { currentAgent } = await import("@/lib/bookings/agents");
      const agent = org ? await currentAgent(org).catch(() => null) : null;
      if (agent && agent.agency.code === normCode(input.agencyCode)) input = { ...input, caseManagerId: agent.cm.id, newCaseManager: null, agentBooking: true };
      else input = { ...input, agentBooking: false };
    } else input = { ...input, caseManagerId: null, newCaseManager: null, agentBooking: false };
    return await startBooking(input);
  }
  catch (e) { return notReady(String(e)) ? { ok: false, error: "Online booking is being set up — please try again soon." } : fail(e); }
}

export async function startGiftAction(input: GiftInput): Promise<StartResult> {
  try { return await startGiftPurchase(input); } catch (e) { return fail(e); }
}

export async function cancelBookingAction(token: string) {
  try { return await customerCancel(token); } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Couldn't cancel — please contact us." }; }
}

export async function moveBookingAction(token: string, sessionId: string) {
  try { return await customerMove(token, sessionId); } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Couldn't move it — please contact us." }; }
}

/** Check a gift certificate code at checkout: what's left on it and what it can be used for. */
export async function checkGiftAction(orgSlug: string, code: string, courseId: string): Promise<{ ok: true; balance: number; label: string } | { ok: false; error: string }> {
  const db = createServiceClient();
  const org = await publicOrg(orgSlug, db);
  const c = normCode(code);
  if (!org || c.length < 6) return { ok: false, error: "Enter the code from your certificate." };
  const { data: g } = await db.from("booking_gifts").select("balance, status, expires_on, course_id, course:booking_courses(name)").eq("organisation_id", org.id).eq("code", c).maybeSingle();
  const gift = g as unknown as { balance: number; status: string; expires_on: string | null; course_id: string | null; course: { name: string } | null } | null;
  if (!gift || !["active", "redeemed"].includes(gift.status)) return { ok: false, error: "That code isn't valid. Check it and try again." };
  if (gift.status === "redeemed" || Number(gift.balance) <= 0) return { ok: false, error: "That gift certificate has already been used." };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date());
  if (gift.expires_on && gift.expires_on < today) return { ok: false, error: "That gift certificate has expired." };
  if (gift.course_id && gift.course_id !== courseId) return { ok: false, error: `That certificate is for ${gift.course?.name ?? "a different course"}.` };
  return { ok: true, balance: Number(gift.balance), label: gift.course ? `${gift.course.name} gift certificate` : "Gift certificate" };
}

/** Check an agency code: shows the agency's name so the customer knows it worked. */
export async function checkAgencyAction(orgSlug: string, code: string): Promise<{ ok: true; name: string; price: number | null; poRequired: boolean } | { ok: false; error: string }> {
  const db = createServiceClient();
  const org = await publicOrg(orgSlug, db);
  const c = normCode(code);
  if (!org || c.length < 3) return { ok: false, error: "Enter the code your agency gave you." };
  const { data: a } = await db.from("booking_agencies").select("name, price, po_required").eq("organisation_id", org.id).eq("code", c).eq("active", true).maybeSingle();
  if (!a) return { ok: false, error: "That agency code isn't recognised." };
  return { ok: true, name: a.name as string, price: a.price === null ? null : Number(a.price), poRequired: !!a.po_required };
}

export type OfferCheck = { ok: true; code: string; discount: number; label: string } | { ok: false; error: string };

/**
 * Check an offer code before paying: a class booking (session + seats) or a gift certificate (course or dollar amount).
 * Prices come from the database, never the browser. The same check runs again when they pay.
 */
export async function checkOfferAction(orgSlug: string, code: string, x: { place: "classes"; sessionId: string; seats: number; email?: string | null } | { place: "gifts"; courseId: string | null; amount: number | null; email?: string | null; shop?: boolean }): Promise<OfferCheck> {
  try {
    const db = createServiceClient();
    const org = await publicOrg(orgSlug, db);
    if (!org || !code?.trim()) return { ok: false, error: "Enter a code." };
    const { quoteOffer } = await import("@/lib/offers/server");
    const { offerShort } = await import("@/lib/offers/core");
    let courseId: string | null = null, subtotal = 0;
    if (x.place === "classes") {
      const { data: s } = await db.from("booking_sessions").select("price, course:booking_courses(id, price)").eq("organisation_id", org.id).eq("id", x.sessionId).maybeSingle();
      const row = s as unknown as { price: number | null; course: { id: string; price: number } | null } | null;
      if (!row?.course) return { ok: false, error: "Choose a date first." };
      courseId = row.course.id;
      subtotal = Math.round(Number(row.price ?? row.course.price) * Math.max(1, Math.round(x.seats || 1)) * 100) / 100;
    } else {
      if (x.courseId) {
        const { data: c } = await db.from("booking_courses").select("id, price").eq("organisation_id", org.id).eq("id", x.courseId).maybeSingle();
        if (!c) return { ok: false, error: "Choose a gift first." };
        courseId = c.id as string; subtotal = Number(c.price);
      } else {
        // Class gift certificates use the booking amounts; coffee gift cards use the shop's
        const amounts = x.shop ? (await import("@/lib/shop/core")).readShop(org.rawSettings).giftAmounts : org.settings.gift_amounts;
        subtotal = amounts.includes(Math.round(Number(x.amount))) ? Math.round(Number(x.amount)) : 0;
      }
      if (subtotal <= 0) return { ok: false, error: "Choose a gift first." };
    }
    const q = await quoteOffer(db, org, { code, place: x.place, courseId, subtotal, email: x.email ?? null });
    if (!q.ok) return q;
    return { ok: true, code: q.offer.code, discount: q.discount, label: q.offer.headline || q.offer.description || offerShort(q.offer) };
  } catch (e) { return { ok: false, error: notReady(String(e)) ? "Codes aren't set up yet." : "Couldn't check that code — try again." }; }
}
