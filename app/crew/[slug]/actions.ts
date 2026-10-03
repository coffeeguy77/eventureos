"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { crewOrg, crewSession, resyncJobCalendar, tellOffice, type CrewSession } from "@/lib/crew/server";
import { clashes, fmtHours } from "@/lib/crew/shifts";
import { myShifts } from "@/lib/crew/data";
import { fmtDate, todayISO } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Sign in with an emailed code (codes work inside the installed app,  */
/* where a sign-in link would open in the browser instead)             */
/* ------------------------------------------------------------------ */
export type CrewSignInState = { step: "email" | "code"; email?: string; error?: string; message?: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function friendly(msg: string) {
  if (/security purposes|only request this after|rate limit/i.test(msg)) return "Please wait a minute before asking for another code.";
  if (/expired|invalid/i.test(msg)) return "That code didn't work — it may have expired. Check the latest email or ask for a new code.";
  return msg;
}

export async function crewSignIn(prev: CrewSignInState, form: FormData): Promise<CrewSignInState> {
  const slug = String(form.get("slug") ?? "");
  const org = await crewOrg(slug);
  if (!org) return { step: "email", error: "This staff app link isn't valid." };
  const intent = String(form.get("intent") ?? "send");
  if (intent === "restart") return { step: "email" };
  const email = String(form.get("email") ?? prev.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { step: "email", email, error: "Enter a valid email address." };

  if (intent === "send" || intent === "resend") {
    // Only people on the staff list get a code
    const db = createServiceClient();
    const { data: m } = await db.from("crew_members").select("id").eq("organisation_id", org.id).eq("active", true).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (!m) return { step: "email", email, error: `${email} isn't on ${org.name}'s staff list. Ask the office to add you, using this email.` };
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return { step: intent === "resend" ? "code" : "email", email, error: friendly(error.message) };
    return { step: "code", email, message: `We've emailed a sign-in code to ${email}.` };
  }
  if (intent === "verify") {
    const token = String(form.get("code") ?? "").replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Enter the code from the email (numbers only)." };
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) return { step: "code", email, error: friendly(error.message) };
    const s = await crewSession(slug);
    if (!s) { await supabase.auth.signOut(); return { step: "email", email, error: `${email} isn't on ${org.name}'s staff list.` }; }
    redirect(`/crew/${slug}`);
  }
  return { step: "email", error: "Something went wrong — please try again." };
}

export async function crewSignOut(form: FormData) {
  const slug = String(form.get("slug") ?? "");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/crew/${slug}/login`);
}

/* ------------------------------------------------------------------ */
/* Shifts                                                              */
/* ------------------------------------------------------------------ */
export type CrewResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function act(slug: string, fn: (s: CrewSession) => Promise<string | void>): Promise<CrewResult> {
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

async function myShiftRow(s: CrewSession, shiftId: string) {
  if (!UUID.test(shiftId)) throw new Error("Refresh and try again.");
  const { data } = await s.db.from("event_crew").select("id, status, event_id, board_posted_at, event:events(id, name, event_date, setup_time, start_time, finish_time, status)")
    .eq("id", shiftId).eq("organisation_id", s.org.id).eq("crew_member_id", s.member.id).maybeSingle();
  if (!data) throw new Error("That shift isn't yours any more.");
  return data as unknown as { id: string; status: string; event_id: string; board_posted_at: string | null; event: { id: string; name: string; event_date: string | null; setup_time: string | null; start_time: string | null; finish_time: string | null; status: string } };
}
const when = (d: string | null) => (d ? fmtDate(d) : "date TBC");

export async function acceptShift(slug: string, shiftId: string) {
  return act(slug, async (s) => {
    const r = await myShiftRow(s, shiftId);
    if (r.status === "confirmed") return "You're already on this one.";
    if (r.status !== "offered") throw new Error("This one isn't waiting for you to accept.");
    await s.db.from("event_crew").update({ status: "confirmed", responded_at: new Date().toISOString() }).eq("id", r.id);
    await tellOffice(s, { type: "crew.accepted", title: `${s.member.name} accepted ${r.event.name}`, eventId: r.event_id, summary: `${s.member.name} accepted the shift on ${r.event.name} (${when(r.event.event_date)}) in the staff app` });
    return "Shift accepted — see you there.";
  });
}

export async function declineShift(slug: string, shiftId: string, reason: string) {
  return act(slug, async (s) => {
    const r = await myShiftRow(s, shiftId);
    if (r.status !== "offered") throw new Error(r.status === "confirmed" ? "You've already accepted this shift — post it on the job board so someone can take it." : "Nothing to decline.");
    await s.db.from("event_crew").delete().eq("id", r.id);
    await tellOffice(s, { type: "crew.declined", title: `${s.member.name} can't do ${r.event.name}`, body: reason.trim().slice(0, 300) || null, eventId: r.event_id,
      summary: `${s.member.name} declined the shift on ${r.event.name} (${when(r.event.event_date)})${reason.trim() ? `: ${reason.trim().slice(0, 200)}` : ""}` });
    await resyncJobCalendar(s.db, s.org.id, r.event_id);
    return "Thanks for letting us know.";
  });
}

