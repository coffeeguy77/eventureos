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
  /** the café iPad: a secret in its link (hashed here) */
  kiosk_hash: string | null;
  /** clock on from a phone only near the café (metres; 0 = anywhere) */
  geofence: { lat: number; lng: number; metres: number } | null;
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
