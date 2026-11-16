import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseJSONObject } from "@/lib/ai/claude";
import { callClaudeRaw } from "@/lib/ai/reply";
import { orgAiKey } from "@/lib/ai/key";
import { analyse, businessYear, DEFAULT_ASSUMPTIONS, type Assessment, type Assumptions, type BusinessYear, type SavedAnalysis } from "./analysis";
import { applicantNames, type FlatReport, type LoanFileRow } from "./server";
import { ownerLabel } from "./form";

/** The Xero years pulled for a file, as headline figures. */
export async function businessYears(db: SupabaseClient, fileId: string): Promise<BusinessYear[]> {
  const { data } = await db.from("loan_connections").select("data").eq("file_id", fileId).eq("provider", "xero");
  const out: BusinessYear[] = [];
  for (const c of data ?? []) for (const r of (((c.data ?? {}) as { reports?: { tenant: string; fy: string; pl: FlatReport; bs: FlatReport }[] }).reports ?? [])) out.push(businessYear(r.tenant, r.fy, r.pl, r.bs));
  return out.sort((x, y) => x.org.localeCompare(y.org) || x.fy.localeCompare(y.fy));
}

const pick = <T extends string>(v: unknown, list: readonly T[], d: T) => (list.includes(v as T) ? (v as T) : d);
const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 400)).slice(0, n) : []);

/** Work out the figures and ask Claude for an assessment; saved on the file. */
export async function runAssessment(db: SupabaseClient, file: LoanFileRow, by: string, as?: Partial<Assumptions>): Promise<SavedAnalysis> {
  const { data: pa } = await db.from("loan_files").select("analysis").eq("id", file.id).maybeSingle().then((r) => r, () => ({ data: null }));
  const prev = (pa as { analysis?: SavedAnalysis | null } | null)?.analysis ?? null;
  if (prev?.at && Date.now() - new Date(prev.at).getTime() < 45_000) throw new Error("It was just analysed — give it a minute before running it again.");
  const assumptions: Assumptions = { ...DEFAULT_ASSUMPTIONS, ...(prev?.assumptions ?? {}), ...cleanAssumptions(as) };
  const names = applicantNames(file);
  const business = await businessYears(db, file.id);
  const m = analyse(file.answers, file.applicants, names, business, assumptions);
  const a = file.answers;
  const facts = {
    applicants: m.applicants.map((p, i) => ({ name: p.name, employment: a[`a${i + 1}.employment`] ?? null, occupation: a[`a${i + 1}.occupation`] ?? null, employed_since: a[`a${i + 1}.employed_since`] ?? null, dependants: a[`a${i + 1}.dependants`] ?? null, residential: a[`a${i + 1}.residential`] ?? null, gross_yearly: p.gross, est_tax: p.tax })),
    loan_answers: Object.fromEntries(["purpose", "property_type", "first_home", "property_value", "deposit", "deposit_source", "security_address", "security_value", "refi_balance", "refi_why", "consolidate_amount", "equity_for", "asset_what", "asset_price", "asset_trade", "business_for"].filter((k) => a[k]).map((k) => [k, a[k]])),
    ownership: m.byOwner.map((o) => ({ ...o, owner: ownerLabel(o.owner, names) })),
    loan: { purpose: a.purpose ?? null, amount: m.loan.amount, value: m.loan.value, deposit: m.loan.deposit, deposit_source: a.deposit_source ?? null, lvr_pct: m.loan.lvr, rate_type: a.rate_type ?? null, repayments: a.repay_type ?? null, first_home: a.first_home ?? null, timeframe: a.timeframe ?? null },
    looking_ahead: { changes: a.changes ?? null, what: a.changes_what ?? null, how: a.changes_how ?? null },
    income: { gross_yearly_incl_rent: m.incomeGross, rent_gross: m.rentGross, rent_counted: m.rentCounted, net_monthly_est: m.incomeNetMonthly },
    assets: m.assets, debts: m.debts, net_worth: m.netWorth,
    monthly: m.monthly, dti: m.dti, surplus_pct_of_net: m.surplusRatio, stress_test: m.stress,
    business_from_xero: m.business, assumptions: m.assumptions,
  };
  const system = `You are an experienced Australian mortgage broker's credit analyst. You assess a client's financial position from the figures given, for the broker (not the client).
Rules:
- Use ONLY the figures and facts given; never invent numbers. If something important is missing, say so in "questions".
- A credit report is NOT part of this — do not guess credit history; you may note it still needs checking.
- Figures marked est are estimates from stated assumptions; treat them that way.
- Be specific: cite the actual figures (e.g. "LVR 75%", "surplus $1,240/month at 9%").
- Australian English, plain and professional. No advice to the client; this is the broker's working assessment.
Reply with ONLY JSON:
{"rating":"Strong"|"Sound"|"Stretched"|"Weak","score":0-100,"headline":"one line","summary":"3-5 sentences","strengths":["…"],"risks":["…"],"mitigants":["…"],"questions":["what the broker should confirm or collect"]}`;
  const key = await orgAiKey(file.organisation_id);
  const raw = await callClaudeRaw(key, system, `CLIENT FIGURES (JSON):\n${JSON.stringify(facts)}`, 1400, 60_000);
  const o = parseJSONObject(raw);
  const assessment: Assessment = {
    rating: pick(o.rating, ["Strong", "Sound", "Stretched", "Weak"] as const, "Sound"),
    score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 0))),
    headline: String(o.headline ?? "").slice(0, 200), summary: String(o.summary ?? "").slice(0, 1600),
    strengths: strs(o.strengths, 6), risks: strs(o.risks, 6), mitigants: strs(o.mitigants, 6), questions: strs(o.questions, 8),
  };
  const saved: SavedAnalysis = { at: new Date().toISOString(), by, assessment, metrics: m, assumptions };
  const { error } = await db.from("loan_files").update({ analysis: saved }).eq("id", file.id);
  if (error) throw new Error(/analysis/.test(error.message) ? "Run the database update 0107_loan_brokers.sql first." : error.message);
  return saved;
}

export function cleanAssumptions(as?: Partial<Assumptions>): Partial<Assumptions> {
  const o: Partial<Assumptions> = {};
  if (as?.assessmentRate !== undefined && Number.isFinite(Number(as.assessmentRate))) o.assessmentRate = Math.min(20, Math.max(1, Math.round(Number(as.assessmentRate) * 100) / 100));
  if (as?.termYears !== undefined && Number.isFinite(Number(as.termYears))) o.termYears = Math.min(40, Math.max(5, Math.round(Number(as.termYears))));
  return o;
}