export async function postToBoard(slug: string, shiftId: string, note: string) {
  return act(slug, async (s) => {
    const r = await myShiftRow(s, shiftId);
    if (r.status !== "confirmed") throw new Error("Only accepted shifts can go on the job board.");
    await s.db.from("event_crew").update({ board_posted_at: new Date().toISOString(), board_note: note.trim().slice(0, 300) || null }).eq("id", r.id);
    await tellOffice(s, { type: "crew.board_posted", title: `${s.member.name} is looking for cover for ${r.event.name}`, body: note.trim() || null, eventId: r.event_id,
      summary: `${s.member.name} put their shift on ${r.event.name} (${when(r.event.event_date)}) on the job board` });
    return "Posted. It's still your shift until someone takes it.";
  });
}

export async function takeOffBoard(slug: string, shiftId: string) {
  return act(slug, async (s) => {
    const r = await myShiftRow(s, shiftId);
    await s.db.from("event_crew").update({ board_posted_at: null, board_note: null }).eq("id", r.id);
    return "Taken off the job board.";
  });
}

/** Check I'm free for a job: not away that day, and not on a clashing shift. */
async function assertFree(s: CrewSession, job: { id: string; name: string; event_date: string | null; setup_time: string | null; start_time: string | null; finish_time: string | null }) {
  if (job.event_date) {
    const { data: away } = await s.db.from("staff_unavailability").select("id").eq("crew_member_id", s.member.id).lte("starts_on", job.event_date).gte("ends_on", job.event_date).limit(1);
    if (away?.length) throw new Error(`You've marked yourself away on ${fmtDate(job.event_date)}. Remove that first if you can work.`);
  }
  const mine = await myShifts(s, { from: job.event_date ?? undefined, to: job.event_date ?? undefined });
  const clash = mine.find((m) => m.status !== "interested" && m.job.id !== job.id && clashes(m.job, job));
  if (clash) throw new Error(`That clashes with your shift on ${clash.job.name} (${clash.start ?? "?"}–${clash.finish ?? "?"}).`);
}

