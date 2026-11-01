"use server";

import { revalidatePath } from "next/cache";
import { crewSession, tellOffice, type CrewSession } from "@/lib/crew/server";
import { fmtDate, todayISO } from "@/lib/format";
import { clockOff, clockOn, endBreak, startBreak } from "@/lib/roster/clock";
import { LEAVE_LABEL } from "@/lib/roster/settings";

export type RosterAppResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

async function act(slug: string, fn: (s: CrewSession) => Promise<string | void>): Promise<RosterAppResult> {
  try {
    const s = await crewSession(slug);
    if (!s) return { ok: false, error: "You've been signed out — sign in again." };
    const message = await fn(s);
    revalidatePath(`/crew/${slug}`, "layout");
    return { ok: true, message: message || undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function orgFor(s: CrewSession) {
  const { data } = await s.db.from("organisations").select("id, timezone, settings").eq("id", s.org.id).single();
  return data as { id: string; timezone: string; settings: unknown };
}

export async function clock(slug: string, what: "on" | "break" | "back" | "off", where: { lat: number; lng: number } | null, eventCrewId: string | null = null, photo: string | null = null) {
  return act(slug, async (s) => {
    const loc = where && Number.isFinite(where.lat) && Number.isFinite(where.lng) ? { lat: Number(where.lat), lng: Number(where.lng) } : null;
    if (what === "break") return startBreak(s.db, s.org.id, s.member.id);
    if (what === "back") return endBreak(s.db, s.org.id, s.member.id);
    const org = await orgFor(s);
    if (eventCrewId) {
      if (!UUID.test(eventCrewId)) throw new Error("Refresh and try again.");
      const { data: ec } = await s.db.from("event_crew").select("id").eq("id", eventCrewId).eq("crew_member_id", s.member.id).eq("organisation_id", s.org.id).maybeSingle();
      if (!ec) throw new Error("That event shift isn't yours.");
    }
    const pic = typeof photo === "string" && photo.length < 800_000 ? photo : null;
    return what === "on" ? clockOn(s.db, org, s.member.id, { source: "phone", where: loc, eventCrewId, photo: pic }) : clockOff(s.db, org, s.member.id, { source: "phone", where: loc, photo: pic });
  });
}

/** Replace my regular weekly availability. */
export async function saveAvailability(slug: string, rows: { weekday: number; available: boolean; start: string | null; finish: string | null }[]) {
  return act(slug, async (s) => {
    const clean = rows.filter((r) => Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6).slice(0, 21).map((r) => {
      const start = r.start && TIME.test(r.start) ? r.start : null, finish = r.finish && TIME.test(r.finish) ? r.finish : null;
      if ((start && !finish) || (!start && finish)) throw new Error("Give both a from and an until time, or neither (all day).");
      if (start && finish && finish <= start) throw new Error("An until time is before its from time.");
      return { organisation_id: s.org.id, crew_member_id: s.member.id, weekday: r.weekday, available: !!r.available, start_time: start, finish_time: finish };
    });
    await s.db.from("staff_availability").delete().eq("crew_member_id", s.member.id).eq("organisation_id", s.org.id);
    if (clean.length) {
      const { error } = await s.db.from("staff_availability").insert(clean);
      if (error) throw new Error(error.message);
    }
    await tellOffice(s, { type: "roster.availability", title: `${s.member.name} updated their availability`, link: "/roster" });
    return "Availability saved.";
  });
}

export async function requestLeave(slug: string, r: { from: string; to: string; type: string; hours: number | null; note: string }) {
  return act(slug, async (s) => {
    if (!DATE.test(r.from) || !DATE.test(r.to || r.from)) throw new Error("Choose the dates.");
    const to = r.to || r.from;
    if (to < r.from) throw new Error("The end date is before the start date.");
    if (!LEAVE_LABEL[r.type]) throw new Error("Choose the kind of leave.");
    const hours = r.hours == null || !Number.isFinite(r.hours) ? null : Math.max(0, Math.min(500, r.hours));
    const { error } = await s.db.from("staff_unavailability").insert({ organisation_id: s.org.id, crew_member_id: s.member.id, starts_on: r.from, ends_on: to, leave_type: r.type, status: "pending", hours, note: r.note.trim().slice(0, 300) || null });
    if (error) throw new Error(error.message);
    const when = r.from === to ? fmtDate(r.from) : `${fmtDate(r.from)} – ${fmtDate(to)}`;
    await tellOffice(s, { type: "roster.leave_request", title: `${s.member.name} asked for ${LEAVE_LABEL[r.type].toLowerCase()}: ${when}`, body: r.note.trim() || null, link: "/roster" });
    return "Sent — the office will approve it.";
  });
}

export async function cancelLeave(slug: string, id: string) {
  return act(slug, async (s) => {
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    await s.db.from("staff_unavailability").delete().eq("id", id).eq("crew_member_id", s.member.id).eq("status", "pending");
    return "Request withdrawn.";
  });
}

/** Give a roster shift away (anyone, or a particular person), optionally swapping one of theirs back. */
export async function offerShift(slug: string, shiftId: string, note: string) {
  return act(slug, async (s) => {
    if (!UUID.test(shiftId)) throw new Error("Refresh and try again.");
    const { data: sh } = await s.db.from("staff_shifts").select("id, shift_date, start_time, roster, published_at").eq("id", shiftId).eq("organisation_id", s.org.id).eq("crew_member_id", s.member.id).maybeSingle();
    if (!sh?.roster || !sh.published_at) throw new Error("That shift isn't yours any more.");
    if ((sh.shift_date as string) < todayISO(s.org.timezone)) throw new Error("That shift has passed.");
    const { error } = await s.db.from("staff_shift_offers").insert({ organisation_id: s.org.id, staff_shift_id: shiftId, from_member_id: s.member.id, note: note.trim().slice(0, 300) || null });
    if (error) throw new Error(/one_live/.test(error.message) ? "This shift is already up for grabs." : error.message);
    await tellOffice(s, { type: "roster.offer", title: `${s.member.name} is looking for cover on ${fmtDate(sh.shift_date as string)}`, body: note.trim() || null, link: "/roster" });
    return "Posted — anyone on the roster can pick it up. It's still yours until the office approves the change.";
  });
}

export async function cancelOffer(slug: string, offerId: string) {
  return act(slug, async (s) => {
    if (!UUID.test(offerId)) throw new Error("Refresh and try again.");
    await s.db.from("staff_shift_offers").update({ status: "cancelled" }).eq("id", offerId).eq("from_member_id", s.member.id).in("status", ["open", "claimed"]);
    return "Taken back — the shift is still yours.";
  });
}

/** Pick up someone else's shift; the office approves before it moves. */
export async function claimOffer(slug: string, offerId: string) {
  return act(slug, async (s) => {
    if (!UUID.test(offerId)) throw new Error("Refresh and try again.");
    const { data: o } = await s.db.from("staff_shift_offers").select("id, status, from_member_id, to_member_id, shift:staff_shifts!staff_shift_offers_staff_shift_id_fkey(shift_date, start_time, finish_time)").eq("id", offerId).eq("organisation_id", s.org.id).maybeSingle();
    if (!o || o.status !== "open") throw new Error("Someone else has already picked it up.");
    if (o.from_member_id === s.member.id) throw new Error("That's your own shift.");
    if (o.to_member_id && o.to_member_id !== s.member.id) throw new Error("That shift was offered to someone else.");
    const sh = (o as unknown as { shift: { shift_date: string; start_time: string; finish_time: string } | null }).shift;
    if (sh) {
      const { data: clash } = await s.db.from("staff_shifts").select("id").eq("organisation_id", s.org.id).eq("crew_member_id", s.member.id).eq("shift_date", sh.shift_date).lt("start_time", sh.finish_time).gt("finish_time", sh.start_time).limit(1);
      if (clash?.length) throw new Error("You're already working then.");
    }
    const { data: done } = await s.db.from("staff_shift_offers").update({ status: "claimed", to_member_id: s.member.id, claimed_at: new Date().toISOString() }).eq("id", offerId).eq("status", "open").select("id");
    if (!done?.length) throw new Error("Someone else has just picked it up.");
    await tellOffice(s, { type: "roster.claimed", title: `${s.member.name} will cover a shift${sh ? ` on ${fmtDate(sh.shift_date)}` : ""} — approve it`, link: "/roster" });
    return "Thanks — the office will approve it, then it's yours.";
  });
}

/** Take an open shift (no one rostered yet). It's yours straight away; the office is told. */
export async function takeOpenRosterShift(slug: string, shiftId: string) {
  return act(slug, async (s) => {
    if (!UUID.test(shiftId)) throw new Error("Refresh and try again.");
    const { data: sh } = await s.db.from("staff_shifts").select("id, shift_date, start_time, finish_time").eq("id", shiftId).eq("organisation_id", s.org.id).eq("roster", true).is("crew_member_id", null).not("published_at", "is", null).maybeSingle();
    if (!sh) throw new Error("Someone else has already taken it.");
    const { data: clash } = await s.db.from("staff_shifts").select("id").eq("organisation_id", s.org.id).eq("crew_member_id", s.member.id).eq("shift_date", sh.shift_date).lt("start_time", sh.finish_time).gt("finish_time", sh.start_time).limit(1);
    if (clash?.length) throw new Error("You're already working then.");
    const { data: done } = await s.db.from("staff_shifts").update({ crew_member_id: s.member.id, updated_at: new Date().toISOString() }).eq("id", shiftId).is("crew_member_id", null).select("id");
    if (!done?.length) throw new Error("Someone else has just taken it.");
    await tellOffice(s, { type: "roster.open_taken", title: `${s.member.name} took the open shift on ${fmtDate(sh.shift_date as string)} ${String(sh.start_time).slice(0, 5)}`, link: "/roster" });
    return "It's yours.";
  });
}
