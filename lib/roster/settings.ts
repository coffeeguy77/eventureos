import { readRules, type AwardRules, type Category } from "./award";

/** Roster settings, kept in organisations.settings.roster. */
export interface RosterSettings {
  rules: AwardRules;
  /** clock times round to this many minutes before they're paid (0 = exact) */
  rounding: number;
  /** pay the rostered times when someone clocks on early or off late by less than this many minutes */
  grace: number;
  /** shifts also go on the business's Google Calendar */
  google_calendar: boolean;
  /** Xero Payroll: which earnings rate each category is sent as, and how timesheets arrive */
  xero: { earnings: Partial<Record<Category, string>>; status: "DRAFT" | "APPROVED" };
  /** Xero Payroll switched off here (EventureOS stops reading payroll and sending timesheets; reconnecting turns it back on) */
  payroll_off: boolean;
  /** people paid an agreed flat hourly rate (no penalties — every hour is ordinary) */
  flat: string[];
  /** the café iPad: a secret in its link (hashed here) */
  kiosk_hash: string | null;
  /** how staff clock on: café roster shifts on the iPad, a phone, or either; event shifts in the staff app (yes/no) */
  clock: { cafe: "ipad" | "phone" | "both"; events: boolean; photo: boolean };
  /** the unpaid meal break the award requires: at least this many minutes once a shift is longer than this many hours */
  meal: { after_hours: number; minutes: number };
  /** breaks: the longest allowed (minutes; longer is flagged), smart weekly balancing, clocked only on the café iPad */
  breaks: { max: number; smart: boolean; ipad_only: boolean };
  /** where the café is (an address and a pin), and how close a phone must be to clock on (metres) */
  place: { address: string | null } ;
  /** clock on from a phone only near the café (metres; 0 = anywhere) */
  geofence: { lat: number; lng: number; metres: number } | null;
  /** areas at the usual workplace — left off staff texts (only shifts somewhere else say where) */
  home_areas: string[];
}

export function readRosterSettings(orgSettings: unknown): RosterSettings {
  const r = ((orgSettings as { roster?: Record<string, unknown> } | null)?.roster ?? {}) as Record<string, unknown>;
  const x = (r.xero ?? {}) as { earnings?: Record<string, string>; status?: string };
  const g = r.geofence as { lat?: number; lng?: number; metres?: number } | null | undefined;
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    rules: readRules(r.rules),
    rounding: n(r.rounding, 15),
    grace: n(r.grace, 10),
    google_calendar: r.google_calendar === true,
    xero: { earnings: x.earnings ?? {}, status: x.status === "DRAFT" ? "DRAFT" : "APPROVED" },
    kiosk_hash: typeof r.kiosk_hash === "string" ? r.kiosk_hash : null,
    payroll_off: r.payroll_off === true,
    clock: (() => { const c = (r.clock ?? {}) as Record<string, unknown>; return { cafe: c.cafe === "ipad" || c.cafe === "phone" ? c.cafe : "both", events: c.events === true, photo: c.photo !== false } as RosterSettings["clock"]; })(),
    meal: (() => { const m = (r.meal ?? {}) as Record<string, unknown>; return { after_hours: n(m.after_hours, 5), minutes: n(m.minutes, 30) }; })(),
    breaks: (() => { const b = (r.breaks ?? {}) as Record<string, unknown>; return { max: n(b.max, 60), smart: b.smart === true, ipad_only: b.ipad_only !== false }; })(),
    place: { address: typeof (r.place as { address?: unknown } | undefined)?.address === "string" ? String((r.place as { address: string }).address) : null },
    flat: Array.isArray(r.flat) ? (r.flat as unknown[]).filter((x): x is string => typeof x === "string") : [],
    home_areas: Array.isArray(r.home_areas) ? (r.home_areas as unknown[]).filter((x): x is string => typeof x === "string") : [],
    geofence: g && typeof g.lat === "number" && typeof g.lng === "number" && typeof g.metres === "number" && g.metres > 0 ? { lat: g.lat, lng: g.lng, metres: g.metres } : null,
  };
}

/** Metres between two points. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const EMPLOYMENT_LABEL = { casual: "Casual", part_time: "Part-time", full_time: "Full-time" } as const;
export const LEAVE_LABEL: Record<string, string> = { annual: "Annual leave", personal: "Personal / sick leave", unpaid: "Unpaid leave", long_service: "Long service leave", other: "Other leave" };

/** The break rules in the shape lib/roster/breaks wants. */
export const breakRules = (s: RosterSettings) => ({ min: s.meal.minutes, after_hours: s.meal.after_hours, max: Math.max(s.breaks.max, s.meal.minutes), smart: s.breaks.smart });
