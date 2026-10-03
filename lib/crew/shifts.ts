/**
 * Shift maths for the staff app and wages: planned hours (setup → finish), pay, overlaps.
 * Pure — tested with `npx tsx lib/crew/shifts.test.ts`.
 */
export interface ShiftEvent { event_date: string | null; setup_time: string | null; start_time: string | null; finish_time: string | null }

const mins = (t: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** When the shift starts (setup time, else service start) and finishes, and how many hours that is. */
export function plannedShift(e: ShiftEvent): { start: string | null; finish: string | null; hours: number | null } {
  const start = e.setup_time ?? e.start_time ?? null;
  const finish = e.finish_time ?? null;
  const a = mins(start), b = mins(finish);
  if (a == null || b == null) return { start: start?.slice(0, 5) ?? null, finish: finish?.slice(0, 5) ?? null, hours: null };
  const span = b > a ? b - a : b + 24 * 60 - a; // past midnight
  return { start: start!.slice(0, 5), finish: finish!.slice(0, 5), hours: Math.round((span / 60) * 100) / 100 };
}

export interface PayInput {
  event: ShiftEvent;
  hoursOverride?: number | null;
  /** Extra hours the office approved */
  approvedExtra?: number;
  rateOverride?: number | null;
  memberRate?: number | null;
  orgRate: number;
  /** Minimum paid hours per shift (planned hours are topped up to this; an hours override set by the office wins) */
  minHours?: number | null;
}

export function shiftPay(p: PayInput): { base: number | null; extra: number; hours: number | null; rate: number; amount: number | null } {
  const planned = plannedShift(p.event).hours;
  const min = Number(p.minHours ?? 0);
  const base = p.hoursOverride ?? (planned == null ? null : Math.max(planned, min));
  const extra = Math.max(0, p.approvedExtra ?? 0);
  const rate = Number(p.rateOverride ?? p.memberRate ?? p.orgRate);
  const hours = base == null ? (extra || null) : Math.round((base + extra) * 100) / 100;
  return { base, extra, hours, rate, amount: hours == null ? null : Math.round(hours * rate * 100) / 100 };
}

/** Do two jobs clash? Same day and overlapping times (unknown times on the same day count as a clash). */
export function clashes(a: ShiftEvent, b: ShiftEvent): boolean {
  if (!a.event_date || !b.event_date || a.event_date !== b.event_date) return false;
  const pa = plannedShift(a), pb = plannedShift(b);
  const a1 = mins(pa.start), a2 = mins(pa.finish), b1 = mins(pb.start), b2 = mins(pb.finish);
  if (a1 == null || a2 == null || b1 == null || b2 == null) return true;
  return a1 < b2 && b1 < a2;
}

export const fmtHours = (h: number | null | undefined) => h == null ? "—" : `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, "")} hr${h === 1 ? "" : "s"}`;

/** The organisation's minimum paid hours per shift (Settings → Team), default 3. */
export function staffMinHours(settings: Record<string, unknown> | null | undefined): number {
  const v = Number((settings ?? {}).staff_min_hours);
  return Number.isFinite(v) && v >= 0 && v <= 12 ? v : 3;
}
