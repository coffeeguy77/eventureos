import { shiftSpan } from "./time";

/** The roster week as plain data (what the grid in the browser works with). */
export interface PlainWeek {
  monday: string; dates: string[]; orgRate: number; unpublished: number;
  areas: { id: string; name: string; colour: string | null; position: number; active: boolean }[];
  people: { id: string; name: string; role: string | null; employment_type: "casual" | "part_time" | "full_time"; hourly_rate: number | null; default_area_id: string | null; xero_employee_id: string | null; email: string | null; has_pin: boolean }[];
  shifts: { id: string; crew_member_id: string | null; area_id: string | null; title: string; shift_date: string; start_time: string; finish_time: string; break_minutes: number; notes: string | null; published_at: string | null; changed_since_publish: boolean }[];
  holidays: Record<string, string>;
  totals: Record<string, { hours: number; cost: number }>;
  avail: Record<string, { weekday: number; available: boolean; start: string | null; finish: string | null }[]>;
  blocks: Record<string, Record<string, string[]>>;
}

/** Problems with a shift for that person: overlapping another shift, on leave / away / at an event, outside their availability. */
export function shiftWarnings(w: Pick<PlainWeek, "shifts" | "avail" | "blocks">, s: { id?: string | null; crew_member_id: string | null; shift_date: string; start_time: string; finish_time: string }): string[] {
  if (!s.crew_member_id) return [];
  const out = [...(w.blocks[s.crew_member_id]?.[s.shift_date] ?? [])];
  const me = shiftSpan(s.shift_date, s.start_time, s.finish_time);
  const st = s.start_time.slice(0, 5), fi = s.finish_time.slice(0, 5);
  const dow = new Date(`${s.shift_date}T00:00:00Z`).getUTCDay();
  for (const a of (w.avail[s.crew_member_id] ?? []).filter((x) => x.weekday === dow && x.start && x.finish)) {
    if (a.available && (st < a.start! || fi > a.finish!)) out.push(`Only available ${a.start}–${a.finish}`);
    if (!a.available && st < a.finish! && a.start! < fi) out.push(`Not available ${a.start}–${a.finish}`);
  }
  for (const o of w.shifts) {
    if (o.id === s.id || o.crew_member_id !== s.crew_member_id || o.shift_date !== s.shift_date) continue;
    const x = shiftSpan(o.shift_date, o.start_time, o.finish_time);
    if (x.start < me.finish && me.start < x.finish) out.push(`Overlaps ${o.start_time.slice(0, 5)}–${o.finish_time.slice(0, 5)}`);
  }
  return out;
}
