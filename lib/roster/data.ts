import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO } from "@/lib/format";
import { awardHours, estimateCost, workedHours, type EmploymentType } from "./award";
import { readRosterSettings, type RosterSettings } from "./settings";
import { shiftSpan, weekDates } from "./time";
import type { PlainWeek } from "./warnings";
export { shiftWarnings } from "./warnings";

export interface RosterArea { id: string; name: string; colour: string | null; position: number; active: boolean }
export interface RosterPerson { id: string; name: string; role: string | null; employment_type: EmploymentType; hourly_rate: number | null; default_area_id: string | null; xero_employee_id: string | null; email: string | null; has_pin: boolean }
export interface RosterShift {
  id: string; crew_member_id: string | null; area_id: string | null; title: string; shift_date: string; start_time: string; finish_time: string;
  break_minutes: number; notes: string | null; published_at: string | null; changed_since_publish: boolean;
}
export interface Clash { member: string; date: string; text: string }

export interface RosterWeek {
  monday: string; dates: string[]; areas: RosterArea[]; people: RosterPerson[]; shifts: RosterShift[]; settings: RosterSettings; orgRate: number;
  holidays: Map<string, string>;
  /** per person per date: what stops them working (leave, away, regular unavailability, an event shift) */
  blocks: Map<string, Map<string, string[]>>;
  /** per person: hours and estimated cost this week */
  totals: Map<string, { hours: number; cost: number }>;
  /** per person: their regular weekly availability */
  avail: Map<string, { weekday: number; available: boolean; start: string | null; finish: string | null }[]>;
  unpublished: number;
  ready: boolean;
}

const SHIFT_COLS = "id, crew_member_id, area_id, title, shift_date, start_time, finish_time, break_minutes, notes, published_at, changed_since_publish";

