/**
 * Pricing engine: turns "package + service times + number of serves + staff" into quote lines.
 * Pure — no server/Next imports, so tests run under `npx tsx`.
 *
 * All prices are EXCLUDING tax; each service carries its own tax rate.
 */

export interface PricedService {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  unit_price: number;
  tax_rate: number;
}

export interface StaffRule {
  service_id: string;
  /** Paid time before service starts (e.g. machine warm-up/setup). */
  setup_minutes?: number;
  /** Paid time after service ends (pack-down). */
  packdown_minutes?: number;
  /** Minimum paid hours per staff member (0 = none). */
  min_hours?: number;
  /** Hours that aren't charged (e.g. first hour included with the van). */
  included_hours?: number;
  /** "first" = only the first staff member gets the included hours; "each" = every staff member. */
  included_applies_to?: "first" | "each";
  /** Round paid hours up to this step (0.5 = half hours). */
  round_to_hours?: number;
  /** Label used on the quote line, e.g. "Barista". */
  label?: string;
}

export interface ExtraStaffRule {
  /** Suggest another staff member when serves exceed this… */
  serves_over: number;
  /** …and the service window is this many hours or less. */
  max_service_hours: number;
  /** Explanation shown to the person pricing, and optionally on the quote. */
  reason?: string;
}

export interface PackageRules {
  hire?: { service_id: string } | null;
  delivery?: { service_id: string } | null;
  staff?: StaffRule | null;
  per_serve?: { service_id: string } | null;
  extra_staff?: ExtraStaffRule | null;
}

export interface PriceInput {
  /** Service window, minutes from midnight (end may pass midnight: end < start adds 24 h). */
  start_minutes: number;
  end_minutes: number;
  serves: number;
  staff_count: number;
  include_delivery?: boolean;
}

export interface PriceLine {
  service_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  tax_rate: number;
  line_total: number; // ex tax
  kind: "hire" | "delivery" | "staff" | "per_serve";
}

export interface PriceResult {
  lines: PriceLine[];
  subtotal: number;
  tax_total: number;
  total: number;
  service_hours: number;
  paid_staff_hours: number; // total across staff
  suggested_staff: number;
  notes: string[];
}

const money = (n: number) => Math.round(n * 100) / 100;
const roundUp = (h: number, step: number) => (step > 0 ? Math.ceil(h / step - 1e-9) * step : h);

export function serviceHours(start: number, end: number): number {
  let mins = end - start;
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

/** Paid hours for one staff member. */
export function staffHours(rule: StaffRule, serviceHrs: number, isFirst: boolean): number {
  const worked = serviceHrs + (rule.setup_minutes ?? 0) / 60 + (rule.packdown_minutes ?? 0) / 60;
  const appliesIncluded = (rule.included_applies_to ?? "first") === "each" || isFirst;
  let paid = worked - (appliesIncluded ? rule.included_hours ?? 0 : 0);
  paid = Math.max(0, paid);
  if (paid > 0 && rule.min_hours) paid = Math.max(paid, rule.min_hours);
  return roundUp(paid, rule.round_to_hours ?? 0.5);
}

export function suggestedStaff(rules: PackageRules, serves: number, serviceHrs: number): number {
  const x = rules.extra_staff;
  if (!rules.staff) return 0;
  if (x && serves > x.serves_over && serviceHrs <= x.max_service_hours) return 2;
  return 1;
}

const fmtH = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1)) + (h === 1 ? " hr" : " hrs");

