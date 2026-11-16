import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ANTHROPIC_URL, anthropicHeaders } from "@/lib/ai/claude";
import { replyModel } from "@/lib/ai/reply";
import { orgAiKey } from "@/lib/ai/key";
import { analyse, businessYear, DEFAULT_ASSUMPTIONS, type Assessment, type Assumptions, type BusinessYear, type SavedAnalysis } from "./analysis";
import { applicantNames, type FlatReport, type LoanFileRow } from "./server";
import { fieldShown, ownerLabel, steps } from "./form";

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
    applicants: m.applicants.map((p, i) => ({ name: p.name, employment: a[`a${i + 1}.employment`] ?? null, occupation: a[`a${i + 1}.occupation`] ?? null, employed_since: a[`a${i + 1}.employed_since`] ?? null, dependants: a[`a${i + 1}.dependants`] ?? null, residential: a[`a${i + 1}.residential`] ?? null, gross_yearly_total: p.gross, of_which: { salary: p.salary, directors_wages: p.directors, other_income: p.other, business_profit_share: p.business }, est_tax: p.tax })),
    business_income_entered: (Array.isArray(a.businesses) ? (a.businesses as Record<string, string>[]) : []).map((r) => ({ name: r.name ?? null, owner: r.owner ? ownerLabel(r.owner, names) : null, fy: r.fy ?? null, result: r.result ?? null, net_before_tax: r.net_profit ?? null, addbacks: r.addbacks ?? null, left_out_of_income: r.exclude === "yes", note: r.note ?? null })),
    rent_note: "Rent from a property rented to the applicants' own business is counted in full; other rent at the shading rate.",
    // only the loan questions asked for this purpose (answers to hidden questions are left out)
    loan_answers: Object.fromEntries((steps(file.applicants).find((s) => s.key === "loan")?.fields ?? []).filter((f) => fieldShown(f, a) && a[f.key] != null && a[f.key] !== "").map((f) => [f.label, a[f.key]])),
    home_contents_note: "Home contents are household property, counted as jointly owned.",
    ownership: m.byOwner.map((o) => ({ ...o, owner: ownerLabel(o.owner, names) })),
    loan: { purpose: a.purpose ?? null, amount: m.loan.amount, value: m.loan.value, deposit: m.loan.deposit, deposit_source: m.loan.deposit ? a.deposit_source ?? null : null, lvr_pct: m.loan.lvr, rate_type: a.rate_type ?? null, repayments: a.repay_type ?? null, first_home: a.first_home ?? null, timeframe: a.timeframe ?? null },
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
- If the figures are thin (much not answered yet), still give an assessment of what IS there, rate it on that, and list what's missing under questions.
Record your assessment with the record_assessment tool.`;
  const key = await orgAiKey(file.organisation_id);
  const o = await assessWithTool(key, system, `CLIENT FIGURES (JSON):\n${JSON.stringify(facts)}`);
  const assessment: Assessment = {
    rating: pick(o.rating, ["Strong", "Sound", "Stretched", "Weak"] as const, "Sound"),
    score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 0))),
    headline: String(o.headline ?? "").slice(0, 200), summary: String(o.summary ?? "").slice(0, 1600),
    strengths: strs(o.strengths, 6), risks: strs(o.risks, 6), mitigants: strs(o.mitigants, 6), questions: strs(o.questions, 8),
  };
  // keep a short history of the headline figures, for "vs last review" and the trend lines
  const point = (x: { at: string; metrics: { assets: { total: number }; debts: { total: number }; monthly: { surplus: number }; dti: number | null; netWorth: number } }) =>
    ({ at: x.at, assets: x.metrics.assets.total, debts: x.metrics.debts.total, surplus: x.metrics.monthly.surplus, dti: x.metrics.dti, net: x.metrics.netWorth });
  const history = [...(prev?.history ?? []), ...(prev?.metrics ? [point(prev as never)] : [])].slice(-12);
  const saved: SavedAnalysis = { at: new Date().toISOString(), by, assessment, metrics: m, assumptions, history };
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

const TOOL = {
  name: "record_assessment",
  description: "Record the broker-facing assessment of the client's financial position.",
  input_schema: {
    type: "object",
    properties: {
      rating: { type: "string", enum: ["Strong", "Sound", "Stretched", "Weak"] },
      score: { type: "integer", minimum: 0, maximum: 100, description: "Overall strength of the position, 0-100" },
      headline: { type: "string", description: "One line" },
      summary: { type: "string", description: "3-5 sentences citing the actual figures" },
      strengths: { type: "array", items: { type: "string" }, maxItems: 6 },
      risks: { type: "array", items: { type: "string" }, maxItems: 6 },
      mitigants: { type: "array", items: { type: "string" }, maxItems: 6 },
      questions: { type: "array", items: { type: "string" }, maxItems: 8, description: "What the broker should confirm or collect" },
    },
    required: ["rating", "score", "headline", "summary", "strengths", "risks", "mitigants", "questions"],
  },
};

/** Ask Claude for the assessment as a forced tool call, so the answer always comes back as structured data. */
async function assessWithTool(key: string | null, system: string, user: string): Promise<Record<string, unknown>> {
  if (!key) throw new Error("The AI analysis needs a Claude API key — add one in Settings → Integrations.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST", signal: ctrl.signal, headers: anthropicHeaders(key),
      body: JSON.stringify({ model: replyModel(), max_tokens: 3000, system, tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name }, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`The AI service said ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { stop_reason?: string; content?: { type: string; name?: string; input?: Record<string, unknown> }[] };
    const call = j.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name);
    if (!call?.input) throw new Error(j.stop_reason === "max_tokens" ? "The AI's answer was cut short — try again." : "The AI didn't return an assessment — try again.");
    return call.input;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("The AI took too long to reply — try again.");
    throw e;
  } finally { clearTimeout(timer); }
}