export async function takeSwap(slug: string, shiftId: string) {
  return act(slug, async (s) => {
    if (!UUID.test(shiftId)) throw new Error("Refresh and try again.");
    const { data: r } = await s.db.from("event_crew").select("id, crew_member_id, event_id, board_posted_at, status, giver:crew_members(name), event:events(id, name, event_date, setup_time, start_time, finish_time, status)")
      .eq("id", shiftId).eq("organisation_id", s.org.id).maybeSingle();
    const row = r as unknown as { id: string; crew_member_id: string; event_id: string; board_posted_at: string | null; status: string; giver: { name: string } | null;
      event: { id: string; name: string; event_date: string | null; setup_time: string | null; start_time: string | null; finish_time: string | null; status: string } } | null;
    if (!row || !row.board_posted_at || row.status !== "confirmed") throw new Error("Someone else has already taken this shift.");
    if (row.crew_member_id === s.member.id) throw new Error("That's your own shift.");
    await assertFree(s, row.event);
    // If I'd put my hand up for this job, that row goes — I'm taking the real shift
    await s.db.from("event_crew").delete().eq("event_id", row.event_id).eq("crew_member_id", s.member.id).eq("status", "interested");
    const { data: moved, error } = await s.db.from("event_crew").update({
      crew_member_id: s.member.id, board_posted_at: null, board_note: null, calendar_response: null, calendar_response_at: null, responded_at: new Date().toISOString(),
      hours_override: null, rate_override: null,
    }).eq("id", row.id).not("board_posted_at", "is", null).select("id");
    if (error) throw new Error(error.code === "23505" ? "You're already on this job." : error.message);
    if (!moved?.length) throw new Error("Someone else has just taken this shift.");
    await tellOffice(s, { type: "crew.swapped", title: `${s.member.name} took ${row.giver?.name ?? "a"}'s shift on ${row.event.name}`, eventId: row.event_id,
      summary: `${s.member.name} took over ${row.giver?.name ?? "a team member"}'s shift on ${row.event.name} (${when(row.event.event_date)}) from the job board` });
    await resyncJobCalendar(s.db, s.org.id, row.event_id);
    return "It's yours — it'll show in your calendar shortly.";
  });
}

export async function takeOpenShift(slug: string, eventId: string) {
  return act(slug, async (s) => {
    if (!UUID.test(eventId)) throw new Error("Refresh and try again.");
    const { data: e } = await s.db.from("events").select("id, name, event_date, setup_time, start_time, finish_time, status, crew_needed").eq("id", eventId).eq("organisation_id", s.org.id).maybeSingle();
    if (!e || e.status !== "confirmed") throw new Error("This job isn't open for shifts.");
    const { count } = await s.db.from("event_crew").select("id", { count: "exact", head: true }).eq("event_id", eventId).in("status", ["offered", "confirmed"]);
    if ((count ?? 0) >= (e.crew_needed ?? 1)) throw new Error("This job has just been filled.");
    await assertFree(s, e);
    const { error } = await s.db.from("event_crew").upsert({ organisation_id: s.org.id, event_id: eventId, crew_member_id: s.member.id, status: "confirmed", responded_at: new Date().toISOString(), role: s.member.role },
      { onConflict: "event_id,crew_member_id" });
    if (error) throw new Error(error.message);
    await tellOffice(s, { type: "crew.took_open", title: `${s.member.name} took a shift on ${e.name}`, eventId, summary: `${s.member.name} took an open shift on ${e.name} (${when(e.event_date)})` });
    await resyncJobCalendar(s.db, s.org.id, eventId);
    return "It's yours — it'll show in your calendar shortly.";
  });
}

/** Put your hand up for a TBC job (or take it back). Not guaranteed: whoever ranks highest and is free when it's confirmed gets it. */
export async function setInterest(slug: string, eventId: string, on: boolean) {
  return act(slug, async (s) => {
    if (!UUID.test(eventId)) throw new Error("Refresh and try again.");
    const { data: e } = await s.db.from("events").select("id, name, event_date, status").eq("id", eventId).eq("organisation_id", s.org.id).maybeSingle();
    if (!e || e.status === "cancelled" || e.status === "completed") throw new Error("This job isn't available.");
    if (!on) {
      await s.db.from("event_crew").delete().eq("event_id", eventId).eq("crew_member_id", s.member.id).eq("status", "interested");
      return "Hand down.";
    }
    if (e.event_date) {
      const { data: away } = await s.db.from("staff_unavailability").select("id").eq("crew_member_id", s.member.id).lte("starts_on", e.event_date).gte("ends_on", e.event_date).limit(1);
      if (away?.length) throw new Error(`You're marked away on ${fmtDate(e.event_date)}.`);
    }
    const { error } = await s.db.from("event_crew").insert({ organisation_id: s.org.id, event_id: eventId, crew_member_id: s.member.id, status: "interested", role: s.member.role });
    if (error && error.code !== "23505") throw new Error(error.message);
    return "Hand up! If it's confirmed and you're free, you may get the shift.";
  });
}