export function priceJob(rules: PackageRules, services: PricedService[], input: PriceInput): PriceResult {
  const byId = new Map(services.map((s) => [s.id, s]));
  const need = (id: string | undefined, what: string) => {
    const s = id ? byId.get(id) : undefined;
    if (!s) throw new Error(`The package's ${what} service is missing or switched off — check Settings → Services & pricing.`);
    return s;
  };
  const lines: PriceLine[] = [];
  const notes: string[] = [];
  const add = (s: PricedService, quantity: number, kind: PriceLine["kind"], description?: string | null, name?: string) => {
    lines.push({
      service_id: s.id, name: name ?? s.name, description: description ?? s.description, quantity, unit: s.unit,
      unit_price: s.unit_price, tax_rate: s.tax_rate, line_total: money(quantity * s.unit_price), kind,
    });
  };

  const hrs = serviceHours(input.start_minutes, input.end_minutes);
  const staffCount = Math.max(0, Math.floor(input.staff_count));
  const serves = Math.max(0, Math.floor(input.serves));

  if (rules.hire) add(need(rules.hire.service_id, "hire"), 1, "hire");
  if (rules.delivery && input.include_delivery !== false) add(need(rules.delivery.service_id, "delivery"), 1, "delivery");

  let paidTotal = 0;
  if (rules.staff && staffCount > 0) {
    const s = need(rules.staff.service_id, "staff");
    const per = Array.from({ length: staffCount }, (_, i) => staffHours(rules.staff!, hrs, i === 0));
    paidTotal = per.reduce((a, b) => a + b, 0);
    const label = rules.staff.label ?? "staff";
    const setup = rules.staff.setup_minutes ? ` + ${rules.staff.setup_minutes} min setup` : "";
    const worked = hrs + (rules.staff.setup_minutes ?? 0) / 60 + (rules.staff.packdown_minutes ?? 0) / 60;
    if (paidTotal > 0) {
      const breakdown = per.every((p) => p === per[0])
        ? `${staffCount} ${label}${staffCount === 1 ? "" : "s"} × ${fmtH(per[0])}`
        : per.map((p, i) => `${label} ${i + 1}: ${fmtH(p)}`).join(", ");
      const extras: string[] = [];
      if (rules.staff.included_hours) extras.push(`first ${fmtH(rules.staff.included_hours)} included${(rules.staff.included_applies_to ?? "first") === "first" && staffCount > 1 ? " (first " + label + ")" : ""}`);
      if (rules.staff.min_hours && per.some((p) => p <= rules.staff!.min_hours! && worked < rules.staff!.min_hours!)) extras.push(`${fmtH(rules.staff.min_hours)} minimum per ${label}`);
      add(s, paidTotal, "staff", `${breakdown} (${fmtH(hrs)} service${setup})${extras.length ? " — " + extras.join("; ") : ""}`);
    } else if (rules.staff.included_hours) {
      notes.push(`${label[0].toUpperCase() + label.slice(1)} time is within the included ${fmtH(rules.staff.included_hours)} — no staff charge.`);
    }
  }

  if (rules.per_serve && serves > 0) add(need(rules.per_serve.service_id, "per-serve"), serves, "per_serve");

  const suggest = suggestedStaff(rules, serves, hrs);
  if (rules.staff && suggest > staffCount) {
    notes.push(rules.extra_staff?.reason ?? `${suggest} staff recommended for ${serves} serves in ${fmtH(hrs)}.`);
  }

  const subtotal = money(lines.reduce((a, l) => a + l.line_total, 0));
  const tax_total = money(lines.reduce((a, l) => a + l.line_total * (l.tax_rate / 100), 0));
  return { lines, subtotal, tax_total, total: money(subtotal + tax_total), service_hours: hrs, paid_staff_hours: paidTotal, suggested_staff: suggest, notes };
}

/** Validate rules coming from the database / settings form. Returns human-readable problems. */
export function checkRules(rules: PackageRules, serviceIds: Set<string>): string[] {
  const out: string[] = [];
  const ref = (x: { service_id: string } | null | undefined, what: string) => {
    if (x && !serviceIds.has(x.service_id)) out.push(`Choose a ${what} service.`);
  };
  ref(rules.hire, "hire"); ref(rules.delivery, "delivery"); ref(rules.staff, "staff"); ref(rules.per_serve, "per-serve");
  if (!rules.hire && !rules.delivery && !rules.staff && !rules.per_serve) out.push("A package needs at least one priced part.");
  const s = rules.staff;
  if (s) {
    for (const [k, v, max] of [["setup minutes", s.setup_minutes, 600], ["pack-down minutes", s.packdown_minutes, 600], ["minimum hours", s.min_hours, 24], ["included hours", s.included_hours, 24]] as const) {
      if (v != null && (!Number.isFinite(v) || v < 0 || v > max)) out.push(`Staff ${k} must be between 0 and ${max}.`);
    }
  }
  const x = rules.extra_staff;
  if (x && (!(x.serves_over >= 0) || !(x.max_service_hours > 0))) out.push("Second-staff rule needs a number of serves and a number of hours.");
  return out;
}
