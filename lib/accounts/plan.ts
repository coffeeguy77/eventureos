/**
 * Payment plans (pure): split what a customer owes into weekly or fortnightly payments charged to their card on file,
 * and share each payment across their invoices, oldest first. Unit tested with node:test.
 */
export type Frequency = "weekly" | "fortnightly";
export interface Instalment { n: number; date: string; amount: number }

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const r2 = (n: number) => Math.round(n * 100) / 100;
export const stepDays = (f: Frequency) => (f === "weekly" ? 7 : 14);

/**
 * The schedule: either a number of payments (equal, the last one evens out the cents) or an amount per payment
 * (the last one is whatever's left). At most 104 payments.
 */
export function planSchedule(total: number, f: Frequency, start: string, by: { count: number } | { amount: number }): Instalment[] {
  const t = r2(total);
  if (!(t > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  let amounts: number[];
  if ("count" in by) {
    const n = Math.max(1, Math.min(104, Math.floor(by.count)));
    const each = Math.floor((t / n) * 100) / 100;
    amounts = Array.from({ length: n }, (_, i) => (i === n - 1 ? r2(t - each * (n - 1)) : each));
  } else {
    const a = r2(by.amount);
    if (!(a > 0)) return [];
    const n = Math.min(104, Math.ceil(t / a - 1e-9));
    amounts = Array.from({ length: n }, (_, i) => (i === n - 1 ? r2(t - a * (n - 1)) : a)).filter((x) => x > 0);
  }
  return amounts.map((amount, i) => ({ n: i + 1, date: addDays(start, i * stepDays(f)), amount }));
}

/** One payment shared across invoices, oldest first: how much goes on each. */
export function allocate(amount: number, invoices: { id: string; balance: number }[]): { id: string; amount: number }[] {
  let left = r2(amount);
  const out: { id: string; amount: number }[] = [];
  for (const i of invoices) {
    if (left <= 0) break;
    const take = r2(Math.min(left, Math.max(0, i.balance)));
    if (take > 0) { out.push({ id: i.id, amount: take }); left = r2(left - take); }
  }
  return out;
}

/** Billing period prices from a yearly price: quarterly costs `loading`% more than paying yearly. */
export function periodPrices(yearly: number, loadingPct: number) {
  const y = r2(yearly);
  const quarter = r2((y * (1 + loadingPct / 100)) / 4);
  const month = r2((y * (1 + loadingPct / 100)) / 12);
  const quarterYear = r2(quarter * 4);
  return { yearly: y, quarterly: quarter, monthly: month, quarterlyPerYear: quarterYear, yearlySaves: r2(quarterYear - y), yearlySavesPct: quarterYear > 0 ? Math.round(((quarterYear - y) / quarterYear) * 1000) / 10 : 0 };
}
