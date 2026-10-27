/**
 * Recurring invoices (pure): schedules, due dates, and turning a Xero repeating invoice into one kept here.
 */
export type Unit = "week" | "month";
export type DueType = "days_after" | "days_after_month_end" | "day_of_month" | "day_of_next_month";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** The next date after `from`: N weeks, or N months on the anchor day (clamped to short months: 31st → 30th/28th). */
export function advance(from: string, every: number, unit: Unit, anchorDay?: number | null): string {
  const d = parse(from);
  if (unit === "week") { d.setUTCDate(d.getUTCDate() + 7 * every); return iso(d); }
  const day = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : d.getUTCDate();
  const m = d.getUTCMonth() + every, y = d.getUTCFullYear() + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return iso(new Date(Date.UTC(y, mm, Math.min(day, daysIn(y, mm)))));
}

export function dueDate(issue: string, type: DueType, days: number): string {
  const d = parse(issue), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const n = Math.max(0, Math.round(days));
  if (type === "days_after") { d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  if (type === "days_after_month_end") return iso(new Date(Date.UTC(y, m, daysIn(y, m) + n)));
  if (type === "day_of_month") { const due = iso(new Date(Date.UTC(y, m, Math.min(Math.max(1, n), daysIn(y, m))))); return due < issue ? issue : due; }
  const ny = m === 11 ? y + 1 : y, nm = (m + 1) % 12;
  return iso(new Date(Date.UTC(ny, nm, Math.min(Math.max(1, n), daysIn(ny, nm)))));
}

export const describeSchedule = (every: number, unit: Unit) => (every === 1 ? (unit === "week" ? "Weekly" : "Monthly") : unit === "month" && every === 12 ? "Yearly" : unit === "month" && every === 3 ? "Quarterly" : `Every ${every} ${unit}s`);

export interface Line { description: string; quantity: number; unit_amount: number; tax_rate: 0 | 10; item_code: string | null; account_code: string | null; inc: true }
const r2 = (n: number) => Math.round(n * 100) / 100;
export const linesTotal = (ls: Pick<Line, "quantity" | "unit_amount">[]) => r2(ls.reduce((a, l) => a + r2(Number(l.quantity) * Number(l.unit_amount)), 0));

export interface XeroRepeating {
  RepeatingInvoiceID: string; Type?: string; Status?: string; Reference?: string; LineAmountTypes?: string; Total?: number; ApprovedForSending?: boolean;
  Contact?: { ContactID: string; Name?: string };
  Schedule?: { Period?: number; Unit?: string; DueDate?: number; DueDateType?: string; StartDate?: string; NextScheduledDate?: string; NextScheduledDateString?: string; EndDate?: string; EndDateString?: string; StartDateString?: string };
  LineItems?: { Description?: string; Quantity?: number; UnitAmount?: number; ItemCode?: string; AccountCode?: string; LineAmount?: number; TaxAmount?: number; TaxType?: string; DiscountRate?: number }[];
}

/** Xero lines → lines GST inclusive. Each line keeps its quantity when the unit price divides evenly; otherwise it becomes 1 × the line total. */
export function linesFromXero(x: XeroRepeating): Line[] {
  const exclusive = (x.LineAmountTypes ?? "Exclusive") === "Exclusive";
  return (x.LineItems ?? []).map((l) => {
    const qty = Number(l.Quantity ?? 1) || 1;
    const base = l.LineAmount != null ? Number(l.LineAmount) : r2(qty * Number(l.UnitAmount ?? 0) * (1 - Number(l.DiscountRate ?? 0) / 100));
    const tax = Number(l.TaxAmount ?? 0);
    const taxed = tax !== 0 || /OUTPUT/.test(l.TaxType ?? "") && !/EXEMPT|NONE|BASEXCLUDED/i.test(l.TaxType ?? "");
    const inc = r2(exclusive ? base + (tax || (taxed ? base * 0.1 : 0)) : base);
    const unit = r2(inc / qty);
    const even = r2(unit * qty) === inc;
    const desc = (l.Description ?? "").trim().slice(0, 4000) || "Services";
    return { description: even ? desc : `${desc} (${qty} × ${r2(inc / qty)})`, quantity: even ? qty : 1, unit_amount: even ? unit : inc, tax_rate: taxed ? 10 : 0, item_code: l.ItemCode?.trim() || null, account_code: l.AccountCode?.trim() || null, inc: true } as Line;
  });
}

export function scheduleFromXero(x: XeroRepeating, xeroDate: (v?: string | null, alt?: string | null) => string | null) {
  const s = x.Schedule ?? {};
  const unit: Unit = s.Unit === "WEEKLY" ? "week" : "month";
  const every = Math.min(60, Math.max(1, Number(s.Period ?? 1) || 1));
  const start = xeroDate(s.StartDate, s.StartDateString);
  const next = xeroDate(s.NextScheduledDate, s.NextScheduledDateString) ?? start;
  const end = xeroDate(s.EndDate, s.EndDateString);
  const due_type: DueType = s.DueDateType === "DAYSAFTERBILLMONTH" ? "days_after_month_end" : s.DueDateType === "OFCURRENTMONTH" ? "day_of_month" : s.DueDateType === "OFFOLLOWINGMONTH" ? "day_of_next_month" : "days_after";
  return { unit, every, next_date: next, end_date: end, anchor_day: unit === "month" && (start ?? next) ? parse((start ?? next)!).getUTCDate() : null, due_type, due_days: Math.max(0, Number(s.DueDate ?? 14) || 0) };
}

/** A category from the lines' Xero account names (e.g. "Web Culture Hosting Clients" → hosting). */
export function categoryFor(lines: Pick<Line, "account_code" | "item_code" | "description">[], accountNames: Record<string, string>): string {
  const text = lines.map((l) => `${accountNames[l.account_code ?? ""] ?? ""} ${l.item_code ?? ""} ${l.description}`).join(" ").toLowerCase();
  if (/hosting|\bhost\b|cpanel|backup/.test(text)) return "hosting";
  if (/adwords|google ads|\bppc\b|\bseo\b|ads management/.test(text)) return "adwords";
  if (/domain/.test(text)) return "domains";
  return "other";
}

export const sendModeFromXero = (x: XeroRepeating): "draft" | "authorise" | "email" => (x.Status === "DRAFT" ? "draft" : x.ApprovedForSending ? "email" : "authorise");
