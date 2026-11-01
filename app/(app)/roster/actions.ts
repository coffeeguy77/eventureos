"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { addDaysISO, fmtDate } from "@/lib/format";
import { readRosterSettings, LEAVE_LABEL } from "@/lib/roster/settings";
import { readRules, type AwardRules, type Category } from "@/lib/roster/award";
import { pinHash } from "@/lib/roster/pin";
import { emailStaff, shiftLine } from "@/lib/roster/notify";
import { removeShiftCalendar, syncShiftCalendar } from "@/lib/crew/custom-shifts";

export type RosterResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

async function office() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can change the roster.");
  return ctx;
}
async function wrap(fn: () => Promise<string | { message?: string; id?: string } | void>): Promise<RosterResult> {
  try {
    const r = await fn();
    revalidatePath("/roster", "layout");
    return typeof r === "string" ? { ok: true, message: r } : { ok: true, ...(r ?? {}) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
const dbErr = (m: string) => (/roster_areas|on_roster|break_minutes|published_at|staff_availability|staff_time_entries|public_holidays|staff_shift_offers|employment_type/.test(m) ? "Run the latest database update (0084_cafe_roster.sql) first." : m);

export interface RosterShiftInput { id?: string | null; crewId: string | null; areaId: string | null; date: string; start: string; finish: string; breakMinutes: number; notes: string | null }

/** Add or change a roster shift. Changes to a published shift wait until the roster is published again. */
export async function saveRosterShift(input: RosterShiftInput) {
  return wrap(async () => {
    const { supabase, org, user } = await office();
    if (input.crewId && !UUID.test(input.crewId)) throw new Error("Choose who's working it.");
    if (input.areaId && !UUID.test(input.areaId)) throw new Error("Choose an area.");
    if (!DATE.test(input.date)) throw new Error("Choose the date.");
    if (!TIME.test(input.start) || !TIME.test(input.finish)) throw new Error("Check the start and finish times.");
    if (input.start === input.finish) throw new Error("The shift starts and finishes at the same time.");
    const brk = Math.max(0, Math.min(240, Math.round(Number(input.breakMinutes) || 0)));
    let title = "Shift";
    if (input.areaId) {
      const { data: a } = await supabase.from("roster_areas").select("name").eq("id", input.areaId).eq("organisation_id", org.id).maybeSingle();
      if (!a) throw new Error("That area no longer exists.");
      title = a.name as string;
    }
    const row = { crew_member_id: input.crewId, area_id: input.areaId, title, shift_date: input.date, start_time: input.start, finish_time: input.finish, break_minutes: brk, notes: input.notes?.trim().slice(0, 2000) || null };
    if (input.id) {
      if (!UUID.test(input.id)) throw new Error("Refresh and try again.");
      const { data: before } = await supabase.from("staff_shifts").select("published_at, payment_id").eq("id", input.id).eq("organisation_id", org.id).eq("roster", true).maybeSingle();
      if (!before) throw new Error("That shift no longer exists.");
      const { error } = await supabase.from("staff_shifts").update({ ...row, changed_since_publish: !!before.published_at, updated_at: new Date().toISOString() }).eq("id", input.id);
      if (error) throw new Error(dbErr(error.message));
      return { id: input.id };
    }
    const { data, error } = await supabase.from("staff_shifts").insert({ ...row, organisation_id: org.id, roster: true, created_by: user.id }).select("id").single();
    if (error) throw new Error(dbErr(error.message));
    return { id: data.id as string };
  });
}

/** Remove a roster shift. If the person had already been told about it, they're emailed that it's off. */
export async function deleteRosterShift(id: string) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: s } = await supabase.from("staff_shifts").select("id, crew_member_id, shift_date, start_time, finish_time, break_minutes, published_at, area:roster_areas(name)").eq("id", id).eq("organisation_id", org.id).eq("roster", true).maybeSingle();
    if (!s) return;
    const { count } = await supabase.from("staff_time_entries").select("id", { count: "exact", head: true }).eq("staff_shift_id", id);
    if (count) throw new Error("Someone has clocked on for this shift — it can't be deleted. Change the times instead.");
    await removeShiftCalendar(supabase, org.id, [id]);
    const { error } = await supabase.from("staff_shifts").delete().eq("id", id);
    if (error) throw new Error(error.message);
    const area = (s as unknown as { area: { name: string } | null }).area?.name ?? null;
    if (s.published_at && s.crew_member_id) {
      await emailStaff(supabase, org.id, [{ memberId: s.crew_member_id as string, subject: "A shift has been taken off your roster", intro: "This shift is no longer on your roster:",
        lines: [shiftLine({ ...(s as { shift_date: string; start_time: string; finish_time: string; break_minutes: number }), area })] }]);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "roster.shift_removed", entityType: "crew_member", entityId: s.crew_member_id as string, summary: `${actorName(profile)} removed a published shift on ${fmtDate(s.shift_date as string)}` });
    }
  });
}

