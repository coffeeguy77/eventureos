/**
 * Line helpers: work out a quote line's quantity (and its description) from how people think about it.
 *  - Staff lines (charged by the hour): service start → end, number of staff; setup time is added before the
 *    service using the package's rule (e.g. 30 min), with its minimum hours and rounding.
 *  - Drinks lines (charged per serve): hot + cold. Typing a total puts it all on hot (keeping any cold).
 * Pure — used by the quote builder and tested with `npx tsx`.
 */
import { serviceHours, staffHours, type StaffRule } from "@/lib/pricing/engine";
import { shortTime } from "@/lib/calendar/job-invite";

export interface StaffDetails { kind: "staff"; start: string | null; end: string | null; staff: number; setup_minutes: number }
export interface ServesDetails { kind: "serves"; hot: number; cold: number }
export type LineDetails = StaffDetails | ServesDetails;

const toMin = (t: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const fmtH = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(h * 4 % 1 === 0 ? 2 : 1).replace(/0$/, "")} hr${h === 1 ? "" : "s"}`;

/** When the team arrives to set up, e.g. "07:30" for an 8am start with 30 min setup. */
export function setupTime(d: Pick<StaffDetails, "start" | "setup_minutes">): string | null {
  const s = toMin(d.start);
  return s == null ? null : hhmm(s - (d.setup_minutes || 0));
}

/** Hours to charge across all staff, and the line's description. Null when the times aren't complete. */
export function staffLine(d: StaffDetails, rule: StaffRule | null, label = "staff") {
  const s = toMin(d.start), e = toMin(d.end);
  if (s == null || e == null) return null;
  const hrs = serviceHours(s, e);
  const r: StaffRule = { ...(rule ?? { service_id: "" }), setup_minutes: d.setup_minutes, packdown_minutes: rule?.packdown_minutes ?? 0 };
  const n = Math.max(1, Math.floor(d.staff || 1));
  const per = Array.from({ length: n }, (_, i) => staffHours(r, hrs, i === 0));
  const quantity = Math.round(per.reduce((a, b) => a + b, 0) * 100) / 100;
  const setup = setupTime(d);
  const lines = [
    d.setup_minutes > 0 && setup ? `Setup ${shortTime(setup)}` : null,
    `Service ${shortTime(d.start)} – ${shortTime(d.end)}`,
    n > 1 ? `${n} ${label.endsWith("s") ? label : `${label}s`} × ${fmtH(per[0])}` : null,
  ].filter(Boolean);
  return { quantity, description: lines.join("\n"), perStaff: per, serviceHours: hrs };
}

/** Quantity and first description line for a drinks line. */
export function servesLine(d: ServesDetails, base: string | null) {
  const hot = Math.max(0, Math.round(d.hot || 0)), cold = Math.max(0, Math.round(d.cold || 0));
  const head = cold ? `${hot} Hot + ${cold} Cold drinks` : `${hot} Hot drinks`;
  return { quantity: hot + cold, description: base?.trim() ? `${head}\n\n${base.trim()}` : head };
}

/** A total typed straight into Qty: everything that isn't cold is hot. */
export function servesFromQuantity(d: ServesDetails, qty: number): ServesDetails {
  const total = Math.max(0, Math.round(qty));
  const cold = Math.min(Math.max(0, Math.round(d.cold || 0)), total);
  return { kind: "serves", hot: total - cold, cold };
}

/** Accept only well-formed details (from the browser or the database). */
export function cleanDetails(raw: unknown): LineDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown, max: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : 0; };
  if (r.kind === "staff") {
    const t = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, "0") : null);
    return { kind: "staff", start: t(r.start), end: t(r.end), staff: Math.max(1, Math.round(n(r.staff, 50))), setup_minutes: Math.round(n(r.setup_minutes, 600)) };
  }
  if (r.kind === "serves") return { kind: "serves", hot: Math.round(n(r.hot, 1_000_000)), cold: Math.round(n(r.cold, 1_000_000)) };
  return null;
}
