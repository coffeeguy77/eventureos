"use client";

import { useMemo } from "react";
import {
  ArrowRight, ArrowDownRight, ArrowUpRight, Building2, Calculator, CheckCircle2, Circle, Coins, Home, Landmark, Layers, Scale, User, Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { analyse, DEFAULT_ASSUMPTIONS, type BusinessYear, type ReviewPoint, type SavedAnalysis } from "@/lib/loans/analysis";
import { ownerLabel, stepProgress, steps as allSteps } from "@/lib/loans/form";
import type { DocRequest } from "@/lib/loans/server";

const aud = (n: number | null | undefined) => (n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export interface OverviewProps {
  answers: Record<string, unknown>;
  applicants: number;
  names: string[];          // first names
  fullNames: string[];
  requests: DocRequest[];
  signedApplicants: number[];
  business: BusinessYear[];
  saved: SavedAnalysis | null;
  /** where the overview's links go: "#financials" on the broker page, etc. */
  links: { assessment: string; documents: string; applicants: string; properties: string };
}

/**
 * The application at a glance: readiness, headline figures with their trend since the last review, monthly cash flow,
 * next best actions, financial position, the document checklist and the applicants.
 */
export function LoanOverview({ answers: a, applicants, names, fullNames, requests, signedApplicants, business, saved, links }: OverviewProps) {
  const m = useMemo(() => analyse(a, applicants, names, business, { ...DEFAULT_ASSUMPTIONS, ...(saved?.assumptions ?? {}) }), [a, applicants, names, business, saved]);
  const steps = useMemo(() => allSteps(applicants).filter((s) => !s.special), [applicants]);
  const answered = steps.reduce((t, s) => t + stepProgress(s, applicants, a), 0) / steps.length;
  const docsTotal = requests.filter((r) => r.status !== "not_applicable").length;
  const docsIn = requests.filter((r) => r.status === "received" || r.status === "accepted").length;
  const outstanding = requests.filter((r) => r.status === "needed" || r.status === "redo");
  const readiness = Math.round(100 * (0.5 * answered + 0.35 * (docsTotal ? docsIn / docsTotal : 0) + 0.15 * (signedApplicants.length / applicants)));
  const ai = saved?.assessment;

  // next best actions: what's actually holding the application up, then the AI's questions
  const actions: { title: string; sub: string; href: string }[] = [];
  const unsigned = names.filter((_, i) => !signedApplicants.includes(i + 1));
  if (answered < 0.999) actions.push({ title: "Finish the application", sub: `${Math.round(answered * 100)}% of questions answered`, href: links.applicants });
  if (outstanding.length) {
    const first = outstanding[0];
    actions.push({ title: `Collect ${outstanding.length} document${outstanding.length === 1 ? "" : "s"}`, sub: `${first.applicant ? `${names[first.applicant - 1]}: ` : ""}${first.label}${outstanding.length > 1 ? ` and ${outstanding.length - 1} more` : ""}`, href: links.documents });
  }
  if (unsigned.length) actions.push({ title: `Signature${unsigned.length > 1 ? "s" : ""} needed`, sub: `${unsigned.join(" and ")} — each signs from their own link`, href: links.applicants });
  for (const q of ai?.questions ?? []) if (actions.length < 5) actions.push({ title: q.length > 70 ? `${q.slice(0, 68)}…` : q, sub: "From the assessment", href: links.assessment });
  if (!ai && actions.length < 5) actions.push({ title: "Run the assessment", sub: "AI review of the financial position", href: links.assessment });

  // trend since the last review
  const hist: ReviewPoint[] = [...(saved?.history ?? []), ...(saved ? [{ at: saved.at, assets: saved.metrics.assets.total, debts: saved.metrics.debts.total, surplus: saved.metrics.monthly.surplus, dti: saved.metrics.dti, net: saved.metrics.netWorth }] : [])];
  const last = hist.length ? hist[hist.length - 1] : null;
  const series = (k: keyof Omit<ReviewPoint, "at">, now: number | null) => [...hist.map((h) => Number(h[k] ?? 0)), now ?? 0];

  const assetsParts = [
    { label: "Property", value: m.assets.property, cls: "bg-emerald-800" },
    { label: "Super", value: m.assets.super, cls: "bg-emerald-600" },
    { label: "Cash & savings", value: m.assets.savings, cls: "bg-emerald-400" },
    { label: "Vehicles", value: m.assets.vehicles, cls: "bg-emerald-300" },
    { label: "Other", value: m.assets.other + m.assets.contents, cls: "bg-emerald-200" },
  ].filter((x) => x.value > 0);
  const scale = Math.max(m.assets.total, m.debts.total, 1);
  const props = (Array.isArray(a.properties) ? a.properties : []) as Record<string, string>[];
  const purpose = String(a.purpose ?? "").split("|").filter(Boolean).join(", ");

  // applicants: income and how far verification has got (their payslip / tax documents)
  const people = fullNames.map((n, i) => {
    const mine = requests.filter((r) => r.applicant === i + 1 && ["payslip", "noa", "tax_return"].includes(r.kind ?? ""));
    const ok = mine.filter((r) => r.status === "accepted").length, got = mine.filter((r) => r.status === "received").length;
    const v = !mine.length ? null : ok === mine.length ? "verified" : ok + got === mine.length ? "received" : "pending";
    const missing = mine.find((r) => r.status === "needed" || r.status === "redo");
    return {
      name: n, employment: [a[`a${i + 1}.occupation`], a[`a${i + 1}.employment`]].filter(Boolean).join(" · ") || "—",
      income: m.applicants[i]?.gross ?? 0, v, missing: missing ? missing.label.replace(/ (FY|—).*$/, "").toLowerCase() : null, signed: signedApplicants.includes(i + 1),
    };
  });

  return (
    <div className="space-y-4">
      {/* insight banner */}
      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(115deg,#082520_0%,#0d3a30_55%,#0a2c26_100%)] px-5 py-6 text-white shadow-sm sm:px-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#34d399]/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6">
          <div className="min-w-0 flex-1 basis-80">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[#6ee7b7]">Application insight{ai ? ` · ${ai.rating}` : ""}</p>
            <h2 className="mt-2 font-serif text-[1.5rem] font-semibold leading-tight sm:text-[1.875rem]">{ai?.headline || (answered > 0.2 ? "Taking shape — run the assessment for a full review." : "Getting started.")}</h2>
            <p className="mt-2 max-w-2xl text-[0.9375rem] text-white/75">{actions[0] ? `${actions[0].title}${actions[0].sub ? ` — ${actions[0].sub.toLowerCase()}` : ""} is the next priority.` : "Everything's in — ready for lender matching."}</p>
            <a href={links.assessment} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[0.875rem] font-semibold text-white ring-1 ring-inset ring-white/40 hover:bg-white/10">{ai ? "View assessment" : "Run assessment"}<ArrowRight className="h-4 w-4" /></a>
          </div>
          <div className="hidden h-24 w-px bg-white/15 md:block" />
          <Ring value={readiness} />
          {actions.length > 0 && (
            <a href="#next-actions" className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[0.875rem] font-semibold text-[#a7f3d0] ring-1 ring-inset ring-[#34d399]/60 hover:bg-[#34d399]/10">
              <Zap className="h-4 w-4 text-[#6ee7b7]" />{actions.length} action{actions.length === 1 ? "" : "s"} to progress
            </a>
          )}
        </div>
      </section>

      {/* headline figures */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Layers className="h-5 w-5" />} label="Total assets" value={aud(m.assets.total)} prev={last?.assets} now={m.assets.total} up="good" data={series("assets", m.assets.total)} />
        <Kpi icon={<Landmark className="h-5 w-5" />} label="Total liabilities" value={aud(m.debts.total)} prev={last?.debts} now={m.debts.total} up="bad" data={series("debts", m.debts.total)} />
        <Kpi icon={<Coins className="h-5 w-5" />} label="Monthly surplus" value={m.monthly.netIncome ? aud(m.monthly.surplus) : "—"} prev={last?.surplus} now={m.monthly.surplus} up="good" data={series("surplus", m.monthly.surplus)} />
        <Kpi icon={<Scale className="h-5 w-5" />} label="Debt-to-income" value={m.dti == null ? "—" : `${m.dti}×`} prev={last?.dti ?? undefined} now={m.dti ?? undefined} up="bad" data={series("dti", m.dti)} fmt={(v) => `${v}×`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* monthly cash flow */}
        <Card className="lg:col-span-7" title="Monthly cash flow" right="Household (combined) · per month">
          {!m.monthly.netIncome ? <Empty>Shows once income is entered.</Empty> : (() => {
            const out = m.monthly.existingRepayments + m.monthly.cardCommitment + m.monthly.newLoan;
            const max = Math.max(m.monthly.netIncome, m.monthly.living, out, 1);
            return (
              <div className="space-y-3">
                {[
                  { label: "Income", sub: "take-home, est.", v: m.monthly.netIncome, cls: "bg-emerald-800" },
                  { label: "Expenses", sub: "living costs", v: m.monthly.living, cls: "bg-emerald-400/70" },
                  { label: "Repayments", sub: `incl. new loan at ${saved?.assumptions.assessmentRate ?? DEFAULT_ASSUMPTIONS.assessmentRate}%`, v: out, cls: "bg-emerald-300/70" },
                ].map((r) => (
                  <div key={r.label} className="grid grid-cols-[92px_96px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[110px_110px_minmax(0,1fr)]">
                    <span className="text-[0.875rem] text-ink">{r.label}<span className="block text-[0.6875rem] text-ink-faint">{r.sub}</span></span>
                    <span className="text-right text-[0.9375rem] font-semibold tabular-nums text-ink">{aud(r.v)}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-canvas"><div className={cn("h-full rounded-full", r.cls)} style={{ width: `${(r.v / max) * 100}%` }} /></div>
                  </div>
                ))}
                <div className={cn("mt-1 flex items-center justify-between rounded-xl px-4 py-3", m.monthly.surplus >= 0 ? "bg-emerald-50" : "bg-rose-50")}>
                  <span className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink"><Calculator className="h-4 w-4 text-ink-muted" />Monthly {m.monthly.surplus >= 0 ? "surplus" : "shortfall"}</span>
                  <span className="text-[1.25rem] font-bold tabular-nums text-ink">{aud(m.monthly.surplus)}</span>
                </div>
              </div>
            );
          })()}
        </Card>

        {/* next best actions */}
        <Card className="lg:col-span-5" title="Next best actions" id="next-actions">
          {!actions.length ? <Empty>Nothing outstanding.</Empty> : (
            <ol className="divide-y divide-line">
              {actions.slice(0, 5).map((x, i) => (
                <li key={i}>
                  <a href={x.href} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-[0.8125rem] font-bold text-emerald-800">{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[0.875rem] font-semibold text-ink">{x.title}</span><span className="block truncate text-[0.75rem] text-ink-muted">{x.sub}</span></span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </a>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* financial position */}
        <Card className="lg:col-span-7" title="Financial position" right={<>Net position: <b className="text-ink">{aud(m.netWorth)}</b></>}>
          {!m.assets.total && !m.debts.total ? <Empty>Shows once assets and debts are entered.</Empty> : (
            <div className="space-y-3">
              <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[110px_110px_minmax(0,1fr)]">
                <span className="text-[0.875rem] text-ink">Assets</span>
                <span className="hidden text-right text-[0.9375rem] font-semibold tabular-nums text-ink sm:block">{aud(m.assets.total)}</span>
                <div className="flex h-4 gap-[2px] overflow-hidden rounded-full bg-canvas">
                  {assetsParts.map((p) => <div key={p.label} title={`${p.label}: ${aud(p.value)}`} className={cn("h-full", p.cls)} style={{ width: `${(p.value / scale) * 100}%` }} />)}
                </div>
              </div>
              <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[110px_110px_minmax(0,1fr)]">
                <span className="text-[0.875rem] text-ink">Liabilities</span>
                <span className="hidden text-right text-[0.9375rem] font-semibold tabular-nums text-ink sm:block">{aud(m.debts.total)}</span>
                <div className="h-4 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-emerald-600/60" style={{ width: `${(m.debts.total / scale) * 100}%` }} /></div>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[0.75rem] text-ink-muted">
                {assetsParts.map((p) => <li key={p.label} className="flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-[3px]", p.cls)} />{p.label} {pct(p.value, m.assets.total)}%</li>)}
                <li className="ml-auto font-medium text-ink">Total assets {aud(m.assets.total)}</li>
              </ul>
              {props.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {props.slice(0, 4).map((p, i) => (
                    <a key={i} href={links.properties} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-inset ring-line hover:ring-ink-faint">
                      {p.use === "Investment" ? <Building2 className="h-5 w-5 shrink-0 text-ink-muted" /> : <Home className="h-5 w-5 shrink-0 text-ink-muted" />}
                      <span className="min-w-0 flex-1"><span className="block truncate text-[0.8125rem] font-semibold text-ink">{p.use || "Property"}</span><span className="block truncate text-[0.75rem] text-ink-muted">{p.address || "Address not given"}</span></span>
                      <span className="text-right"><span className="block text-[0.875rem] font-semibold tabular-nums text-ink">{aud(Number(String(p.value ?? "").replace(/[^\d.]/g, "")) || null)}</span><span className="block text-[0.6875rem] text-ink-faint">Est. value</span></span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* document checklist */}
        <Card className="lg:col-span-5" title="Document checklist" right={`${docsIn} of ${docsTotal} received`}>
          {!requests.length ? <Empty>No documents requested.</Empty> : (
            <>
              <ul className="space-y-2">
                {[...requests].filter((r) => r.status !== "not_applicable").sort((x, y) => rank(x.status) - rank(y.status)).slice(0, 7).map((r) => {
                  const done = r.status === "received" || r.status === "accepted";
                  return (
                    <li key={r.id} className="flex items-center gap-2.5">
                      {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-amber-500" />}
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">{r.applicant ? `${names[r.applicant - 1]}: ` : ""}{r.label}</span>
                      <Chip tone={r.status === "accepted" ? "good" : done ? "info" : r.status === "redo" ? "bad" : "warn"}>{r.status === "accepted" ? "Checked" : done ? "Received" : r.status === "redo" ? "Asked again" : "Required"}</Chip>
                    </li>
                  );
                })}
              </ul>
              <a href={links.documents} className="mt-3 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-emerald-700 hover:underline">All documents<ArrowRight className="h-3.5 w-3.5" /></a>
            </>
          )}
        </Card>

        {/* applicants */}
        <Card className="lg:col-span-12" title="Applicants">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[620px] text-[0.8125rem]">
              <thead><tr className="text-left text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint"><th className="px-1 pb-2">Applicant</th><th className="px-1 pb-2">Employment</th><th className="px-1 pb-2">Income (annual)</th><th className="px-1 pb-2">Verification</th><th className="px-1 pb-2">Signed</th><th className="px-1 pb-2" /></tr></thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-1 py-2.5"><span className="flex items-center gap-2 font-semibold text-ink"><User className="h-4 w-4 text-ink-faint" />{p.name}</span></td>
                    <td className="px-1 py-2.5 text-ink-muted">{p.employment}</td>
                    <td className="px-1 py-2.5 tabular-nums text-ink">{p.income ? aud(p.income) : "—"}</td>
                    <td className="px-1 py-2.5">{p.v === "verified" ? <Chip tone="good">✓ Verified</Chip> : p.v === "received" ? <Chip tone="info">Received — to check</Chip> : p.v === "pending" ? <Chip tone="warn">Pending{p.missing ? ` (${p.missing})` : ""}</Chip> : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-1 py-2.5">{p.signed ? <Chip tone="good">✓ Signed</Chip> : <Chip tone="warn">Not yet</Chip>}</td>
                    <td className="px-1 py-2.5 text-right"><a href={links.applicants} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-canvas">View profile<ArrowRight className="h-3.5 w-3.5" /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {purpose && <p className="mt-2 text-[0.75rem] text-ink-faint">Loan: {purpose}{m.loan.amount ? ` · ${aud(m.loan.amount)}` : ""}{m.loan.lvr != null ? ` · LVR ${m.loan.lvr}%` : ""}. Assets owned by {m.byOwner.filter((o) => o.assets > 0).map((o) => ownerLabel(o.owner, names)).join(", ") || "—"}.</p>}
        </Card>
      </div>
    </div>
  );
}

const rank = (s: string) => (s === "redo" ? 0 : s === "needed" ? 1 : s === "received" ? 2 : 3);

function Card({ title, right, children, className, id }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24 flex flex-col rounded-2xl border border-line bg-surface p-5", className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[1.0625rem] font-semibold text-ink">{title}</h3>{right && <span className="text-[0.75rem] text-ink-muted">{right}</span>}</div>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="grid flex-1 place-items-center rounded-xl border border-dashed border-line py-8 text-center text-[0.8125rem] text-ink-faint">{children}</p>;
}
function Chip({ tone, children }: { tone: "good" | "warn" | "bad" | "info"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold ring-1 ring-inset",
      tone === "good" && "bg-emerald-50 text-emerald-800 ring-emerald-200",
      tone === "warn" && "bg-amber-50 text-amber-800 ring-amber-200",
      tone === "bad" && "bg-rose-50 text-rose-800 ring-rose-200",
      tone === "info" && "bg-sky-50 text-sky-800 ring-sky-200")}>{children}</span>
  );
}

function Ring({ value }: { value: number }) {
  const R = 46, L = 2 * Math.PI * R;
  return (
    <div className="relative h-[116px] w-[116px] shrink-0" role="img" aria-label={`Readiness ${value} out of 100`}>
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
        <circle cx={56} cy={56} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={9} />
        <circle cx={56} cy={56} r={R} fill="none" stroke="#34d399" strokeWidth={9} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - value / 100)} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.2,0.8,0.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-[2rem] font-bold leading-none">{value}</p><p className="mt-1 text-[0.6875rem] leading-tight text-white/70">Readiness<br />score</p></div></div>
    </div>
  );
}

function Kpi({ icon, label, value, prev, now, up, data, fmt }: { icon: React.ReactNode; label: string; value: string; prev?: number; now?: number; up: "good" | "bad"; data: number[]; fmt?: (v: number) => string }) {
  const has = prev != null && now != null && prev !== 0 && prev !== now;
  const change = has ? ((now! - prev!) / Math.abs(prev!)) * 100 : 0;
  const rising = change > 0;
  const good = has && (rising ? up === "good" : up === "bad");
  const line = data.length >= 2 && data.some((d) => d !== data[0]);
  return (
    <div className="flex items-end gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink-muted"><span className="text-ink">{icon}</span>{label}</p>
        <p className="mt-1.5 text-[1.625rem] font-bold leading-none tabular-nums text-ink">{value}</p>
        <p className="mt-1.5 flex items-center gap-1 text-[0.75rem] text-ink-muted">
          {has ? <>{rising ? <ArrowUpRight className={cn("h-3.5 w-3.5", good ? "text-emerald-600" : "text-rose-600")} /> : <ArrowDownRight className={cn("h-3.5 w-3.5", good ? "text-emerald-600" : "text-rose-600")} />}<span className={good ? "text-emerald-700" : "text-rose-700"}>{rising ? "+" : ""}{change.toFixed(1)}%</span> vs. last review{fmt && prev != null ? ` (${fmt(prev)})` : ""}</> : "First review"}
        </p>
      </div>
      {line && <Spark data={data} good={!has || good} />}
    </div>
  );
}

function Spark({ data, good }: { data: number[]; good: boolean }) {
  const W = 84, H = 34, lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * (W - 4) + 2, H - 4 - ((d - lo) / span) * (H - 8)] as const);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const c = good ? "#10b981" : "#f43f5e";
  return (
    <svg width={W} height={H} className="shrink-0" aria-hidden>
      <path d={`${path} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H} Z`} fill={c} opacity={0.12} />
      <path d={path} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3} fill={c} />
    </svg>
  );
}
