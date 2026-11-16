"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { ownerLabel } from "@/lib/loans/form";
import { analyse, DEFAULT_ASSUMPTIONS, type Assumptions, type BusinessYear, type Metrics, type SavedAnalysis } from "@/lib/loans/analysis";

const aud = (n: number | null | undefined) => (n == null ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`);
const short = (n: number) => { const a = Math.abs(n); const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}m` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`; return `${n < 0 ? "-" : ""}$${s}`; };

// colours that read on light and dark (Tailwind fills)
const C = { a: "fill-indigo-500", b: "fill-sky-500", c: "fill-emerald-500", d: "fill-amber-500", e: "fill-fuchsia-500", f: "fill-teal-400", g: "fill-slate-400", bad: "fill-rose-500", good: "fill-emerald-500" };
const DOT: Record<string, string> = { [C.a]: "bg-indigo-500", [C.b]: "bg-sky-500", [C.c]: "bg-emerald-500", [C.d]: "bg-amber-500", [C.e]: "bg-fuchsia-500", [C.f]: "bg-teal-400", [C.g]: "bg-slate-400", [C.bad]: "bg-rose-500" };

type Run = (as: Partial<Assumptions>) => Promise<{ ok: true; data: SavedAnalysis } | { ok: false; error: string }>;

/**
 * Financial position: figures and graphs worked out live from the answers (and Xero), plus the AI's saved assessment.
 * Used on the business's loan file page and the broker page.
 */
export function FinancialPosition({ answers, applicants, names, business, saved: initial, run, compact }: {
  answers: Record<string, unknown>; applicants: number; names: string[]; business: BusinessYear[];
  saved: SavedAnalysis | null; run?: Run; compact?: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [rate, setRate] = useState(String(initial?.assumptions.assessmentRate ?? DEFAULT_ASSUMPTIONS.assessmentRate));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const as: Assumptions = { ...DEFAULT_ASSUMPTIONS, ...(saved?.assumptions ?? {}), assessmentRate: Math.min(20, Math.max(1, Number(rate) || DEFAULT_ASSUMPTIONS.assessmentRate)) };
  const m = useMemo(() => analyse(answers, applicants, names, business, as), [answers, applicants, names, business, as.assessmentRate]); // eslint-disable-line react-hooks/exhaustive-deps
  const enough = m.incomeGross > 0 || m.assets.total > 0;
  const ai = saved?.assessment;

  return (
    <section className="space-y-4">
      {/* assessment */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start gap-4">
          <ScoreRing score={ai?.score ?? null} rating={ai?.rating ?? null} />
          <div className="min-w-0 flex-1">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">Financial position</p>
            <h2 className="mt-0.5 text-[1.125rem] font-bold leading-snug text-ink">{ai?.headline || (enough ? "Not analysed yet" : "Waiting for income and asset details")}</h2>
            {ai?.summary && <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-muted">{ai.summary}</p>}
            <p className="mt-2 text-[0.6875rem] text-ink-faint">{saved ? `AI assessment ${new Date(saved.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · ${saved.by}. ` : ""}Credit report not included. Figures below update live from the answers.</p>
          </div>
          {run && (
            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
              <label className="text-[0.75rem] text-ink-muted">Assessment rate
                <span className="mt-1 flex items-center rounded-lg ring-1 ring-inset ring-line"><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} className="h-9 w-16 bg-transparent px-2 text-[0.875rem] text-ink focus:outline-none" /><span className="pr-2 text-ink-faint">%</span></span>
              </label>
              <button type="button" disabled={pending || !enough} onClick={() => start(async () => { setErr(null); const r = await run({ assessmentRate: as.assessmentRate }); if (r.ok) setSaved(r.data); else setErr(r.error); })}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[0.8125rem] font-semibold text-white disabled:opacity-50">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{pending ? "Analysing…" : saved ? "Re-analyse" : "Analyse with AI"}
              </button>
            </div>
          )}
        </div>
        {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[0.8125rem] text-rose-800 ring-1 ring-inset ring-rose-200">{err}</p>}
        {ai && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Points title="Strengths" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} items={ai.strengths} />
            <Points title="Risks" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} items={ai.risks} />
            <Points title="Mitigants" icon={<ShieldCheck className="h-4 w-4 text-sky-600" />} items={ai.mitigants} />
            <Points title="To confirm" icon={<HelpCircle className="h-4 w-4 text-indigo-500" />} items={ai.questions} />
          </div>
        )}
      </div>

      {/* key figures */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Tile label="Net worth" value={aud(m.netWorth)} tone={m.netWorth >= 0 ? "good" : "bad"} />
        <Tile label="Gross income / yr" value={aud(m.incomeGross)} sub={m.rentCounted ? `incl. ${short(m.rentCounted)} rent (80%)` : undefined} />
        <Tile label="Take-home / month" value={aud(m.incomeNetMonthly)} sub="est. after tax" />
        <Tile label="Monthly surplus" value={aud(m.monthly.surplus)} sub={`at ${as.assessmentRate}%`} tone={m.monthly.surplus >= 0 ? "good" : "bad"} />
        <Tile label="LVR" value={m.loan.lvr == null ? "—" : `${m.loan.lvr}%`} tone={m.loan.lvr == null ? undefined : m.loan.lvr <= 80 ? "good" : m.loan.lvr <= 90 ? "warn" : "bad"} />
        <Tile label="Debt to income" value={m.dti == null ? "—" : `${m.dti}×`} sub="after the new loan" tone={m.dti == null ? undefined : m.dti < 6 ? "good" : m.dti < 8 ? "warn" : "bad"} />
      </div>

      <div className={cn("grid gap-4", !compact && "lg:grid-cols-2")}>
        <Panel title="Assets vs debts" note={`Net worth ${aud(m.netWorth)}`}>
          <BalanceBars m={m} />
        </Panel>
        <Panel title="Monthly cash flow" note={`New loan at ${as.assessmentRate}% over ${as.termYears} years`}>
          <Waterfall m={m} />
        </Panel>
        <Panel title="Where the income comes from" note="Gross, yearly">
          <IncomeBars m={m} />
        </Panel>
        <Panel title="Rate stress test" note="Monthly surplus if rates move">
          <Stress m={m} />
        </Panel>
        {applicants > 1 && (
          <Panel title="Who owns what" note="Each person, and what's held jointly">
            <OwnerBars m={m} names={names} />
          </Panel>
        )}
        <Panel title="Ratios">
          <div className="grid grid-cols-2 gap-2">
            <Gauge label="LVR" value={m.loan.lvr} max={100} fmt={(v) => `${v}%`} bands={[80, 90]} />
            <Gauge label="Debt to income" value={m.dti} max={10} fmt={(v) => `${v}×`} bands={[6, 8]} />
          </div>
        </Panel>
        {m.business.length > 0 && (
          <Panel title="Business (from Xero)" note="Revenue and net profit by financial year">
            <BusinessBars years={m.business} />
          </Panel>
        )}
      </div>
      <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
        How this is worked out: tax at 2026-27 resident rates plus the 2% Medicare levy, per person, with no offsets or deductions (an estimate of take-home pay);
        rent counted at 80%; credit cards at 3% of the limit a month; the new loan as principal and interest over {as.termYears} years at {as.assessmentRate}%; living costs as the client entered them.
        Debt to income counts every debt including the new loan; 6× and over is what lenders treat as high. A credit report isn&apos;t part of this and can change the outcome.
      </p>
    </section>
  );
}

function Points({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div className="rounded-xl bg-canvas p-3 ring-1 ring-inset ring-line">
      <p className="mb-1.5 flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink">{icon}{title}</p>
      {items.length ? <ul className="space-y-1 text-[0.8125rem] text-ink-muted">{items.map((x, i) => <li key={i} className="leading-snug">• {x}</li>)}</ul> : <p className="text-[0.8125rem] text-ink-faint">—</p>}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[0.75rem] text-ink-faint">{label}</p>
      <p className={cn("mt-1 text-[1.25rem] font-bold tabular-nums", tone === "good" ? "text-emerald-700 dark:text-emerald-400" : tone === "warn" ? "text-amber-700 dark:text-amber-400" : tone === "bad" ? "text-rose-700 dark:text-rose-400" : "text-ink")}>{value}</p>
      {sub && <p className="text-[0.6875rem] text-ink-faint">{sub}</p>}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[0.9375rem] font-semibold text-ink">{title}</h3>{note && <span className="text-[0.75rem] text-ink-faint">{note}</span>}</div>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { label: string; cls: string; value: number }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted">
      {items.filter((x) => x.value > 0).map((x) => <li key={x.label} className="flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-sm", DOT[x.cls])} />{x.label} <b className="tabular-nums text-ink">{short(x.value)}</b></li>)}
    </ul>
  );
}

function StackBar({ parts, max, label }: { parts: { label: string; cls: string; value: number }[]; max: number; label: string }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  let x = 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[0.75rem]"><span className="font-medium text-ink">{label}</span><span className="tabular-nums text-ink-muted">{aud(total)}</span></div>
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-5 w-full overflow-hidden rounded-md bg-canvas" role="img" aria-label={`${label} ${aud(total)}`}>
        {parts.filter((p) => p.value > 0).map((p) => { const w = max ? (p.value / max) * 100 : 0; const r = <rect key={p.label} x={x} y={0} width={w} height={8} className={p.cls}><title>{`${p.label}: ${aud(p.value)}`}</title></rect>; x += w; return r; })}
      </svg>
    </div>
  );
}

function BalanceBars({ m }: { m: Metrics }) {
  const assets = [
    { label: "Property", cls: C.a, value: m.assets.property }, { label: "Super", cls: C.b, value: m.assets.super }, { label: "Savings", cls: C.c, value: m.assets.savings },
    { label: "Vehicles", cls: C.d, value: m.assets.vehicles }, { label: "Other", cls: C.e, value: m.assets.other }, { label: "Contents", cls: C.f, value: m.assets.contents },
  ];
  const debts = [
    { label: "Home loans", cls: C.bad, value: m.debts.mortgages }, { label: "Cards", cls: C.d, value: m.debts.cards }, { label: "Other loans", cls: C.e, value: m.debts.loans },
    ...(m.loan.amount ? [{ label: "New loan", cls: C.g, value: m.loan.amount }] : []),
  ];
  const max = Math.max(m.assets.total, debts.reduce((t, d) => t + d.value, 0), 1);
  if (m.assets.total === 0 && m.debts.total === 0) return <Empty />;
  return (
    <div className="space-y-3">
      <StackBar label="Assets" parts={assets} max={max} />
      <StackBar label={m.loan.amount ? "Debts (with the new loan)" : "Debts"} parts={debts} max={max} />
      <Legend items={[...assets, ...debts]} />
    </div>
  );
}

function IncomeBars({ m }: { m: Metrics }) {
  if (!m.incomeGross) return <Empty />;
  const parts = m.applicants.flatMap((p, i) => [
    { label: `${p.name} salary`, cls: [C.a, C.b, C.c, C.e][i % 4], value: p.salary },
    { label: `${p.name} director's wages`, cls: [C.f, C.d, C.e, C.a][i % 4], value: p.directors },
    { label: `${p.name} other`, cls: C.g, value: p.other },
  ]).concat(m.rentCounted ? [{ label: "Rent (80%)", cls: C.d, value: m.rentCounted }] : []);
  return (
    <div>
      <StackBar label="Total" parts={parts} max={m.incomeGross} />
      <div className="mt-3 space-y-2">
        {m.applicants.map((p) => (
          <div key={p.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-[0.8125rem]">
            <span className="truncate text-ink">{p.name}</span><span className="tabular-nums text-ink-muted">{aud(p.gross)} gross · {aud(p.net)} after est. tax</span>
          </div>
        ))}
      </div>
      <Legend items={parts} />
    </div>
  );
}

function Waterfall({ m }: { m: Metrics }) {
  const steps = [
    { label: "Take-home", value: m.monthly.netIncome, cls: C.c },
    { label: "Living", value: -m.monthly.living, cls: C.d },
    { label: "Existing loans", value: -m.monthly.existingRepayments, cls: C.e },
    { label: "Cards (3%)", value: -m.monthly.cardCommitment, cls: C.b },
    { label: "New loan", value: -m.monthly.newLoan, cls: C.a },
    { label: "Surplus", value: m.monthly.surplus, cls: m.monthly.surplus >= 0 ? C.good : C.bad, total: true },
  ];
  if (!m.monthly.netIncome) return <Empty />;
  const top = Math.max(m.monthly.netIncome, 1), bottom = Math.min(0, m.monthly.surplus);
  const H = 150, W = 300, span = top - bottom, y = (v: number) => ((top - v) / span) * H, bw = W / steps.length;
  let run = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} className="w-full" role="img" aria-label="Monthly cash flow">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-line" strokeWidth={1} />
      {steps.map((s, i) => {
        const from = s.total ? 0 : run, to = s.total ? s.value : run + s.value;
        if (!s.total) run = to;
        const y1 = y(Math.max(from, to)), h = Math.max(1, Math.abs(y(from) - y(to)));
        return (
          <g key={s.label}>
            <rect x={i * bw + 6} y={y1} width={bw - 12} height={h} rx={3} className={s.cls}><title>{`${s.label}: ${aud(s.value)}`}</title></rect>
            <text x={i * bw + bw / 2} y={y1 - 4} textAnchor="middle" className="fill-current text-ink text-[9px] font-semibold">{short(s.value)}</text>
            <text x={i * bw + bw / 2} y={H + 14} textAnchor="middle" className="fill-current text-ink-faint text-[8.5px]">{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Stress({ m }: { m: Metrics }) {
  if (!m.monthly.netIncome || !m.loan.amount) return <Empty text="Needs income and a loan amount." />;
  const vals = m.stress.map((s) => s.surplus), hi = Math.max(0, ...vals), lo = Math.min(0, ...vals), span = Math.max(1, hi - lo);
  const H = 140, W = 300, bw = W / m.stress.length, y = (v: number) => ((hi - v) / span) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full" role="img" aria-label="Rate stress test">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-line" strokeWidth={1} />
      {m.stress.map((s, i) => {
        const top = y(Math.max(0, s.surplus)), h = Math.max(1, Math.abs(y(s.surplus) - y(0)));
        const now = s.rate === m.assumptions.assessmentRate;
        return (
          <g key={s.rate}>
            <rect x={i * bw + 8} y={top} width={bw - 16} height={h} rx={3} className={cn(s.surplus >= 0 ? C.good : C.bad, !now && "opacity-60")}><title>{`${s.rate}%: ${aud(s.surplus)} a month`}</title></rect>
            <text x={i * bw + bw / 2} y={s.surplus >= 0 ? top - 4 : top + h + 11} textAnchor="middle" className="fill-current text-ink text-[9px] font-semibold">{short(s.surplus)}</text>
            <text x={i * bw + bw / 2} y={H + 18} textAnchor="middle" className={cn("fill-current text-[9px]", now ? "text-ink font-bold" : "text-ink-faint")}>{s.rate}%</text>
          </g>
        );
      })}
    </svg>
  );
}

function Gauge({ label, value, max, fmt, bands }: { label: string; value: number | null; max: number; fmt: (v: number) => string; bands: [number, number] }) {
  const R = 46, cx = 60, cy = 56, arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - Math.min(1, from / max)), a1 = Math.PI * (1 - Math.min(1, to / max));
    return `M ${cx + R * Math.cos(a0)} ${cy - R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${cx + R * Math.cos(a1)} ${cy - R * Math.sin(a1)}`;
  };
  const v = value == null ? null : Math.min(max, Math.max(0, value)), ang = v == null ? 0 : Math.PI * (1 - v / max);
  return (
    <div className="text-center">
      <svg viewBox="0 0 120 70" className="mx-auto w-full max-w-[180px]" role="img" aria-label={`${label} ${value == null ? "not known" : fmt(value)}`}>
        <path d={arc(0, bands[0])} className="fill-none stroke-emerald-500" strokeWidth={9} />
        <path d={arc(bands[0], bands[1])} className="fill-none stroke-amber-500" strokeWidth={9} />
        <path d={arc(bands[1], max)} className="fill-none stroke-rose-500" strokeWidth={9} />
        {v != null && <line x1={cx} y1={cy} x2={cx + (R - 4) * Math.cos(ang)} y2={cy - (R - 4) * Math.sin(ang)} className="stroke-current text-ink" strokeWidth={2.5} strokeLinecap="round" />}
        <circle cx={cx} cy={cy} r={3.5} className="fill-current text-ink" />
      </svg>
      <p className="-mt-1 text-[1.0625rem] font-bold tabular-nums text-ink">{value == null ? "—" : fmt(value)}</p>
      <p className="text-[0.75rem] text-ink-faint">{label}</p>
    </div>
  );
}

function BusinessBars({ years }: { years: BusinessYear[] }) {
  const vals = years.flatMap((y) => [y.revenue ?? 0, y.netProfit ?? 0]);
  const hi = Math.max(1, ...vals), lo = Math.min(0, ...vals), span = hi - lo;
  const H = 140, W = 300, gw = W / years.length, y = (v: number) => ((hi - v) / span) * H;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 40}`} className="w-full" role="img" aria-label="Business revenue and profit">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-line" strokeWidth={1} />
        {years.map((yr, i) => (
          <g key={`${yr.org}-${yr.fy}`}>
            {[[yr.revenue, C.a], [yr.netProfit, (yr.netProfit ?? 0) >= 0 ? C.c : C.bad]].map(([v, cls], k) => {
              const val = (v as number | null) ?? 0, top = y(Math.max(0, val)), h = Math.max(1, Math.abs(y(val) - y(0))), bw = gw / 2 - 8;
              return (
                <g key={k}>
                  <rect x={i * gw + 5 + k * (bw + 4)} y={top} width={bw} height={h} rx={3} className={cls as string}><title>{`${k ? "Net profit" : "Revenue"} ${yr.fy}: ${aud(val)}`}</title></rect>
                  <text x={i * gw + 5 + k * (bw + 4) + bw / 2} y={val >= 0 ? top - 4 : top + h + 10} textAnchor="middle" className="fill-current text-ink text-[8.5px] font-semibold">{v == null ? "—" : short(val)}</text>
                </g>
              );
            })}
            <text x={i * gw + gw / 2} y={H + 16} textAnchor="middle" className="fill-current text-ink-faint text-[8.5px]">{yr.fy}</text>
            {years.some((o) => o.org !== yr.org) && <text x={i * gw + gw / 2} y={H + 28} textAnchor="middle" className="fill-current text-ink-faint text-[7.5px]">{yr.org.slice(0, 22)}</text>}
          </g>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />Revenue</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Net profit</li>
        {years.map((yr) => yr.equity != null && <li key={`e-${yr.org}-${yr.fy}`}>{yr.fy} net assets <b className="text-ink">{short(yr.equity)}</b></li>)}
      </ul>
    </div>
  );
}

function ScoreRing({ score, rating }: { score: number | null; rating: string | null }) {
  const R = 30, L = 2 * Math.PI * R, pct = score == null ? 0 : score / 100;
  const tone = rating === "Strong" ? "stroke-emerald-500" : rating === "Sound" ? "stroke-sky-500" : rating === "Stretched" ? "stroke-amber-500" : rating === "Weak" ? "stroke-rose-500" : "stroke-line";
  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90"><circle cx={40} cy={40} r={R} className="fill-none stroke-line" strokeWidth={8} /><circle cx={40} cy={40} r={R} className={cn("fill-none", tone)} strokeWidth={8} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - pct)} /></svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-[1.25rem] font-bold leading-none text-ink">{score ?? "—"}</p><p className="mt-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-ink-muted">{rating ?? "not run"}</p></div></div>
    </div>
  );
}

function Empty({ text = "Fills in as the client answers." }: { text?: string }) {
  return <p className="py-6 text-center text-[0.8125rem] text-ink-faint">{text}</p>;
}

function OwnerBars({ m, names }: { m: Metrics; names: string[] }) {
  const list = m.byOwner.filter((o) => o.assets || o.debts);
  if (!list.length) return <Empty text="Shows once assets and debts have an owner." />;
  const max = Math.max(1, ...list.flatMap((o) => [o.assets, o.debts]));
  return (
    <div className="space-y-3">
      {list.map((o) => (
        <div key={o.owner}>
          <div className="mb-1 flex flex-wrap justify-between gap-2 text-[0.8125rem]"><span className="font-medium text-ink">{o.owner === "Not assigned" ? "Not assigned to anyone" : ownerLabel(o.owner, names)}</span><span className={cn("tabular-nums", o.net >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>net {aud(o.net)}</span></div>
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-6 w-full overflow-hidden rounded-md bg-canvas" role="img" aria-label={`${o.owner}: assets ${aud(o.assets)}, debts ${aud(o.debts)}`}>
            <rect x={0} y={0} width={(o.assets / max) * 100} height={4.5} className={C.c}><title>{`Assets ${aud(o.assets)}`}</title></rect>
            <rect x={0} y={5.5} width={(o.debts / max) * 100} height={4.5} className={C.bad}><title>{`Debts ${aud(o.debts)}`}</title></rect>
          </svg>
          <p className="mt-0.5 text-[0.6875rem] text-ink-faint">Assets {aud(o.assets)} · debts {aud(o.debts)}</p>
        </div>
      ))}
    </div>
  );
}
