/**
 * Roast Culture — prices, machines and the calculator's starting assumptions, in one place. Pure.
 * The business can change the membership price and each roaster's hourly rate in Website → Café pages
 * (organisations.settings.cafe.roast); everything else here is the agreed starting point.
 * All prices are Australian dollars, GST-inclusive as advertised.
 */

export interface Machine {
  id: string; name: string; short: string;
  /** green coffee the drum takes, kg (50 g = 0.05) */
  capacityKg: number;
  /** advertised hourly hire, GST-inclusive */
  hourly: number;
  /** the calculator's starting batch for this machine — an editable assumption */
  batchKg: number;
  /** Giesen profile software runs on Giesen machines only */
  giesen: boolean;
}

export const MACHINES: Machine[] = [
  { id: "ikawa", name: "50 g IKAWA Pro", short: "IKAWA Pro", capacityKg: 0.05, hourly: 75, batchKg: 0.05, giesen: false },
  { id: "bullet", name: "1 kg Aillio Bullet", short: "Aillio Bullet", capacityKg: 1, hourly: 100, batchKg: 1, giesen: false },
  { id: "g15", name: "1.5 kg Giesen", short: "Giesen 1.5 kg", capacityKg: 1.5, hourly: 100, batchKg: 1.5, giesen: true },
  { id: "g150", name: "15 kg Giesen", short: "Giesen 15 kg", capacityKg: 15, hourly: 200, batchKg: 12, giesen: true },
  { id: "g450", name: "45 kg Giesen", short: "Giesen 45 kg", capacityKg: 45, hourly: 400, batchKg: 30, giesen: true },
];

export const PACKAGES = {
  /** the minimum hire */
  minHours: 2,
  /** the day package: eight hours at half the hourly rate */
  dayHours: 8,
  dayDiscountPct: 50,
} as const;

export interface RoastConfig {
  membershipMonthly: number;
  machines: Machine[];
  /** when staff can preheat for a booked start, shown on the page */
  staffHours: string;
}

const money = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 100000 ? Math.round(Number(v) * 100) / 100 : d);

/** The business's Roast Culture prices (settings.cafe.roast), falling back to the agreed ones. */
export function readRoast(cafeSettings: unknown): RoastConfig {
  const r = ((cafeSettings ?? {}) as Record<string, unknown>).roast as Record<string, unknown> | undefined;
  const rates = (r?.rates && typeof r.rates === "object" ? r.rates : {}) as Record<string, unknown>;
  return {
    membershipMonthly: money(r?.membershipMonthly, 99),
    machines: MACHINES.map((m) => ({ ...m, hourly: money(rates[m.id], m.hourly) })),
    staffHours: typeof r?.staffHours === "string" && r.staffHours.trim() ? r.staffHours.trim().slice(0, 60) : "9 am–3 pm",
  };
}

/** Two-hour minimum hire and the eight-hour day for a machine. */
export function packagePrices(hourly: number) {
  return {
    hourly,
    twoHour: hourly * PACKAGES.minHours,
    day: hourly * PACKAGES.dayHours * (1 - PACKAGES.dayDiscountPct / 100),
    /** standard hourly charges the day price equals */
    dayEqualsHours: (PACKAGES.dayHours * (1 - PACKAGES.dayDiscountPct / 100)),
  };
}