export async function loadWeek(db: SupabaseClient, org: { id: string; settings: unknown; staff_hourly_rate?: number | null }, monday: string): Promise<RosterWeek> {
  const dates = weekDates(monday), sunday = dates[6];
  const settings = readRosterSettings(org.settings);
  const { data: rateRow } = await db.from("organisations").select("staff_hourly_rate").eq("id", org.id).maybeSingle();
  const orgRate = Number((rateRow as { staff_hourly_rate?: number } | null)?.staff_hourly_rate ?? org.staff_hourly_rate ?? 30);
  const probe = await db.from("roster_areas").select("id").eq("organisation_id", org.id).limit(1);
  const base: RosterWeek = { monday, dates, areas: [], people: [], shifts: [], settings, orgRate, holidays: new Map(), blocks: new Map(), totals: new Map(), avail: new Map(), unpublished: 0, ready: !probe.error };
  if (probe.error) return base;

  const [areas, people, shifts, holidays, away, avail] = await Promise.all([
    db.from("roster_areas").select("id, name, colour, position, active").eq("organisation_id", org.id).order("position").order("name"),
    db.from("crew_members").select("id, name, role, email, employment_type, hourly_rate, default_area_id, xero_employee_id, kiosk_pin_hash, rank").eq("organisation_id", org.id).eq("active", true).eq("on_roster", true).order("rank").order("name"),
    db.from("staff_shifts").select(SHIFT_COLS).eq("organisation_id", org.id).eq("roster", true).gte("shift_date", dates[0]).lte("shift_date", sunday).order("start_time"),
    db.from("public_holidays").select("holiday_date, name").eq("organisation_id", org.id).gte("holiday_date", dates[0]).lte("holiday_date", addDaysISO(sunday, 1)),
    db.from("staff_unavailability").select("crew_member_id, starts_on, ends_on, leave_type, status, note").eq("organisation_id", org.id).lte("starts_on", sunday).gte("ends_on", dates[0]).neq("status", "declined"),
    db.from("staff_availability").select("crew_member_id, weekday, available, start_time, finish_time").eq("organisation_id", org.id),
  ]);
  base.areas = (areas.data ?? []) as RosterArea[];
  base.people = ((people.data ?? []) as (Omit<RosterPerson, "has_pin"> & { kiosk_pin_hash: string | null })[]).map(({ kiosk_pin_hash, ...p }) => ({ ...p, hourly_rate: p.hourly_rate == null ? null : Number(p.hourly_rate), has_pin: !!kiosk_pin_hash }));
  base.shifts = (shifts.data ?? []) as RosterShift[];
  for (const h of (holidays.data ?? []) as { holiday_date: string; name: string }[]) base.holidays.set(h.holiday_date, h.name);
  base.unpublished = base.shifts.filter((s) => !s.published_at || s.changed_since_publish).length;

  const block = (m: string, d: string, text: string) => {
    let pm = base.blocks.get(m); if (!pm) base.blocks.set(m, (pm = new Map()));
    pm.set(d, [...(pm.get(d) ?? []), text]);
  };
  const ids = new Set(base.people.map((p) => p.id));
  for (const a of (away.data ?? []) as { crew_member_id: string; starts_on: string; ends_on: string; leave_type: string | null; status: string; note: string | null }[]) {
    if (!ids.has(a.crew_member_id)) continue;
    for (const d of dates) if (d >= a.starts_on && d <= a.ends_on) block(a.crew_member_id, d, `${a.status === "pending" ? "Asked for " : ""}${a.leave_type ? "leave" : "away"}${a.note ? ` — ${a.note}` : ""}`);
  }
  for (const v of (avail.data ?? []) as { crew_member_id: string; weekday: number; available: boolean; start_time: string | null; finish_time: string | null }[]) {
    if (!ids.has(v.crew_member_id)) continue;
    base.avail.set(v.crew_member_id, [...(base.avail.get(v.crew_member_id) ?? []), { weekday: v.weekday, available: v.available, start: v.start_time?.slice(0, 5) ?? null, finish: v.finish_time?.slice(0, 5) ?? null }]);
    // a whole day they can't work shows on the grid
    if (!v.available && !v.start_time) for (const d of dates) if (new Date(`${d}T00:00:00Z`).getUTCDay() === v.weekday) block(v.crew_member_id, d, "Not available (regular)");
  }
  // event shifts and other (non-roster) shifts the same people are already working
  if (ids.size) {
    const [{ data: ev }, { data: other }] = await Promise.all([
      db.from("event_crew").select("crew_member_id, status, event:events(name, event_date, status)").eq("organisation_id", org.id).in("crew_member_id", [...ids]).neq("status", "interested"),
      db.from("staff_shifts").select("crew_member_id, title, shift_date, start_time, finish_time").eq("organisation_id", org.id).eq("roster", false).in("crew_member_id", [...ids]).gte("shift_date", dates[0]).lte("shift_date", sunday),
    ]);
    for (const r of (ev ?? []) as unknown as { crew_member_id: string; event: { name: string; event_date: string | null; status: string } | null }[]) {
      if (r.event?.event_date && dates.includes(r.event.event_date) && r.event.status !== "cancelled") block(r.crew_member_id, r.event.event_date, `Event: ${r.event.name}`);
    }
    for (const r of (other ?? []) as { crew_member_id: string; title: string; shift_date: string; start_time: string | null; finish_time: string | null }[]) {
      block(r.crew_member_id, r.shift_date, `${r.title}${r.start_time ? ` ${r.start_time.slice(0, 5)}` : ""}`);
    }
  }
  // hours and cost per person (award estimate)
  const hol = new Set(base.holidays.keys());
  for (const p of base.people) {
    const mine = base.shifts.filter((s) => s.crew_member_id === p.id).map((s) => ({ ...shiftSpan(s.shift_date, s.start_time, s.finish_time), breakMinutes: s.break_minutes }));
    const byDay = awardHours(mine, p.employment_type, hol, settings.rules);
    base.totals.set(p.id, { hours: Math.round([...byDay.values()].reduce((t, h) => t + workedHours(h), 0) * 100) / 100, cost: estimateCost(byDay, p.employment_type, p.hourly_rate ?? orgRate, settings.rules) });
  }
  return base;
}

/** The week as plain data for the browser. */
export function plainWeek(w: RosterWeek): PlainWeek {
  const obj = <V,>(m: Map<string, V>) => Object.fromEntries(m);
  return { monday: w.monday, dates: w.dates, areas: w.areas, people: w.people, shifts: w.shifts, orgRate: w.orgRate, unpublished: w.unpublished,
    holidays: obj(w.holidays), totals: obj(w.totals), avail: obj(w.avail), blocks: Object.fromEntries([...w.blocks].map(([k, v]) => [k, obj(v)])) };
}