/** Copy last week's shifts into this week as drafts (skipping any that are already there). */
export async function copyPreviousWeek(monday: string) {
  return wrap(async () => {
    const { supabase, org, user } = await office();
    if (!DATE.test(monday)) throw new Error("Choose a week.");
    const prev = addDaysISO(monday, -7);
    const [{ data: last }, { data: now }] = await Promise.all([
      supabase.from("staff_shifts").select("crew_member_id, area_id, title, shift_date, start_time, finish_time, break_minutes, notes").eq("organisation_id", org.id).eq("roster", true).gte("shift_date", prev).lt("shift_date", monday),
      supabase.from("staff_shifts").select("crew_member_id, shift_date, start_time").eq("organisation_id", org.id).eq("roster", true).gte("shift_date", monday).lte("shift_date", addDaysISO(monday, 6)),
    ]);
    const have = new Set(((now ?? []) as { crew_member_id: string | null; shift_date: string; start_time: string }[]).map((s) => `${s.crew_member_id}|${s.shift_date}|${s.start_time.slice(0, 5)}`));
    const rows = ((last ?? []) as { crew_member_id: string | null; area_id: string | null; title: string; shift_date: string; start_time: string; finish_time: string; break_minutes: number; notes: string | null }[])
      .map((s) => ({ ...s, shift_date: addDaysISO(s.shift_date, 7) }))
      .filter((s) => !have.has(`${s.crew_member_id}|${s.shift_date}|${s.start_time.slice(0, 5)}`))
      .map((s) => ({ ...s, organisation_id: org.id, roster: true, created_by: user.id }));
    if (!rows.length) return (last ?? []).length ? "Those shifts are already in this week." : "Last week has no shifts to copy.";
    const { error } = await supabase.from("staff_shifts").insert(rows);
    if (error) throw new Error(dbErr(error.message));
    return `Copied ${rows.length} shift${rows.length === 1 ? "" : "s"} from last week — check them, then publish.`;
  });
}

/** Publish the week: staff see their shifts in the app, and anyone with new or changed shifts gets an email. */
export async function publishWeek(monday: string, email: boolean, sms = false) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!DATE.test(monday)) throw new Error("Choose a week.");
    const sunday = addDaysISO(monday, 6);
    const { data } = await supabase.from("staff_shifts").select("id, crew_member_id, shift_date, start_time, finish_time, break_minutes, notes, published_at, changed_since_publish, area:roster_areas(name)")
      .eq("organisation_id", org.id).eq("roster", true).gte("shift_date", monday).lte("shift_date", sunday).order("shift_date").order("start_time");
    type S = { id: string; crew_member_id: string | null; shift_date: string; start_time: string; finish_time: string; break_minutes: number; notes: string | null; published_at: string | null; changed_since_publish: boolean; area: { name: string } | null };
    const all = (data ?? []) as unknown as S[];
    const pending = all.filter((s) => !s.published_at || s.changed_since_publish);
    if (!pending.length) return "Nothing new to publish this week.";
    const { error } = await supabase.from("staff_shifts").update({ published_at: new Date().toISOString(), changed_since_publish: false }).in("id", pending.map((s) => s.id));
    if (error) throw new Error(dbErr(error.message));
    const settings = readRosterSettings(org.settings);
    if (settings.google_calendar) await syncShiftCalendar(supabase, org.id, org.timezone, pending.filter((s) => s.crew_member_id).map((s) => s.id));
    let sent = 0;
    if (email) {
      const people = [...new Set(pending.map((s) => s.crew_member_id).filter((x): x is string => !!x))];
      sent = await emailStaff(supabase, org.id, people.map((m) => ({
        memberId: m, subject: `Your roster: week of ${fmtDate(monday, "short")}`,
        intro: all.some((s) => s.crew_member_id === m && s.published_at && !pending.includes(s)) ? "Your roster for this week has changed. Here's the whole week:" : "Here are your shifts for the week:",
        lines: all.filter((s) => s.crew_member_id === m).map((s) => shiftLine({ ...s, area: s.area?.name ?? null })),
      })));
    }
    let texted = "";
    if (sms) {
      const { textRoster } = await import("@/lib/roster/sms");
      const people = [...new Set(pending.map((s) => s.crew_member_id).filter((x): x is string => !!x))];
      const r = await textRoster(org.id, people, monday).catch((e) => ({ sent: [] as string[], failed: [e instanceof Error ? e.message : String(e)] }));
      texted = ` · texted ${r.sent.length}${r.failed.length ? ` (not texted: ${r.failed.join(", ")})` : ""}`;
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "roster.published", entityType: "organisation", entityId: org.id,
      summary: `${actorName(profile)} published the roster for the week of ${fmtDate(monday)} (${pending.length} shift${pending.length === 1 ? "" : "s"})` });
    return `Published ${pending.length} shift${pending.length === 1 ? "" : "s"}${email ? ` — ${sent} ${sent === 1 ? "person" : "people"} emailed` : ""}${texted}.`;
  });
}

