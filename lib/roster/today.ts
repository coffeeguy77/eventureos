import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, todayISO } from "@/lib/format";
import { readRosterSettings } from "./settings";
import { fromLocal, shiftSpan, toLocal } from "./time";
import { hoursFor, totalsFor } from "./pay";

/**
 * Today at the café, for managers (office Roster page and the staff app's Today): who's on, on a break (timer), late,
 * done — with the "running late?" text status; rostered wages against Square takings; checklists; documents expiring.
 */
export interface BoardRow {
  memberId: string; name: string; phone: string | null; shiftId: string | null; shift: string | null; start: string | null;
  state: "late" | "due" | "on" | "break" | "done" | "unrostered"; since: string | null; breakSince: string | null;
  alert: { at: string; by: string; ok: boolean; error: string | null } | null; resendAt: string | null;
}
export interface Board {
  rows: BoardRow[]; breakMin: number; breakMax: number;
  wages: { cost: number; hours: number }; sales: number | null; salesNote: string | null;
  checklists: { id: string; name: string; dueBy: string | null; items: { text: string; done: boolean; by: string | null }[] }[];
  expiring: { name: string; qual: string; expires: string; expired: boolean }[];
}

export async function todayBoard(db: SupabaseClient, org: { id: string; timezone: string; settings: unknown }): Promise<Board> {
  const st = readRosterSettings(org.settings);
  const today = todayISO(org.timezone), nowL = toLocal(new Date(), org.timezone);
  const [{ data: sh }, { data: ents }, { data: people }, { data: rateRow }, { data: hol }] = await Promise.all([
    db.from("staff_shifts").select("id, crew_member_id, shift_date, start_time, finish_time, break_minutes").eq("organisation_id", org.id).eq("roster", true).not("published_at", "is", null).not("crew_member_id", "is", null).eq("shift_date", today).order("start_time"),
    db.from("staff_time_entries").select("crew_member_id, staff_shift_id, clock_in, clock_out, break_started_at").eq("organisation_id", org.id).or(`work_date.eq.${today},clock_out.is.null`),
    db.from("crew_members").select("id, name, phone, employment_type, hourly_rate").eq("organisation_id", org.id),
    db.from("organisations").select("staff_hourly_rate").eq("id", org.id).maybeSingle(),
    db.from("public_holidays").select("holiday_date").eq("organisation_id", org.id).eq("holiday_date", today),
  ]);
  type S = { id: string; crew_member_id: string; shift_date: string; start_time: string; finish_time: string; break_minutes: number };
  type En = { crew_member_id: string; staff_shift_id: string | null; clock_in: string; clock_out: string | null; break_started_at: string | null };
  type P = { id: string; name: string; phone: string | null; employment_type: "casual" | "part_time" | "full_time"; hourly_rate: number | null };
  const shifts = (sh ?? []) as S[], list = (ents ?? []) as En[], ppl = new Map(((people ?? []) as P[]).map((p) => [p.id, p]));
  const orgRate = Number((rateRow as { staff_hourly_rate?: number } | null)?.staff_hourly_rate ?? 30);

  // late texts already sent today
  const alerts = new Map<string, BoardRow["alert"]>();
  if (shifts.length) {
    const { data: al } = await db.from("staff_late_alerts").select("staff_shift_id, sent_at, sent_by, ok, error").in("staff_shift_id", shifts.map((s) => s.id)).order("sent_at");
    for (const a of (al ?? []) as { staff_shift_id: string; sent_at: string; sent_by: string; ok: boolean; error: string | null }[]) alerts.set(a.staff_shift_id, { at: a.sent_at, by: a.sent_by, ok: a.ok, error: a.error });
  }
  const used = new Set<En>();
  const rows: BoardRow[] = shifts.map((x) => {
    const span = shiftSpan(x.shift_date, x.start_time, x.finish_time);
    const e = list.find((y) => !used.has(y) && y.crew_member_id === x.crew_member_id && (y.staff_shift_id === x.id || !y.staff_shift_id));
    if (e) used.add(e);
    const lateAt = new Date(Date.parse(`${span.start}:00Z`) + st.grace * 60_000).toISOString().slice(0, 16);
    const p = ppl.get(x.crew_member_id);
    const a = alerts.get(x.id) ?? null;
    return {
      memberId: x.crew_member_id, name: p?.name ?? "—", phone: p?.phone ?? null, shiftId: x.id, shift: `${x.start_time.slice(0, 5)}–${x.finish_time.slice(0, 5)}`, start: fromLocal(span.start, org.timezone),
      state: e ? (e.clock_out ? "done" : e.break_started_at ? "break" : "on") : nowL > lateAt && nowL < span.finish ? "late" : nowL >= span.finish ? "done" : "due",
      since: e?.clock_in ?? null, breakSince: e?.break_started_at ?? null, alert: a, resendAt: a ? new Date(Date.parse(a.at) + st.late.cooldown * 60_000).toISOString() : null,
    } as BoardRow;
  }).filter((r) => !(r.state === "done" && !r.since));
  for (const e of list) if (!used.has(e) && !e.clock_out) {
    const p = ppl.get(e.crew_member_id);
    rows.push({ memberId: e.crew_member_id, name: p?.name ?? "Someone", phone: p?.phone ?? null, shiftId: null, shift: null, start: null, state: e.break_started_at ? "break" : "unrostered", since: e.clock_in, breakSince: e.break_started_at, alert: null, resendAt: null });
  }

  // rostered wages today (award estimate) and Square takings so far
  const holidays = new Set(((hol ?? []) as { holiday_date: string }[]).map((h) => h.holiday_date));
  let cost = 0, hours = 0;
  for (const x of shifts) {
    const p = ppl.get(x.crew_member_id);
    const flat = st.flat.includes(x.crew_member_id), type = p?.employment_type ?? "casual";
    const byDay = hoursFor([{ ...shiftSpan(x.shift_date, x.start_time, x.finish_time), breakMinutes: x.break_minutes }], { type, flat }, holidays, st.rules);
    const t = totalsFor(byDay, { type, flat, rate: p?.hourly_rate == null ? orgRate : Number(p.hourly_rate) }, st.rules);
    cost += t.cost; hours += t.hours;
  }
  let sales: number | null = null, salesNote: string | null = null;
  try {
    const { loadSquare, squareSales } = await import("@/lib/square/server");
    const cfg = await loadSquare(db, org.id);
    if (cfg) sales = await squareSales(cfg, fromLocal(`${today}T00:00`, org.timezone), new Date().toISOString());
    else salesNote = "Connect Square (Settings → Integrations) to see wages as a % of sales.";
  } catch (e) { salesNote = e instanceof Error ? e.message : String(e); }

  // checklists for today
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  let checklists: Board["checklists"] = [];
  const { data: cl, error: clErr } = await db.from("roster_checklists").select("id, name, due_by, items, weekdays").eq("organisation_id", org.id).eq("active", true).order("position");
  if (!clErr && cl?.length) {
    const todays = (cl as { id: string; name: string; due_by: string | null; items: string[]; weekdays: number[] }[]).filter((c) => c.weekdays.includes(dow));
    const { data: ticks } = todays.length ? await db.from("roster_checklist_ticks").select("checklist_id, item, crew_member_id").eq("day", today).in("checklist_id", todays.map((c) => c.id)) : { data: [] };
    const t = (ticks ?? []) as { checklist_id: string; item: number; crew_member_id: string | null }[];
    checklists = todays.map((c) => ({ id: c.id, name: c.name, dueBy: c.due_by?.slice(0, 5) ?? null, items: c.items.map((text, i) => {
      const k = t.find((x) => x.checklist_id === c.id && x.item === i);
      return { text, done: !!k, by: k?.crew_member_id ? ppl.get(k.crew_member_id)?.name ?? null : null };
    }) }));
  }

  // qualifications expired or expiring in 30 days (people on the roster)
  let expiring: Board["expiring"] = [];
  const { data: q, error: qErr } = await db.from("staff_qualifications").select("crew_member_id, name, expires_on").eq("organisation_id", org.id).not("expires_on", "is", null).lte("expires_on", addDaysISO(today, 30)).order("expires_on");
  if (!qErr) expiring = ((q ?? []) as { crew_member_id: string; name: string; expires_on: string }[]).map((x) => ({ name: ppl.get(x.crew_member_id)?.name ?? "—", qual: x.name, expires: x.expires_on, expired: x.expires_on < today }));

  return { rows, breakMin: st.meal.minutes, breakMax: Math.max(st.breaks.max, st.meal.minutes), wages: { cost: Math.round(cost * 100) / 100, hours: Math.round(hours * 100) / 100 }, sales, salesNote, checklists, expiring };
}
