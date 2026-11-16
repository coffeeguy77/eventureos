/**
 * Financial position, worked out exactly from the answers and the Xero reports (no AI in the numbers).
 * The AI only writes the assessment on top. A credit report is not part of any of this.
 *
 * Assumptions are explicit and returned with the figures so they're shown next to them:
 *  - tax: 2026-27 resident rates (0 to $18,200; 15% to $45,000; 30% to $135,000; 37% to $190,000; 45% above) + 2% Medicare levy,
 *    per person, no offsets or deductions — an estimate of take-home pay, not a tax calculation
 *  - rent counted at 80% (the usual lender shading), business profit only when no wage figure covers it
 *  - credit cards: 3% of the limit per month; new loan: principal & interest over 30 years at the assessment rate
 */
import type { FlatReport } from "./server";

export interface Assumptions { assessmentRate: number; termYears: number; rentShading: number; cardRate: number }
export const DEFAULT_ASSUMPTIONS: Assumptions = { assessmentRate: 9, termYears: 30, rentShading: 0.8, cardRate: 0.03 };

export interface BusinessYear { org: string; fy: string; revenue: number | null; grossProfit: number | null; netProfit: number | null; assets: number | null; liabilities: number | null; equity: number | null }

export interface Metrics {
  applicants: { name: string; gross: number; salary: number; directors: number; other: number; tax: number; net: number }[];
  rentGross: number; rentCounted: number;
  /** each applicant's own assets and debts, joint ones, and anything without an owner (e.g. home contents) */
  byOwner: { owner: string; assets: number; debts: number; net: number }[];
  incomeGross: number; incomeNetMonthly: number;
  assets: { property: number; super: number; savings: number; vehicles: number; other: number; contents: number; total: number };
  debts: { mortgages: number; cards: number; loans: number; total: number; cardLimits: number };
  netWorth: number;
  monthly: { netIncome: number; living: number; existingRepayments: number; cardCommitment: number; newLoan: number; surplus: number };
  loan: { amount: number | null; value: number | null; deposit: number | null; lvr: number | null };
  dti: number | null;            // all debts after the new loan ÷ gross yearly income
  surplusRatio: number | null;   // monthly surplus ÷ net monthly income
  stress: { rate: number; surplus: number }[];
  business: BusinessYear[];
  assumptions: Assumptions;
}

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const rows = (a: Record<string, unknown>, k: string) => (Array.isArray(a[k]) ? (a[k] as Record<string, string>[]) : []);
const sum = (l: Record<string, string>[], k: string) => l.reduce((t, r) => t + num(r[k]), 0);

/** Yearly tax + Medicare on a person's taxable income (2026-27 resident rates, no offsets). */
export function taxOn(income: number): number {
  const i = Math.max(0, income);
  let t = 0;
  const band = (lo: number, hi: number, r: number) => { if (i > lo) t += (Math.min(i, hi) - lo) * r; };
  band(18_200, 45_000, 0.15); band(45_000, 135_000, 0.3); band(135_000, 190_000, 0.37); band(190_000, Infinity, 0.45);
  return Math.round(t + i * 0.02);
}

/** Monthly principal & interest repayment. */
export function repayment(amount: number, ratePct: number, years: number): number {
  if (!(amount > 0)) return 0;
  const r = ratePct / 100 / 12, n = years * 12;
  return r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n));
}

/** Pull the headline lines out of a Xero profit and loss / balance sheet. */
export function businessYear(org: string, fy: string, pl: FlatReport | null, bs: FlatReport | null): BusinessYear {
  const find = (r: FlatReport | null, re: RegExp) => {
    const row = r?.rows.find((x) => (x.type === "total" || x.type === "row") && re.test((x.cells[0] ?? "").toLowerCase()));
    return row ? num(row.cells[1]) : null;
  };
  return {
    org, fy,
    revenue: find(pl, /^total (trading )?income$|^total revenue$|^total sales$/),
    grossProfit: find(pl, /^gross profit$/),
    netProfit: find(pl, /^net profit$|^net (income|loss)$/),
    assets: find(bs, /^total assets$/), liabilities: find(bs, /^total liabilities$/), equity: find(bs, /^net assets$|^total equity$/),
  };
}