// ---------------------------------------------------------------- areas & people

export async function saveArea(input: { id?: string | null; name: string; colour: string | null }) {
  return wrap(async () => {
    const { supabase, org } = await office();
    const name = input.name.trim().slice(0, 60);
    if (!name) throw new Error("Name the area, e.g. Barista.");
    const colour = input.colour && /^#[0-9a-f]{6}$/i.test(input.colour) ? input.colour : null;
    if (input.id) {
      if (!UUID.test(input.id)) throw new Error("Refresh and try again.");
      const { error } = await supabase.from("roster_areas").update({ name, colour }).eq("id", input.id).eq("organisation_id", org.id);
      if (error) throw new Error(dbErr(error.message));
      await supabase.from("staff_shifts").update({ title: name }).eq("area_id", input.id).eq("organisation_id", org.id);
      return "Area saved.";
    }
    const { count } = await supabase.from("roster_areas").select("id", { count: "exact", head: true }).eq("organisation_id", org.id);
    const { error } = await supabase.from("roster_areas").insert({ organisation_id: org.id, name, colour, position: count ?? 0 });
    if (error) throw new Error(dbErr(error.message));
    return `${name} added.`;
  });
}

export async function archiveArea(id: string) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    await supabase.from("roster_areas").update({ active: false }).eq("id", id).eq("organisation_id", org.id);
    return "Area hidden. Shifts already in it keep it.";
  });
}

export async function saveRosterPerson(id: string, input: { onRoster: boolean; employmentType: "casual" | "part_time" | "full_time"; areaId: string | null; xeroEmployeeId: string | null; hourlyRate: number | null; flat?: boolean }) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    if (!["casual", "part_time", "full_time"].includes(input.employmentType)) throw new Error("Choose casual, part-time or full-time.");
    if (input.areaId && !UUID.test(input.areaId)) throw new Error("Choose an area.");
    if (input.hourlyRate != null && (!Number.isFinite(input.hourlyRate) || input.hourlyRate < 0 || input.hourlyRate > 500)) throw new Error("Check the hourly rate.");
    const { error } = await supabase.from("crew_members").update({
      on_roster: input.onRoster, employment_type: input.employmentType, default_area_id: input.areaId, xero_employee_id: input.xeroEmployeeId?.trim() || null,
      hourly_rate: input.hourlyRate == null ? null : Math.round(input.hourlyRate * 100) / 100,
    }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(dbErr(error.message));
    if (input.flat !== undefined) {
      const cur = readRosterSettings(org.settings).flat.filter((x) => x !== id);
      await saveSettings({ flat: input.flat ? [...cur, id] : cur });
    }
    return input.xeroEmployeeId ? "Saved." : "Saved — not on Xero Payroll, so their café shifts are paid through Wages.";
  });
}

/** A 4-digit PIN for clocking on at the café iPad. */
export async function setKioskPin(id: string, pin: string | null) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    if (pin != null && !/^\d{4}$/.test(pin)) throw new Error("The PIN is 4 digits.");
    const { error } = await supabase.from("crew_members").update({ kiosk_pin_hash: pin ? pinHash(org.id, id, pin) : null }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(dbErr(error.message));
    return pin ? "PIN set — tell them their PIN." : "PIN removed.";
  });
}