export async function claimExtraHours(slug: string, shiftId: string, hours: number, reason: string) {
  return act(slug, async (s) => {
    const r = await myShiftRow(s, shiftId);
    if (r.status !== "confirmed") throw new Error("You can only add hours to a shift you worked.");
    const h = Math.round(Number(hours) * 4) / 4;
    if (!Number.isFinite(h) || h <= 0 || h > 12) throw new Error("Enter the extra hours (e.g. 0.5 or 1.25).");
    const why = reason.trim();
    if (why.length < 3) throw new Error("Say why the shift went longer.");
    const { error } = await s.db.from("staff_hour_claims").insert({ organisation_id: s.org.id, event_crew_id: r.id, hours: h, reason: why.slice(0, 500) });
    if (error) throw new Error(error.message);
    await tellOffice(s, { type: "crew.hours_claimed", title: `${s.member.name} added ${fmtHours(h)} on ${r.event.name}`, body: why.slice(0, 300), eventId: r.event_id, link: "/wages",
      summary: `${s.member.name} asked for ${fmtHours(h)} extra on ${r.event.name}: ${why.slice(0, 200)}` });
    return "Sent for approval.";
  });
}

/* ------------------------------------------------------------------ */
/* Away                                                                */
/* ------------------------------------------------------------------ */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addAway(slug: string, from: string, to: string, note: string) {
  return act(slug, async (s) => {
    if (!DATE.test(from) || !DATE.test(to || from)) throw new Error("Choose the dates.");
    const end = to || from;
    if (end < from) throw new Error("The end date is before the start date.");
    if (end < todayISO(s.org.timezone)) throw new Error("Those dates have passed.");
    const mine = await myShifts(s, { from, to: end });
    const booked = mine.filter((m) => m.status !== "interested");
    if (booked.length) {
      throw new Error(`You're working ${booked.map((b) => `${b.job.name} (${b.job.event_date ? fmtDate(b.job.event_date) : "TBC"})`).join(", ")} then. Put ${booked.length === 1 ? "it" : "them"} on the job board — once someone takes ${booked.length === 1 ? "it" : "them"} you can mark yourself away.`);
    }
    const { error } = await s.db.from("staff_unavailability").insert({ organisation_id: s.org.id, crew_member_id: s.member.id, starts_on: from, ends_on: end, note: note.trim().slice(0, 300) || null });
    if (error) throw new Error(error.message);
    // Hands up for TBC jobs in that window come down
    const hands = mine.filter((m) => m.status === "interested").map((m) => m.id);
    if (hands.length) await s.db.from("event_crew").delete().in("id", hands);
    await tellOffice(s, { type: "crew.away", title: `${s.member.name} is away ${from === end ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(end)}`}`, body: note.trim() || null, link: "/settings/team",
      summary: `${s.member.name} marked themselves unavailable ${from === end ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(end)}`}` });
    return hands.length ? `Saved. Your hand is down on ${hands.length} TBC job${hands.length === 1 ? "" : "s"} in those dates.` : "Saved.";
  });
}

export async function removeAway(slug: string, id: string) {
  return act(slug, async (s) => {
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    await s.db.from("staff_unavailability").delete().eq("id", id).eq("crew_member_id", s.member.id);
    return "Removed.";
  });
}
