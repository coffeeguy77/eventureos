/** The numbers a broker looks at first, worked out from the answers. All yearly unless named monthly. */
export interface LoanSummary {
  amount: number | null; value: number | null; deposit: number | null; lvr: number | null;
  income: number; rentIncome: number; assets: number; liabilities: number; net: number;
  monthlyLiving: number; monthlyRepayments: number; cardLimits: number;
}

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
const rows = (a: Record<string, unknown>, k: string) => (Array.isArray(a[k]) ? (a[k] as Record<string, string>[]) : []);
const sum = (list: Record<string, string>[], k: string) => list.reduce((t, r) => t + num(r[k]), 0);

export function summarise(a: Record<string, unknown>, applicants: number): LoanSummary {
  let income = 0;
  for (let i = 1; i <= applicants; i++) income += num(a[`a${i}.salary`]) + num(a[`a${i}.directors_wages`]) + num(a[`a${i}.other_income`]);
  const props = rows(a, "properties"), cards = rows(a, "cards"), loans = rows(a, "loans");
  const rentIncome = props.reduce((t, r) => t + num(r.rent) * (r.rent_period === "Per month" ? 12 : 52), 0);
  const assets = sum(props, "value") + sum(rows(a, "vehicles"), "value") + sum(rows(a, "savings"), "amount") + sum(rows(a, "super"), "amount") + sum(rows(a, "other_assets"), "value") + num(a.contents);
  const liabilities = sum(props, "balance") + sum(cards, "balance") + sum(loans, "balance");
  const monthlyLiving = ["exp_groceries", "exp_utilities", "exp_transport", "exp_insurance", "exp_education", "exp_rent", "exp_other"].reduce((t, k) => t + num(a[k]), 0);
  const amount = num(a.amount) || null, value = num(a.property_value) || null, deposit = num(a.deposit) || null;
  return {
    amount, value, deposit, lvr: amount && value ? Math.round((amount / value) * 1000) / 10 : null,
    income: income + rentIncome, rentIncome, assets, liabilities, net: assets - liabilities,
    monthlyLiving, monthlyRepayments: sum(props, "repayment") + sum(loans, "repayment"), cardLimits: sum(cards, "limit"),
  };
}

export const aud = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`);
