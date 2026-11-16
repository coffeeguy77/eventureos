"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { ownerLabel } from "@/lib/loans/form";
import { analyse, DEFAULT_ASSUMPTIONS, type Assumptions, type BusinessYear, type Metrics, type SavedAnalysis } from "@/lib/loans/analysis";

/* ---------------------------------------------------------------------------------------------------------------
 * Colours: the validated categorical palette (light + dark steps) and the reserved status colours, as CSS variables
 * on the root, so every mark reads correctly in light and dark mode. Status never carries meaning alone (icon + text).
 * ------------------------------------------------------------------------------------------------------------- */
const VARS = "[--s1:#2a78d6] [--s2:#eb6834] [--s3:#1baf7a] [--s4:#eda100] [--s5:#e87ba4] [--s6:#6250d6] [--good:#0ca30c] [--warn:#fab219] [--bad:#d03b3b] " +
  "dark:[--s1:#3987e5] dark:[--s2:#d95926] dark:[--s3:#199e70] dark:[--s4:#c98500] dark:[--s5:#d55181] dark:[--s6:#9085e9]";
const S = (n: number) => `var(--s${((n - 1) % 6) + 1})`;
const GOOD = "var(--good)", WARN = "var(--warn)", BAD = "var(--bad)";

const aud = (n: number | null | undefined) => (n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`);
const short = (n: number) => { const a = Math.abs(n); const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}m` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`; return `${n < 0 ? "−" : ""}$${s}`; };

/* ---------------------------------------------------------------- tooltips (mouse, keyboard and touch) */
type Tip = { x: number; y: number; title: string; rows: { label: string; value: string; color?: string }[]; note?: string };
const TipCtx = createContext<(t: Tip | null) => void>(() => {});

/** Handlers that make any mark show its tooltip on hover, focus or tap. */
function useTipFor() {
  const set = useContext(TipCtx);
  return useCallback((info: Omit<Tip, "x" | "y">) => ({
    tabIndex: 0,
    "data-tip": "1",
    onPointerEnter: (e: React.PointerEvent) => set({ ...info, x: e.clientX, y: e.clientY }),
    onPointerMove: (e: React.PointerEvent) => { if (e.pointerType === "mouse") set({ ...info, x: e.clientX, y: e.clientY }); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === "mouse") set(null); },
    onClick: (e: React.MouseEvent) => set({ ...info, x: e.clientX, y: e.clientY }),
    onFocus: (e: React.FocusEvent) => { const b = (e.target as Element).getBoundingClientRect(); set({ ...info, x: b.left + b.width / 2, y: b.top }); },
    onBlur: () => set(null),
  }), [set]);
}

function TipLayer({ tip }: { tip: Tip | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!tip || !ref.current) return;
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight, pad = 10;
    let left = tip.x - w / 2, top = tip.y - h - 14;
    left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
    if (top < pad) top = tip.y + 18;
    setPos({ left, top });
  }, [tip]);
  if (!tip) return null;
  return (
    <div ref={ref} role="tooltip" className="pointer-events-none fixed z-[60] min-w-[160px] max-w-[280px] rounded-xl border border-line bg-surface px-3 py-2.5 shadow-xl" style={pos}>
      <p className="text-[0.75rem] font-medium text-ink-muted">{tip.title}</p>
      <ul className="mt-1 space-y-0.5">
        {tip.rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-[0.8125rem]">
            {r.color && <span className="h-[3px] w-3 shrink-0 rounded-full" style={{ background: r.color }} />}
            <span className="font-semibold tabular-nums text-ink">{r.value}</span>
            <span className="truncate text-ink-muted">{r.label}</span>
          </li>
        ))}
      </ul>
      {tip.note && <p className="mt-1.5 border-t border-line pt-1.5 text-[0.6875rem] leading-snug text-ink-faint">{tip.note}</p>}
    </div>
  );
}

/** Width of a box, for drawing charts at real pixels (text stays readable on phones). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width))); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}
/** Bars grow in once on first view (skipped for reduced motion). */
function useGrow() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setOn(true); return; }
    const t = requestAnimationFrame(() => setTimeout(() => setOn(true), 60)); return () => cancelAnimationFrame(t);
  }, []);
  return on;
}
const grow = (on: boolean, axis: "x" | "y", origin = "left bottom"): React.CSSProperties => ({
  transform: on ? "scale(1,1)" : axis === "y" ? "scale(1,0)" : "scale(0,1)", transformOrigin: origin, transformBox: "fill-box",
  transition: "transform 0.8s cubic-bezier(0.2,0.8,0.2,1)",
});

type Run = (as: Partial<Assumptions>) => Promise<{ ok: true; data: SavedAnalysis } | { ok: false; error: string }>;

/**
 * Financial position: figures and graphs worked out live from the answers (and Xero), plus the AI's saved assessment.
 * Used on the business's loan file page and the broker page.
 */
export function FinancialPosition({ answers, applicants, names, business, saved: initial, run }: {
  answers: Record<string, unknown>; applicants: number; names: string[]; business: BusinessYear[];
  saved: SavedAnalysis | null; run?: Run; compact?: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [rate, setRate] = useState(String(initial?.assumptions.assessmentRate ?? DEFAULT_ASSUMPTIONS.assessmentRate));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tip, setTip] = useState<Tip | null>(null);
  const rateNum = Math.min(20, Math.max(1, Number(rate) || DEFAULT_ASSUMPTIONS.assessmentRate));
  const as: Assumptions = { ...DEFAULT_ASSUMPTIONS, ...(saved?.assumptions ?? {}), assessmentRate: rateNum };
  const m = useMemo(() => analyse(answers, applicants, names, business, as), [answers, applicants, names, business, rateNum]); // eslint-disable-line react-hooks/exhaustive-deps
  const enough = m.incomeGross > 0 || m.assets.total > 0;
  const ai = saved?.assessment;

  // touch: tapping anywhere that isn't a chart mark closes the tooltip; scrolling closes it too
  useEffect(() => {
    if (!tip) return;
    const off = (e: Event) => { if (!(e.target as Element | null)?.closest?.("[data-tip]")) setTip(null); };
    const scroll = () => setTip(null);
    document.addEventListener("pointerdown", off); window.addEventListener("scroll", scroll, { passive: true });
    return () => { document.removeEventListener("pointerdown", off); window.removeEventListener("scroll", scroll); };
  }, [tip]);

  return (
    <TipCtx.Provider value={setTip}>
      <section className={cn("space-y-4 [&_[data-tip]]:cursor-pointer [&_[data-tip]]:outline-none [&_[data-tip]:focus-visible]:opacity-75", VARS)}>
        {/* the assessment */}
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
            <ScoreRing score={ai?.score ?? null} rating={ai?.rating ?? null} />
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Financial position</p>
              <h2 className="mt-1 text-[1.25rem] font-bold leading-snug text-ink sm:text-[1.375rem]">{ai?.headline || (enough ? "Ready to analyse" : "Waiting for income and asset details")}</h2>
              {ai?.summary ? <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">{ai.summary}</p>
                : <p className="mt-2 text-[0.875rem] text-ink-muted">The figures and graphs below fill in live as the client answers. {run ? "Press Analyse for the AI's assessment." : ""}</p>}
              <p className="mt-2 text-[0.6875rem] text-ink-faint">{saved ? `Assessed ${new Date(saved.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} by ${saved.by} · ` : ""}Credit report not included.</p>
            </div>
            {run && (
              <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                <label className="text-[0.75rem] text-ink-muted">Assessment rate
                  <span className="mt-1 flex h-10 items-center rounded-lg bg-canvas ring-1 ring-inset ring-line"><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Assessment rate, percent" className="h-full w-14 bg-transparent px-2 text-right text-[0.9375rem] font-semibold tabular-nums text-ink focus:outline-none" /><span className="pr-2.5 text-ink-faint">%</span></span>
                </label>
                <button type="button" disabled={pending || !enough} onClick={() => start(async () => { setErr(null); const r = await run({ assessmentRate: rateNum }); if (r.ok) setSaved(r.data); else setErr(r.error); })}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-[0.875rem] font-semibold text-white shadow-sm disabled:opacity-50">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{pending ? "Analysing…" : saved ? "Re-analyse" : "Analyse with AI"}
                </button>
              </div>
            )}
          </div>
          {err && <p className="mx-5 mb-4 rounded-lg bg-rose-50 px-3 py-2 text-[0.8125rem] text-rose-800 ring-1 ring-inset ring-rose-200 sm:mx-6">{err}</p>}
          {ai && ![ai.strengths, ai.risks, ai.mitigants, ai.questions].some((l) => l.length) && (
            <p className="border-t border-line px-5 py-4 text-[0.8125rem] text-ink-muted sm:px-6">The last run came back without strengths, risks or questions. Press Re-analyse to fill them in.</p>
          )}
          {ai && [ai.strengths, ai.risks, ai.mitigants, ai.questions].some((l) => l.length) && (
            <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
              <Points title="Strengths" icon={<CheckCircle2 className="h-4 w-4" style={{ color: GOOD }} />} items={ai.strengths} />
              <Points title="Risks" icon={<AlertTriangle className="h-4 w-4" style={{ color: WARN }} />} items={ai.risks} />
              <Points title="Mitigants" icon={<ShieldCheck className="h-4 w-4" style={{ color: S(1) }} />} items={ai.mitigants} />
              <Points title="To confirm" icon={<HelpCircle className="h-4 w-4" style={{ color: S(6) }} />} items={ai.questions} />
            </div>
          )}
        </div>

        {/* headline numbers */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Net worth" value={aud(m.netWorth)} status={m.netWorth >= 0 ? ["good", "Positive"] : ["bad", "Negative"]} />
          <Tile label="Gross income" value={aud(m.incomeGross)} sub="a year" />
          <Tile label="Take-home" value={aud(m.incomeNetMonthly)} sub="a month, est." />
          <Tile label="Monthly surplus" value={aud(m.monthly.surplus)} sub={`at ${as.assessmentRate}%`} status={!m.monthly.netIncome ? null : m.monthly.surplus >= 0 ? ["good", "Services"] : ["bad", "Shortfall"]} />
          <Tile label="LVR" value={m.loan.lvr == null ? "—" : `${m.loan.lvr}%`} status={m.loan.lvr == null ? null : m.loan.lvr <= 80 ? ["good", "80% or under"] : m.loan.lvr <= 90 ? ["warn", "LMI likely"] : ["bad", "Over 90%"]} />
          <Tile label="Debt to income" value={m.dti == null ? "—" : `${m.dti}×`} sub="with the new loan" status={m.dti == null ? null : m.dti < 6 ? ["good", "Under 6×"] : m.dti < 8 ? ["warn", "High (6×+)"] : ["bad", "Very high"]} />
        </div>

        {/* graphs */}
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-7" title="Monthly cash flow" note={`New loan ${aud(m.loan.amount)} at ${as.assessmentRate}% over ${as.termYears} years`}><Waterfall m={m} /></Panel>
          <Panel className="lg:col-span-5" title="Key ratios"><Ratios m={m} /></Panel>
          <Panel className="lg:col-span-6" title="Assets vs debts" note={`Net worth ${aud(m.netWorth)}`}><Balance m={m} /></Panel>
          <Panel className="lg:col-span-6" title="Rate stress test" note="Monthly surplus as rates move"><Stress m={m} /></Panel>
          <Panel className={applicants > 1 ? "lg:col-span-6" : "lg:col-span-12"} title="Where the income comes from" note="Gross, a year"><Income m={m} /></Panel>
          {applicants > 1 && <Panel className="lg:col-span-6" title="Who owns what" note="Each person and jointly"><Owners m={m} names={names} /></Panel>}
          {m.business.length > 0 && <Panel className="lg:col-span-12" title="Business (from Xero)" note="Revenue and net profit by financial year"><Business years={m.business} /></Panel>}
        </div>

        <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
          Tap or hover any bar for the detail. How it&apos;s worked out: tax at 2026-27 resident rates plus the 2% Medicare levy, per person, no offsets (an estimate of take-home pay);
          rent counted at 80%; credit cards at 3% of the limit a month; the new loan as principal and interest over {as.termYears} years at {as.assessmentRate}%; living costs as the client entered them.
          Debt to income counts every debt including the new loan — 6× and over is what lenders treat as high. A credit report isn&apos;t part of this and can change the outcome.
        </p>
      </section>
      <TipLayer tip={tip} />
    </TipCtx.Provider>
  );
}

/* ---------------------------------------------------------------- building blocks */

function Points({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div className="bg-surface p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink">{icon}{title}</p>
      {items.length ? <ul className="space-y-1.5 text-[0.8125rem] leading-snug text-ink-muted">{items.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />{x}</li>)}</ul> : <p className="text-[0.8125rem] text-ink-faint">—</p>}
    </div>
  );
}

function Tile({ label, value, sub, status }: { label: string; value: string; sub?: string; status?: ["good" | "warn" | "bad", string] | null }) {
  const c = status ? { good: GOOD, warn: WARN, bad: BAD }[status[0]] : null;
  const Icon = status?.[0] === "good" ? TrendingUp : status ? TrendingDown : null;
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-3.5 sm:p-4">
      {c && <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: c }} />}
      <p className="text-[0.75rem] font-medium text-ink-muted">{label}</p>
      <p className="mt-1 break-words text-[1.1875rem] font-bold leading-tight tabular-nums text-ink sm:text-[1.375rem]">{value}</p>
      {status && Icon ? <p className="mt-1 flex items-center gap-1 text-[0.6875rem] font-medium text-ink-muted"><Icon className="h-3.5 w-3.5" style={{ color: c! }} />{status[1]}{sub ? ` · ${sub}` : ""}</p>
        : sub ? <p className="mt-1 text-[0.6875rem] text-ink-faint">{sub}</p> : null}
    </div>
  );
}

function Panel({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col rounded-2xl lg:min-h-[320px] border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><h3 className="text-[0.9375rem] font-semibold text-ink">{title}</h3>{note && <span className="text-[0.75rem] text-ink-faint">{note}</span>}</div>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

function Legend({ items, line }: { items: { label: string; color: string; value?: number }[]; line?: boolean }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.75rem] text-ink-muted">
      {items.map((x) => (
        <li key={x.label} className="flex items-center gap-1.5">
          <span className={line ? "h-[3px] w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"} style={{ background: x.color }} />{x.label}{x.value != null && <b className="font-semibold tabular-nums text-ink">{short(x.value)}</b>}
        </li>
      ))}
    </ul>
  );
}

function Empty({ text = "Fills in as the client answers." }: { text?: string }) {
  return <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-line py-10 text-center text-[0.8125rem] text-ink-faint">{text}</div>;
}

/** Nice round gridline steps for a value range. */
function ticks(lo: number, hi: number, n = 4) {
  const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw) ?? raw;
  const out: number[] = []; for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v));
  return out;
}

/* ---------------------------------------------------------------- monthly cash flow (waterfall) */

function Waterfall({ m }: { m: Metrics }) {
  const tipFor = useTipFor(); const on = useGrow();
  const [ref, w] = useWidth<HTMLDivElement>();
  if (!m.monthly.netIncome) return <Empty text="Shows once income is entered." />;
  const steps = [
    { label: "Take-home", tiny: "Pay", value: m.monthly.netIncome, color: S(1), note: "Estimated monthly pay after tax and Medicare, plus 80% of rent." },
    { label: "Living", tiny: "Living", value: -m.monthly.living, color: S(4), note: "Living costs as the client entered them." },
    { label: "Existing loans", tiny: "Loans", value: -m.monthly.existingRepayments, color: S(5), note: "Home loan and other loan repayments they already pay." },
    { label: "Card limits", tiny: "Cards", value: -m.monthly.cardCommitment, color: S(2), note: "3% of total credit card limits a month, as lenders assess it." },
    { label: "New loan", tiny: "New", value: -m.monthly.newLoan, color: S(6), note: `Principal and interest at ${m.assumptions.assessmentRate}% over ${m.assumptions.termYears} years.` },
    { label: "Surplus", tiny: "Left", value: m.monthly.surplus, color: m.monthly.surplus >= 0 ? GOOD : BAD, total: true, note: m.monthly.surplus >= 0 ? "Left over each month after everything." : "Short each month — the loan doesn't service on these figures." },
  ];
  const H = 230, top = 22, bottom = 30, left = 46, plotH = H - top - bottom, plotW = Math.max(0, w - left - 4);
  const hi = Math.max(m.monthly.netIncome, 1), lo = Math.min(0, m.monthly.surplus);
  const gl = ticks(lo, hi), yMax = Math.max(hi, gl[gl.length - 1]), yMin = Math.min(lo, gl[0]);
  const y = (v: number) => top + ((yMax - v) / (yMax - yMin || 1)) * plotH;
  const bw = plotW / steps.length, barW = Math.min(64, bw * 0.62);
  let run = 0;
  const bars = steps.map((s) => { const from = s.total ? 0 : run, to = s.total ? s.value : run + s.value; if (!s.total) run = to; return { ...s, from, to }; });
  if (w > 0 && w < 420) {
    // phones: one row per step, the bar floating where it sits in the running total
    const span = (yMax - yMin) || 1, pos = (v: number) => ((v - yMin) / span) * 100;
    return (
      <div ref={ref} className="w-full space-y-2.5" role="img" aria-label={`Monthly cash flow: take-home ${aud(m.monthly.netIncome)}, surplus ${aud(m.monthly.surplus)}`}>
        {bars.map((b) => {
          const a = pos(Math.min(b.from, b.to)), z = pos(Math.max(b.from, b.to));
          return (
            <div key={b.label} className={cn("text-[0.8125rem]", b.total && "border-t border-line pt-2.5 font-semibold")}
              {...tipFor({ title: b.label, rows: [{ label: "a month", value: aud(b.value), color: b.color }, ...(b.total ? [] : [{ label: "running total", value: aud(b.to) }])], note: b.note })}>
              <span className="mb-1 flex items-baseline justify-between gap-2"><span className="truncate text-ink-muted">{b.label}</span><span className="tabular-nums text-ink">{aud(b.value)}</span></span>
              <span className="relative block h-3 rounded-full bg-canvas">
                <span className="absolute inset-y-0 rounded-full" style={{ left: `${a}%`, width: `${Math.max(1.5, z - a)}%`, background: b.color, ...grow(on, "x", b.value >= 0 ? "left center" : "right center") }} />
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div ref={ref} className="w-full">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`Monthly cash flow: take-home ${aud(m.monthly.netIncome)}, surplus ${aud(m.monthly.surplus)}`}>
          {gl.map((g) => <g key={g}><line x1={left} x2={w} y1={y(g)} y2={y(g)} className={g === 0 ? "stroke-ink-faint" : "stroke-line"} strokeWidth={1} strokeDasharray={g === 0 ? undefined : "2 4"} /><text x={left - 8} y={y(g) + 4} textAnchor="end" className="fill-current text-ink-faint" fontSize={11}>{short(g)}</text></g>)}
          {bars.map((b, i) => {
            const x = left + i * bw + (bw - barW) / 2, y1 = y(Math.max(b.from, b.to)), h = Math.max(2, Math.abs(y(b.from) - y(b.to)));
            const next = bars[i + 1];
            return (
              <g key={b.label}>
                {next && !next.total && <line x1={x + barW} x2={x + bw} y1={y(b.to)} y2={y(b.to)} className="stroke-ink-faint" strokeDasharray="3 3" strokeWidth={1} />}
                <rect x={x - 6} y={top} width={barW + 12} height={plotH} fill="transparent" {...tipFor({ title: b.label, rows: [{ label: "a month", value: aud(b.value), color: b.color }, ...(b.total ? [] : [{ label: "running total", value: aud(b.to) }])], note: b.note })} />
                <rect x={x} y={y1} width={barW} height={h} rx={4} fill={b.color} pointerEvents="none" style={grow(on, "y", b.value >= 0 ? "center bottom" : "center top")} />
                <text x={x + barW / 2} y={y1 - 7} textAnchor="middle" className="fill-current text-ink" fontSize={bw < 60 ? 10 : 12} fontWeight={650} pointerEvents="none">{short(b.value)}</text>
                <text x={left + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="fill-current text-ink-muted" fontSize={11} pointerEvents="none">{bw < 78 ? b.tiny : b.label}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- ratios (gauges) */

function Ratios({ m }: { m: Metrics }) {
  return (
    <div className="grid flex-1 grid-cols-2 content-center gap-4 sm:gap-6">
      <Gauge label="LVR" value={m.loan.lvr} max={100} fmt={(v) => `${v}%`} bands={[80, 90]} words={["Under 80%", "80–90% (LMI)", "Over 90%"]} note="Loan ÷ property value. Over 80% usually means lenders mortgage insurance." />
      <Gauge label="Debt to income" value={m.dti} max={10} fmt={(v) => `${v}×`} bands={[6, 8]} words={["Under 6×", "6–8× (high)", "8×+"]} note="Every debt including the new loan ÷ gross yearly income." />
    </div>
  );
}

function Gauge({ label, value, max, fmt, bands, words, note }: { label: string; value: number | null; max: number; fmt: (v: number) => string; bands: [number, number]; words: [string, string, string]; note: string }) {
  const tipFor = useTipFor(); const on = useGrow();
  const R = 78, cx = 100, cy = 92, sw = 16;
  const pt = (v: number, r = R) => { const a = Math.PI * (1 - Math.min(1, Math.max(0, v) / max)); return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const; };
  const arc = (a: number, b: number) => { const [x0, y0] = pt(a), [x1, y1] = pt(b); return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`; };
  const v = value == null ? null : Math.min(max, Math.max(0, value));
  const deg = v == null ? -90 : -90 + (v / max) * 180;
  const status = value == null ? null : value <= bands[0] ? 0 : value <= bands[1] ? 1 : 2;
  return (
    <div className="text-center" {...tipFor({ title: label, rows: [{ label: value == null ? "not enough answers yet" : words[status!], value: value == null ? "—" : fmt(value), color: status == null ? undefined : [GOOD, WARN, BAD][status] }], note })}>
      <svg viewBox="-8 -18 216 132" className="mx-auto w-full max-w-[260px]" role="img" aria-label={`${label} ${value == null ? "not known" : fmt(value)}`}>
        <path d={arc(0, max)} className="stroke-line" fill="none" strokeWidth={sw} strokeLinecap="round" />
        <path d={arc(0, bands[0])} fill="none" stroke={GOOD} strokeWidth={sw} opacity={status === 0 ? 1 : 0.35} />
        <path d={arc(bands[0], bands[1])} fill="none" stroke={WARN} strokeWidth={sw} opacity={status === 1 ? 1 : 0.35} />
        <path d={arc(bands[1], max)} fill="none" stroke={BAD} strokeWidth={sw} opacity={status === 2 ? 1 : 0.35} />
        {bands.map((b) => { const [x, y] = pt(b, R + 17); return <text key={b} x={x} y={y + 3} textAnchor="middle" className="fill-current text-ink-faint" fontSize={10}>{fmt(b)}</text>; })}
        {v != null && (
          <g style={{ transform: `rotate(${on ? deg : -90}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: "transform 1s cubic-bezier(0.2,0.8,0.2,1)" }}>
            <line x1={cx} y1={cy} x2={cx} y2={cy - R + 4} className="stroke-current text-ink" strokeWidth={3.5} strokeLinecap="round" />
          </g>
        )}
        <circle cx={cx} cy={cy} r={7} className="fill-current text-ink" /><circle cx={cx} cy={cy} r={3} className="fill-current text-surface" />
      </svg>
      <p className="-mt-1 text-[1.5rem] font-bold leading-none tabular-nums text-ink sm:text-[1.75rem]">{value == null ? "—" : fmt(value)}</p>
      <p className="mt-1 text-[0.8125rem] font-medium text-ink-muted">{label}</p>
      {status != null && <p className="mt-0.5 text-[0.75rem] text-ink-faint">{words[status]}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- assets vs debts: donut of what they own + the comparison */

function Balance({ m }: { m: Metrics }) {
  const tipFor = useTipFor(); const on = useGrow();
  const assets = [
    { label: "Property", value: m.assets.property, color: S(1) }, { label: "Super", value: m.assets.super, color: S(2) },
    { label: "Savings", value: m.assets.savings, color: S(3) }, { label: "Vehicles", value: m.assets.vehicles, color: S(4) },
    { label: "Other", value: m.assets.other, color: S(5) }, { label: "Contents", value: m.assets.contents, color: S(6) },
  ].filter((x) => x.value > 0);
  const debts = [
    { label: "Home loans", value: m.debts.mortgages }, { label: "Credit cards", value: m.debts.cards }, { label: "Other loans", value: m.debts.loans },
    ...(m.loan.amount ? [{ label: "New loan", value: m.loan.amount }] : []),
  ].filter((x) => x.value > 0);
  const debtTotal = debts.reduce((t, d) => t + d.value, 0);
  if (!m.assets.total && !debtTotal) return <Empty />;
  const R = 70, r = 46, C = 2 * Math.PI * ((R + r) / 2), mid = (R + r) / 2;
  let acc = 0;
  const max = Math.max(m.assets.total, debtTotal, 1);
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
      <svg viewBox="0 0 180 180" className="mx-auto w-full max-w-[200px]" role="img" aria-label={`Assets ${aud(m.assets.total)}`}>
        <circle cx={90} cy={90} r={mid} fill="none" className="stroke-line" strokeWidth={R - r} />
        {assets.map((a) => {
          const frac = a.value / (m.assets.total || 1), len = frac * C, gap = assets.length > 1 ? 2 : 0;
          const seg = <circle key={a.label} cx={90} cy={90} r={mid} fill="none" stroke={a.color} strokeWidth={R - r} strokeDasharray={`${Math.max(0, on ? len - gap : 0)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 90 90)"
            style={{ transition: "stroke-dasharray 1s cubic-bezier(0.2,0.8,0.2,1)" }} {...tipFor({ title: a.label, rows: [{ label: `${Math.round(frac * 100)}% of assets`, value: aud(a.value), color: a.color }] })} />;
          acc += len; return seg;
        })}
        <text x={90} y={84} textAnchor="middle" className="fill-current text-ink-faint" fontSize={11}>Assets</text>
        <text x={90} y={104} textAnchor="middle" className="fill-current text-ink" fontSize={17} fontWeight={700}>{short(m.assets.total)}</text>
      </svg>
      <div className="min-w-0 space-y-4">
        {[{ label: "Assets", total: m.assets.total, parts: assets }, { label: m.loan.amount ? "Debts, with the new loan" : "Debts", total: debtTotal, parts: debts.map((d, i) => ({ ...d, color: i === debts.length - 1 && m.loan.amount ? "var(--bad)" : `color-mix(in oklab, var(--bad) ${70 - i * 15}%, transparent)` })) }].map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex justify-between text-[0.8125rem]"><span className="font-medium text-ink">{row.label}</span><span className="font-semibold tabular-nums text-ink">{aud(row.total)}</span></div>
            <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-md bg-canvas">
              {row.parts.map((p) => (
                <div key={p.label} className="h-full first:rounded-l-md last:rounded-r-md" style={{ width: `${(p.value / max) * 100}%`, background: p.color, ...grow(on, "x") }}
                  {...tipFor({ title: `${row.label} · ${p.label}`, rows: [{ label: "", value: aud(p.value), color: p.color }] })} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-baseline justify-between rounded-xl bg-canvas px-3 py-2 ring-1 ring-inset ring-line">
          <span className="text-[0.8125rem] text-ink-muted">Net worth</span>
          <span className="flex items-center gap-1.5 text-[1.125rem] font-bold tabular-nums text-ink">{m.netWorth >= 0 ? <TrendingUp className="h-4 w-4" style={{ color: GOOD }} /> : <TrendingDown className="h-4 w-4" style={{ color: BAD }} />}{aud(m.netWorth)}</span>
        </div>
        <Legend items={assets} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- stress test */

function Stress({ m }: { m: Metrics }) {
  const tipFor = useTipFor(); const on = useGrow();
  const [ref, w] = useWidth<HTMLDivElement>();
  if (!m.monthly.netIncome || !m.loan.amount) return <Empty text="Needs income and a loan amount." />;
  const vals = m.stress.map((s) => s.surplus), gl = ticks(Math.min(0, ...vals), Math.max(0, ...vals));
  const yMax = Math.max(0, ...vals, gl[gl.length - 1]), yMin = Math.min(0, ...vals, gl[0]);
  const H = 230, top = 22, bottom = 30, left = 46, plotH = H - top - bottom, plotW = Math.max(0, w - left - 4);
  const y = (v: number) => top + ((yMax - v) / (yMax - yMin || 1)) * plotH;
  const bw = plotW / m.stress.length, barW = Math.min(52, bw * 0.6);
  const breakEven = m.stress.find((s) => s.surplus < 0);
  return (
    <div ref={ref} className="w-full">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="Rate stress test">
          {gl.map((g) => <g key={g}><line x1={left} x2={w} y1={y(g)} y2={y(g)} className={g === 0 ? "stroke-ink-faint" : "stroke-line"} strokeWidth={1} strokeDasharray={g === 0 ? undefined : "2 4"} /><text x={left - 8} y={y(g) + 4} textAnchor="end" className="fill-current text-ink-faint" fontSize={11}>{short(g)}</text></g>)}
          {m.stress.map((s, i) => {
            const now = s.rate === m.assumptions.assessmentRate, x = left + i * bw + (bw - barW) / 2;
            const t0 = y(Math.max(0, s.surplus)), h = Math.max(2, Math.abs(y(s.surplus) - y(0))), color = s.surplus >= 0 ? GOOD : BAD;
            return (
              <g key={s.rate}>
                <rect x={x - 6} y={top} width={barW + 12} height={plotH} fill="transparent" {...tipFor({ title: `At ${s.rate}%${now ? " (assessment rate)" : ""}`, rows: [{ label: s.surplus >= 0 ? "surplus a month" : "shortfall a month", value: aud(s.surplus), color }, { label: "loan repayment a month", value: aud(m.monthly.newLoan + (m.monthly.surplus - s.surplus)) }] })} />
                <rect x={x} y={t0} width={barW} height={h} rx={4} fill={color} opacity={now ? 1 : 0.55} pointerEvents="none" style={grow(on, "y", s.surplus >= 0 ? "center bottom" : "center top")} />
                <text x={x + barW / 2} y={s.surplus >= 0 ? t0 - 7 : t0 + h + 15} textAnchor="middle" className="fill-current text-ink" fontSize={12} fontWeight={now ? 700 : 500} pointerEvents="none">{short(s.surplus)}</text>
                <text x={left + i * bw + bw / 2} y={H - 8} textAnchor="middle" className={cn("fill-current", now ? "text-ink" : "text-ink-muted")} fontSize={11} fontWeight={now ? 700 : 400} pointerEvents="none">{s.rate}%</text>
              </g>
            );
          })}
        </svg>
      )}
      <p className="mt-1 text-[0.75rem] text-ink-muted">{breakEven ? `Runs short from about ${breakEven.rate}%.` : `Still in surplus at ${m.stress[m.stress.length - 1].rate}%.`} Highlighted bar is the assessment rate.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- income by source and person */

function Income({ m }: { m: Metrics }) {
  const tipFor = useTipFor(); const on = useGrow();
  if (!m.incomeGross) return <Empty text="Shows once income is entered." />;
  const rows = [
    ...m.applicants.flatMap((p, i) => [
      { who: p.name, label: "Salary or wages", value: p.salary, color: S(1 + i * 2) },
      { who: p.name, label: "Director's wages", value: p.directors, color: S(2 + i * 2) },
      { who: p.name, label: "Other income", value: p.other, color: S(5) },
      { who: p.name, label: "Business profit (share)", value: p.business, color: S(3 + i * 2) },
    ]),
    { who: "Property", label: m.rentCounted === Math.round(m.rentGross * m.assumptions.rentShading) ? `Rent (${Math.round(m.assumptions.rentShading * 100)}% counted)` : "Rent (counted)", value: m.rentCounted, color: S(6) },
  ].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between"><span className="text-[0.8125rem] text-ink-muted">Total, before tax</span><span className="text-[1.375rem] font-bold tabular-nums text-ink">{aud(m.incomeGross)}</span></div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={`${r.who}-${r.label}`} {...tipFor({ title: `${r.who} · ${r.label}`, rows: [{ label: "a year", value: aud(r.value), color: r.color }, { label: "of all income", value: `${Math.round((r.value / m.incomeGross) * 100)}%` }] })}>
            <div className="mb-1 flex justify-between gap-3 text-[0.8125rem]"><span className="truncate text-ink"><b className="font-semibold">{r.who}</b> · {r.label}</span><span className="tabular-nums text-ink-muted">{aud(r.value)}</span></div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color, ...grow(on, "x") }} /></div>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
        {m.applicants.map((p) => (
          <div key={p.name} className="rounded-lg bg-canvas px-3 py-2 text-[0.75rem] ring-1 ring-inset ring-line"><p className="font-semibold text-ink">{p.name}</p><p className="tabular-nums text-ink-muted">{aud(p.gross)} gross → {aud(p.net)} after est. tax</p></div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- who owns what */

function Owners({ m, names }: { m: Metrics; names: string[] }) {
  const tipFor = useTipFor(); const on = useGrow();
  const list = m.byOwner.filter((o) => o.assets || o.debts);
  if (!list.length) return <Empty text="Shows once assets and debts have an owner." />;
  const max = Math.max(1, ...list.flatMap((o) => [o.assets, o.debts]));
  return (
    <div className="space-y-4">
      {list.map((o) => {
        const who = o.owner === "Not assigned" ? "Not assigned to anyone" : ownerLabel(o.owner, names);
        return (
          <div key={o.owner} {...tipFor({ title: who, rows: [{ label: "assets", value: aud(o.assets), color: S(3) }, { label: "debts", value: aud(o.debts), color: BAD }, { label: "net", value: aud(o.net) }] })}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2"><span className="text-[0.875rem] font-semibold text-ink">{who}</span><span className="text-[0.8125rem] tabular-nums text-ink-muted">net <b className="text-ink">{aud(o.net)}</b></span></div>
            <div className="space-y-1">
              {[{ v: o.assets, c: S(3), l: "Assets" }, { v: o.debts, c: BAD, l: "Debts" }].map((b) => (
                <div key={b.l} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-[0.6875rem] text-ink-faint">{b.l}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full" style={{ width: `${(b.v / max) * 100}%`, background: b.c, ...grow(on, "x") }} /></div>
                  <span className="w-16 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-muted">{short(b.v)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <Legend items={[{ label: "Assets", color: S(3) }, { label: "Debts", color: BAD }]} />
    </div>
  );
}

/* ---------------------------------------------------------------- business (Xero) */

function Business({ years }: { years: BusinessYear[] }) {
  const tipFor = useTipFor(); const on = useGrow();
  const [ref, w] = useWidth<HTMLDivElement>();
  const vals = years.flatMap((y) => [y.revenue ?? 0, y.netProfit ?? 0]);
  const gl = ticks(Math.min(0, ...vals), Math.max(1, ...vals));
  const yMax = Math.max(...vals, gl[gl.length - 1]), yMin = Math.min(0, ...vals, gl[0]);
  const H = 250, top = 22, bottom = 40, left = 52, plotH = H - top - bottom, plotW = Math.max(0, w - left - 4);
  const y = (v: number) => top + ((yMax - v) / (yMax - yMin || 1)) * plotH;
  const gw = plotW / Math.max(1, years.length), barW = Math.min(46, (gw - 24) / 2);
  const multi = new Set(years.map((y) => y.org)).size > 1;
  return (
    <div ref={ref} className="w-full">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="Business revenue and net profit by year">
          {gl.map((g) => <g key={g}><line x1={left} x2={w} y1={y(g)} y2={y(g)} className={g === 0 ? "stroke-ink-faint" : "stroke-line"} strokeWidth={1} strokeDasharray={g === 0 ? undefined : "2 4"} /><text x={left - 8} y={y(g) + 4} textAnchor="end" className="fill-current text-ink-faint" fontSize={11}>{short(g)}</text></g>)}
          {years.map((yr, i) => {
            const cx = left + i * gw + gw / 2;
            const margin = yr.revenue && yr.netProfit != null ? Math.round((yr.netProfit / yr.revenue) * 1000) / 10 : null;
            return (
              <g key={`${yr.org}-${yr.fy}`}>
                <rect x={cx - gw / 2 + 4} y={top} width={gw - 8} height={plotH} fill="transparent" {...tipFor({ title: `${yr.org} · ${yr.fy}`, rows: [{ label: "revenue", value: aud(yr.revenue), color: S(1) }, { label: "net profit", value: aud(yr.netProfit), color: S(3) }, ...(margin != null ? [{ label: "net margin", value: `${margin}%` }] : []), ...(yr.equity != null ? [{ label: "net assets", value: aud(yr.equity) }] : [])] })} />
                {[{ v: yr.revenue, c: S(1) }, { v: yr.netProfit, c: (yr.netProfit ?? 0) >= 0 ? S(3) : BAD }].map((b, k) => {
                  const val = b.v ?? 0, x = cx - barW - 2 + k * (barW + 4), t0 = y(Math.max(0, val)), h = Math.max(2, Math.abs(y(val) - y(0)));
                  return (
                    <g key={k} pointerEvents="none">
                      <rect x={x} y={t0} width={barW} height={h} rx={4} fill={b.c} style={grow(on, "y", val >= 0 ? "center bottom" : "center top")} />
                      <text x={x + barW / 2} y={val >= 0 ? t0 - 6 : t0 + h + 14} textAnchor="middle" className="fill-current text-ink" fontSize={11} fontWeight={600}>{b.v == null ? "—" : short(val)}</text>
                    </g>
                  );
                })}
                <text x={cx} y={H - 22} textAnchor="middle" className="fill-current text-ink-muted" fontSize={11} fontWeight={600} pointerEvents="none">{yr.fy}</text>
                {multi && <text x={cx} y={H - 8} textAnchor="middle" className="fill-current text-ink-faint" fontSize={10} pointerEvents="none">{yr.org.slice(0, 24)}</text>}
              </g>
            );
          })}
        </svg>
      )}
      <Legend items={[{ label: "Revenue", color: S(1) }, { label: "Net profit", color: S(3) }]} />
    </div>
  );
}

/* ---------------------------------------------------------------- score */

function ScoreRing({ score, rating }: { score: number | null; rating: string | null }) {
  const on = useGrow();
  const R = 52, L = 2 * Math.PI * R, pct = score == null ? 0 : score / 100;
  const color = rating === "Strong" || rating === "Sound" ? GOOD : rating === "Stretched" ? WARN : rating === "Weak" ? BAD : "transparent";
  const Icon = rating === "Strong" || rating === "Sound" ? CheckCircle2 : rating ? AlertTriangle : null;
  return (
    <div className="relative h-[132px] w-[132px] shrink-0" role="img" aria-label={score == null ? "Not assessed yet" : `${rating}, score ${score} out of 100`}>
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx={64} cy={64} r={R} fill="none" className="stroke-line" strokeWidth={11} />
        <circle cx={64} cy={64} r={R} fill="none" stroke={color} strokeWidth={11} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={on ? L * (1 - pct) : L} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.2,0.8,0.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[2rem] font-bold leading-none tabular-nums text-ink">{score ?? "—"}</p>
          <p className="mt-1 flex items-center justify-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">{Icon && <Icon className="h-3 w-3" style={{ color }} />}{rating ?? "Not run"}</p>
        </div>
      </div>
    </div>
  );
}