export function analyse(a: Record<string, unknown>, applicants: number, names: string[], business: BusinessYear[], as: Assumptions = DEFAULT_ASSUMPTIONS): Metrics {
  const people = Array.from({ length: applicants }, (_, i) => {
    const salary = num(a[`a${i + 1}.salary`]), directors = num(a[`a${i + 1}.directors_wages`]), other = num(a[`a${i + 1}.other_income`]);
    const gross = salary + directors + other, tax = taxOn(gross);
    return { name: names[i] ?? `Applicant ${i + 1}`, gross, salary, directors, other, tax, net: gross - tax };
  });
  const props = rows(a, "properties"), cards = rows(a, "cards"), loans = rows(a, "loans");
  const rentGross = sum(props, "rent") * 52, rentCounted = Math.round(rentGross * as.rentShading);
  // rent is split evenly between applicants for tax (an estimate)
  const rentTax = applicants ? people.reduce((t, p) => t + (taxOn(p.gross + rentCounted / applicants) - p.tax), 0) : 0;
  const incomeGross = people.reduce((t, p) => t + p.gross, 0) + rentCounted;
  const netYear = people.reduce((t, p) => t + p.net, 0) + rentCounted - rentTax;
  const assets = {
    property: sum(props, "value"), super: sum(rows(a, "super"), "amount"), savings: sum(rows(a, "savings"), "amount"),
    vehicles: sum(rows(a, "vehicles"), "value"), other: sum(rows(a, "other_assets"), "value"), contents: num(a.contents), total: 0,
  };
  assets.total = assets.property + assets.super + assets.savings + assets.vehicles + assets.other + assets.contents;
  const debts = { mortgages: sum(props, "balance"), cards: sum(cards, "balance"), loans: sum(loans, "balance"), total: 0, cardLimits: sum(cards, "limit") };
  debts.total = debts.mortgages + debts.cards + debts.loans;
  const amount = num(a.amount) || null, value = num(a.property_value) || num(a.security_value) || null, deposit = num(a.deposit) || null;
  // who owns what: each applicant on their own, and jointly held
  const owners = [...Array.from({ length: applicants }, (_, i) => `Applicant ${i + 1}`), ...(applicants > 1 ? ["Joint"] : [])];
  const byOwner = owners.map((o) => {
    const mine = (k: string) => rows(a, k).filter((r) => (r.owner || (applicants === 1 ? "Applicant 1" : "")) === o);
    const as_ = sum(mine("properties"), "value") + sum(mine("vehicles"), "value") + sum(mine("savings"), "amount") + sum(mine("super"), "amount") + sum(mine("other_assets"), "value");
    const ds = sum(mine("properties"), "balance") + sum(mine("cards"), "balance") + sum(mine("loans"), "balance");
    return { owner: o, assets: as_, debts: ds, net: as_ - ds };
  });
  const listed = byOwner.reduce((t, x) => t + x.assets, 0), listedD = byOwner.reduce((t, x) => t + x.debts, 0);
  const living = ["exp_groceries", "exp_utilities", "exp_transport", "exp_insurance", "exp_education", "exp_rent", "exp_other"].reduce((t, k) => t + num(a[k]), 0);
  const existingRepayments = sum(props, "repayment") + sum(loans, "repayment");
  const cardCommitment = Math.round(debts.cardLimits * as.cardRate);
  const netIncome = Math.round(netYear / 12);
  const at = (rate: number) => Math.round(repayment(amount ?? 0, rate, as.termYears));
  const newLoan = at(as.assessmentRate);
  const surplus = netIncome - living - existingRepayments - cardCommitment - newLoan;
  const debtAfter = debts.total + (amount ?? 0);
  return {
    byOwner: [...byOwner, ...((assets.total - listed) > 0 || (debts.total - listedD) > 0 ? [{ owner: "Not assigned", assets: assets.total - listed, debts: debts.total - listedD, net: assets.total - listed - (debts.total - listedD) }] : [])],
    applicants: people, rentGross, rentCounted, incomeGross, incomeNetMonthly: netIncome,
    assets, debts, netWorth: assets.total - debts.total,
    monthly: { netIncome, living, existingRepayments, cardCommitment, newLoan, surplus },
    loan: { amount, value, deposit, lvr: amount && value ? Math.round((amount / value) * 1000) / 10 : null },
    dti: incomeGross > 0 ? Math.round((debtAfter / incomeGross) * 10) / 10 : null,
    surplusRatio: netIncome > 0 ? Math.round((surplus / netIncome) * 1000) / 10 : null,
    stress: [-2, -1, 0, 1, 2, 3].map((d) => { const rate = Math.max(1, as.assessmentRate + d); return { rate, surplus: netIncome - living - existingRepayments - cardCommitment - at(rate) }; }),
    business, assumptions: as,
  };
}

/** The AI's assessment, saved on the file with the figures it was given. */
export interface Assessment {
  rating: "Strong" | "Sound" | "Stretched" | "Weak"; score: number; headline: string; summary: string;
  strengths: string[]; risks: string[]; mitigants: string[]; questions: string[];
}
export interface SavedAnalysis { at: string; by: string; assessment: Assessment; metrics: Metrics; assumptions: Assumptions }