// ---------------------------------------------------------------- requests: leave and shift swaps

export async function decideLeave(id: string, approve: boolean, reason: string | null) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: l } = await supabase.from("staff_unavailability").select("id, crew_member_id, starts_on, ends_on, leave_type, status, member:crew_members(name)").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!l) throw new Error("That request no longer exists.");
    const { error } = await supabase.from("staff_unavailability").update({ status: approve ? "approved" : "declined", decided_by: user.id, decided_at: new Date().toISOString(), decline_reason: approve ? null : reason?.trim().slice(0, 300) || null }).eq("id", id);
    if (error) throw new Error(dbErr(error.message));
    const name = (l as unknown as { member: { name: string } | null }).member?.name ?? "them";
    const what = `${LEAVE_LABEL[l.leave_type as string] ?? "Leave"} ${fmtDate(l.starts_on as string, "short")}${l.ends_on !== l.starts_on ? `–${fmtDate(l.ends_on as string, "short")}` : ""}`;
    await emailStaff(supabase, org.id, [{ memberId: l.crew_member_id as string, subject: approve ? "Your leave is approved" : "Your leave request", intro: approve ? `${what} is approved.` : `${what} wasn't approved.${reason ? ` ${reason}` : ""}`, lines: [] }]);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: approve ? "roster.leave_approved" : "roster.leave_declined", entityType: "crew_member", entityId: l.crew_member_id as string, summary: `${actorName(profile)} ${approve ? "approved" : "declined"} ${name}'s ${what}` });
    return approve ? `Approved for ${name}.` : `Declined — ${name} has been told.`;
  });
}

/** Approve a claimed swap / cover: the shift moves to whoever picked it up (and a swapped shift comes back). */
export async function decideOffer(id: string, approve: boolean) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: o } = await supabase.from("staff_shift_offers").select("id, staff_shift_id, from_member_id, to_member_id, swap_shift_id, status").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!o || !["open", "claimed"].includes(o.status as string)) throw new Error("That request has already been dealt with.");
    if (approve && !o.to_member_id) throw new Error("No one has picked this shift up yet.");
    if (approve) {
      const { error } = await supabase.from("staff_shifts").update({ crew_member_id: o.to_member_id, changed_since_publish: false, updated_at: new Date().toISOString() }).eq("id", o.staff_shift_id).eq("organisation_id", org.id);
      if (error) throw new Error(error.message);
      if (o.swap_shift_id) await supabase.from("staff_shifts").update({ crew_member_id: o.from_member_id, updated_at: new Date().toISOString() }).eq("id", o.swap_shift_id).eq("organisation_id", org.id);
      const settings = readRosterSettings(org.settings);
      if (settings.google_calendar) await syncShiftCalendar(supabase, org.id, org.timezone, [o.staff_shift_id as string, ...(o.swap_shift_id ? [o.swap_shift_id as string] : [])]);
    }
    await supabase.from("staff_shift_offers").update({ status: approve ? "approved" : "declined", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", id);
    const { data: s } = await supabase.from("staff_shifts").select("shift_date, start_time, finish_time, break_minutes, area:roster_areas(name)").eq("id", o.staff_shift_id).maybeSingle();
    const line = s ? shiftLine({ ...(s as unknown as { shift_date: string; start_time: string; finish_time: string; break_minutes: number }), area: (s as unknown as { area: { name: string } | null }).area?.name ?? null }) : "";
    const people = [o.from_member_id as string, ...(o.to_member_id ? [o.to_member_id as string] : [])];
    await emailStaff(supabase, org.id, people.map((m) => ({
      memberId: m, subject: approve ? "Shift change approved" : "Shift change not approved",
      intro: approve ? (m === o.to_member_id ? "This shift is now yours:" : "Your shift has been handed over:") : "This shift change wasn't approved — the roster stays as it was:", lines: line ? [line] : [],
    })));
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: approve ? "roster.swap_approved" : "roster.swap_declined", entityType: "crew_member", entityId: o.from_member_id as string, summary: `${actorName(profile)} ${approve ? "approved" : "declined"} a shift handover` });
    return approve ? "Approved — both people have been emailed." : "Declined.";
  });
}

// ---------------------------------------------------------------- settings

async function saveSettings(patch: Record<string, unknown>) {
  const { supabase, org } = await office();
  const { data: fresh } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
  const settings = (fresh?.settings ?? {}) as Record<string, unknown>;
  const roster = { ...((settings.roster ?? {}) as Record<string, unknown>), ...patch };
  const { error } = await supabase.from("organisations").update({ settings: { ...settings, roster } }).eq("id", org.id);
  if (error) throw new Error(error.message);
}

export async function saveRosterOptions(input: { rounding: number; grace: number; googleCalendar: boolean; geofence: { lat: number; lng: number; metres: number } | null }) {
  return wrap(async () => {
    const n = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
    await saveSettings({ rounding: n(input.rounding, 60), grace: n(input.grace, 60), google_calendar: !!input.googleCalendar, geofence: input.geofence && input.geofence.metres > 0 ? input.geofence : null });
    return "Saved.";
  });
}

export async function saveAwardRules(rules: AwardRules) {
  return wrap(async () => { await saveSettings({ rules: readRules(rules) }); return "Pay rules saved."; });
}

export async function saveXeroPayroll(input: { earnings: Partial<Record<Category, string>>; status: "DRAFT" | "APPROVED" }) {
  return wrap(async () => {
    const earnings = Object.fromEntries(Object.entries(input.earnings).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, v!.trim()]));
    await saveSettings({ xero: { earnings, status: input.status === "DRAFT" ? "DRAFT" : "APPROVED" } });
    return "Xero Payroll settings saved.";
  });
}

/** A new secret link for the café iPad (the old one stops working). */
export async function newKioskLink() {
  return wrap(async () => {
    const { org } = await office();
    const token = randomBytes(18).toString("base64url");
    await saveSettings({ kiosk_hash: createHash("sha256").update(`${org.id}:${token}`).digest("hex") });
    return { message: token };
  });
}

export async function addHoliday(date: string, name: string) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!DATE.test(date)) throw new Error("Choose the date.");
    const n = name.trim().slice(0, 80);
    if (!n) throw new Error("Name the holiday.");
    const { error } = await supabase.from("public_holidays").upsert({ organisation_id: org.id, holiday_date: date, name: n }, { onConflict: "organisation_id,holiday_date" });
    if (error) throw new Error(dbErr(error.message));
    return `${n} added.`;
  });
}
export async function removeHoliday(date: string) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!DATE.test(date)) throw new Error("Refresh and try again.");
    await supabase.from("public_holidays").delete().eq("organisation_id", org.id).eq("holiday_date", date);
  });
}


/** Text the week to everyone on it (again), or one person. */
export async function textWeek(monday: string, memberId: string | null) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!DATE.test(monday)) throw new Error("Choose a week.");
    let ids: string[];
    if (memberId) { if (!UUID.test(memberId)) throw new Error("Choose someone."); ids = [memberId]; }
    else {
      const { data } = await supabase.from("staff_shifts").select("crew_member_id").eq("organisation_id", org.id).eq("roster", true).not("published_at", "is", null).not("crew_member_id", "is", null).gte("shift_date", monday).lte("shift_date", addDaysISO(monday, 6));
      ids = [...new Set(((data ?? []) as { crew_member_id: string }[]).map((r) => r.crew_member_id))];
    }
    if (!ids.length) throw new Error("Nobody has published shifts that week.");
    const { textRoster } = await import("@/lib/roster/sms");
    const r = await textRoster(org.id, ids, monday);
    if (!r.sent.length) throw new Error(`Nothing sent: ${r.failed.join(", ")}`);
    return `Texted ${r.sent.join(", ")}${r.failed.length ? ` · not texted: ${r.failed.join(", ")}` : ""}.`;
  });
}

/** A test text: what this person would get for the week, sent to them (or to another number). */
export async function testRosterText(memberId: string, monday: string, to: string | null) {
  return wrap(async () => {
    const { org } = await office();
    if (!UUID.test(memberId) || !DATE.test(monday)) throw new Error("Choose who and the week.");
    const { textRoster } = await import("@/lib/roster/sms");
    const r = await textRoster(org.id, [memberId], monday, to?.trim() ? { to: to.trim() } : {});
    if (!r.sent.length) throw new Error(r.failed.join(", ") || "Not sent.");
    return "Test text sent.";
  });
}
