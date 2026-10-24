"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Info, Printer } from "lucide-react";
import { DEFAULT_INPUT, DRINKS, machineComparison, packageResult, pointAt, toCsv, type CalcInput, type PackageResult, type Point } from "@/lib/roast/calc";
import type { Machine } from "@/lib/roast/config";

/* Roast Culture palette — matches the roast profiler screen: deep navy, cyan, magenta, yellow */
const C = { burg: "#161D4A", burgDeep: "#0D1330", ivory: "#151C40", sage: "#22E0B0", terra: "#FF2D8F", gold: "#27D9E8", ink: "#E7ECFF", muted: "#8F9AC0", line: "rgba(255,255,255,0.1)" };

const aud = (n: number | null, cents = true) => (n === null || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n));
const kg = (n: number) => (n > 0 && n < 1 ? `${Math.round(n * 1000).toLocaleString("en-AU")} g` : `${(Math.round(n * 10) / 10).toLocaleString("en-AU")} kg`);
const pct = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : `${Math.round(n * 10) / 10}%`);
const hm = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
const whole = (n: number) => Math.round(n).toLocaleString("en-AU");

type View = "day" | "two";
type Graph = "timeline" | "money" | "mix" | "sessions" | "machines";

/* ------------------------------------------------------------------ controls */

function Slider({ label, value, onChange, min, max, step, unit, hint, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit?: string; hint?: string; format?: (v: number) => string }) {
  const id = useId();
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[0.8438rem] text-white/80">{label}{hint && <span className="ml-1 text-white/50">· {hint}</span>}</label>
        <span className="flex items-baseline gap-1">
          <input type="number" inputMode="decimal" aria-label={`${label} (exact)`} value={Number.isFinite(value) ? value : 0} min={min} step={step}
            onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
            className="w-[5.5rem] rounded-md bg-white/10 px-2 py-0.5 text-right text-[0.9375rem] font-semibold tabular-nums text-white outline-none ring-1 ring-white/15 focus:ring-[#27D9E8]" />
          {unit && <span className="text-[0.8125rem] text-white/60">{unit}</span>}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format ? format(value) : `${value}${unit ? ` ${unit}` : ""}`} className="rc-range w-full" />
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-[10px] bg-white/10 p-1">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={`flex-1 rounded-[7px] px-2 py-2 text-[0.8125rem] font-semibold transition ${value === o.id ? "bg-[#27D9E8] text-[#0D1330]" : "text-white/80 hover:text-white"}`}>{o.label}</button>
      ))}
    </div>
  );
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="mb-3 flex cursor-pointer items-start gap-2.5 text-[0.8438rem] text-white/85">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#27D9E8]" />
      <span>{label}{hint && <span className="block text-[0.75rem] text-white/50">{hint}</span>}</span>
    </label>
  );
}

function Fold({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-t border-white/10 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-white/70">{title}<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ graphs — styled like a roast profiler screen */

/** Profiler palette: deep navy screen, neon traces */
const G = { bg: "#0D1330", bg2: "#1C1446", grid: "rgba(255,255,255,0.08)", axis: "rgba(214,224,255,0.55)", text: "#E7ECFF", dim: "rgba(214,224,255,0.62)",
  cyan: "#27D9E8", blue: "#3AA8FF", pink: "#FF2D8F", yellow: "#F7D31E", purple: "#9D7BFF", orange: "#FF8A3D", teal: "#22E0B0" };

// Chart size in SVG units: wide on a computer, closer to real pixels on a phone so the labels stay readable
let W = 640, H = 270;
const PAD = { l: 52, r: 16, t: 18, b: 30 };
function useChartSize() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const q = window.matchMedia("(max-width: 640px)"); const f = () => setNarrow(q.matches); f(); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  W = narrow ? 380 : 640; H = narrow ? 260 : 270;
  return narrow;
}
const nice = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
/** Round tick marks (0, 250, 500…) covering lo..hi */
function ticksFor(lo: number, hi: number) {
  const step = nice(Math.max(1e-9, hi - lo) / 4);
  const a = Math.floor(lo / step + 1e-9) * step;
  const out: number[] = [];
  for (let v = a; v <= hi + step * 0.999 && out.length < 9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return { ticks: out, lo: out[0], hi: out[out.length - 1] };
}

/** Touch and drag (or hover) along the session; tap pins it; arrow keys step between finished slots. */
function useScrub(r: PackageResult) {
  const [minute, setMinute] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const total = r.hours * 60;
  const fromEvent = (e: React.PointerEvent) => {
    const el = svg.current; if (!el) return null;
    const b = el.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * W;
    return Math.max(0, Math.min(total, ((x - PAD.l) / (W - PAD.l - PAD.r)) * total));
  };
  const slots = r.points.map((p) => p.t);
  const step = (dir: 1 | -1) => {
    const cur = minute ?? 0;
    const next = dir > 0 ? slots.find((t) => t > cur + 1e-6) ?? total : [...slots].reverse().find((t) => t < cur - 1e-6) ?? 0;
    setMinute(next); setPinned(true);
  };
  const handlers = {
    onPointerMove: (e: React.PointerEvent) => { if (pinned && e.pointerType === "mouse") return; const m = fromEvent(e); if (m !== null) setMinute(m); },
    onPointerDown: (e: React.PointerEvent) => { const m = fromEvent(e); if (m !== null) setMinute(m); },
    onPointerUp: (e: React.PointerEvent) => { if (e.pointerType === "mouse") setPinned((p) => !p); else setPinned(true); },
    onPointerLeave: () => { if (!pinned) setMinute(null); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "Home") { e.preventDefault(); setMinute(0); setPinned(true); }
      else if (e.key === "End") { e.preventDefault(); setMinute(total); setPinned(true); }
      else if (e.key === "Escape") { setPinned(false); setMinute(null); }
    },
  };
  return { svg, minute, pinned, handlers, clear: () => { setPinned(false); setMinute(null); } };
}

const sx = (t: number, total: number) => PAD.l + (t / total) * (W - PAD.l - PAD.r);
const sy = (v: number, lo: number, hi: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);

/**
 * A smooth line through the finished slots (monotone cubic — it never overshoots, so a total never appears to dip).
 * The readout below always reports completed batches only.
 */
function smoothPath(pts: Point[], val: (p: Point) => number, total: number, lo: number, hi: number) {
  const xy: [number, number][] = [];
  for (const p of pts) { const x = sx(p.t, total), y = sy(val(p), lo, hi); if (xy.length && Math.abs(xy[xy.length - 1][0] - x) < 0.01) xy[xy.length - 1] = [x, y]; else xy.push([x, y]); }
  if (xy.length < 2) return xy.length ? `M${xy[0][0]},${xy[0][1]}` : "";
  const n = xy.length, m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) m.push((xy[i + 1][1] - xy[i][1]) / (xy[i + 1][0] - xy[i][0]));
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (xy[i + 1][0] - xy[i][0]) / 3;
    d += `C${xy[i][0] + dx},${xy[i][1] + t[i] * dx} ${xy[i + 1][0] - dx},${xy[i + 1][1] - t[i + 1] * dx} ${xy[i + 1][0]},${xy[i + 1][1]}`;
  }
  return d;
}

function Defs() {
  return (
    <defs>
      <linearGradient id="rcScreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={G.bg} /><stop offset="1" stopColor={G.bg2} /></linearGradient>
      {([["rcCyan", G.cyan], ["rcPink", G.pink], ["rcYellow", G.yellow]] as const).map(([id, c]) => (
        <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity="0.38" /><stop offset="1" stopColor={c} stopOpacity="0.02" /></linearGradient>
      ))}
      <filter id="rcGlow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
  );
}

function Axes({ total, lo, hi, ticks, fmt }: { total: number; lo: number; hi: number; ticks: number[]; fmt: (v: number) => string }) {
  const hours = Array.from({ length: total / 60 + 1 }, (_, i) => i);
  return (
    <g aria-hidden>
      <rect x="0" y="0" width={W} height={H} rx="14" fill="url(#rcScreen)" />
      {hours.map((h) => <line key={`v${h}`} x1={sx(h * 60, total)} x2={sx(h * 60, total)} y1={PAD.t} y2={H - PAD.b} stroke={G.grid} />)}
      {ticks.map((v) => (
        <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={sy(v, lo, hi)} y2={sy(v, lo, hi)} stroke={v === 0 && lo < 0 ? "rgba(255,255,255,0.3)" : G.grid} />
          <text x={PAD.l - 8} y={sy(v, lo, hi) + 4} textAnchor="end" fontSize="11" fontWeight="600" fill={G.axis}>{fmt(v)}</text></g>
      ))}
      {hours.map((h) => <text key={h} x={sx(h * 60, total)} y={H - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill={G.axis}>{h}h</text>)}
    </g>
  );
}

function BreakBand({ r }: { r: PackageResult }) {
  if (!r.breakMin) return null;
  const total = r.hours * 60, usable = total - r.breakMin, start = usable / 2;
  return (
    <g aria-hidden>
      <rect x={sx(start, total)} y={PAD.t} width={sx(start + r.breakMin, total) - sx(start, total)} height={H - PAD.t - PAD.b} fill={G.purple} opacity={0.2} />
      <text x={sx(start + r.breakMin / 2, total)} y={PAD.t + 13} textAnchor="middle" fontSize="10" fontWeight="700" fill={G.purple}>BREAK</text>
    </g>
  );
}

/** The scrub line with a profiler-style tag, e.g. "4h 02m · 408 kg" */
function Guide({ minute, total, tag }: { minute: number | null; total: number; tag: string }) {
  if (minute === null) return null;
  const x = sx(minute, total), w = Math.max(70, tag.length * 6.6 + 16), left = x + w + 8 > W - PAD.r ? x - w - 6 : x + 6;
  return (
    <g aria-hidden>
      <line x1={x} x2={x} y1={PAD.t} y2={H - PAD.b} stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={1.2} strokeDasharray="4 3" />
      <rect x={left} y={PAD.t + 4} width={w} height={20} rx={6} fill={G.pink} opacity={0.92} />
      <text x={left + w / 2} y={PAD.t + 18} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{tag}</text>
    </g>
  );
}

function Detail({ r, p, channel, showMoney }: { r: PackageResult; p: Point | null; channel: CalcInput["channel"]; showMoney: boolean }) {
  const q = p ?? r.points[r.points.length - 1];
  const cell = (label: string, value: React.ReactNode, color?: string) => <div><dt style={{ color: G.dim }}>{label}</dt><dd className="font-semibold tabular-nums" style={{ color: color ?? G.text }}>{value}</dd></div>;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl p-4 text-[0.8438rem] ring-1 ring-white/10 sm:grid-cols-3" style={{ background: "rgba(255,255,255,0.05)" }} aria-live="polite">
      {cell(p ? "At" : "End of session", hm(q.t))}
      {cell("Completed batches", q.batches)}
      {cell("Green processed", kg(q.greenKg))}
      {cell("Roasted", kg(q.roastedKg), G.cyan)}
      {cell("Committed cost", aud(q.cost), G.pink)}
      {cell("Cost per roasted kg", q.roastedKg > 0 ? aud(q.cost / q.roastedKg) : "—")}
      {showMoney && <>
        {cell(`Potential sales (${channel === "bags" ? "bags" : "drinks"})`, aud(q.sales), G.cyan)}
        {cell("Potential contribution", aud(q.contribution), q.contribution < 0 ? "#FF6B6B" : G.yellow)}
      </>}
    </dl>
  );
}

const svgClass = "w-full touch-pan-y select-none rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[#27D9E8]";

function Timeline({ r, channel }: { r: PackageResult; channel: CalcInput["channel"] }) {
  const [mode, setMode] = useState<"kg" | "batches">("kg");
  useChartSize();
  const { svg, minute, pinned, handlers, clear } = useScrub(r);
  const total = r.hours * 60;
  const val = (p: Point) => (mode === "kg" ? p.roastedKg : p.batches);
  const tk = ticksFor(0, Math.max(1e-9, val(r.points[r.points.length - 1])) * 1.02);
  const hi = tk.hi;
  const p = minute === null ? null : pointAt(r, minute);
  const line = smoothPath(r.points, val, total, 0, hi);
  const slots = r.points.filter((q, k) => k > 0 && q.batches > r.points[k - 1].batches);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[0.8125rem]" style={{ color: G.dim }}>Roasted {mode === "kg" ? "coffee" : "batches"} through the session</p>
        <div className="flex gap-1 rounded-full bg-white/10 p-1 text-[0.75rem] font-semibold">
          {(["kg", "batches"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 ${mode === m ? "bg-[#27D9E8] text-[#0D1330]" : "text-white/70"}`}>{m === "kg" ? "Kilograms" : "Batches"}</button>)}
        </div>
      </div>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={svgClass} tabIndex={0} role="img"
        aria-label={`Production timeline for the ${r.label}: ${r.batches} complete batches, ${kg(r.roastedKg)} roasted. Use the arrow keys to step between finished batches.`} {...handlers}>
        <Defs />
        <Axes total={total} lo={0} hi={hi} ticks={tk.ticks} fmt={(v) => (mode === "kg" ? (hi < 2 ? `${Math.round(v * 1000)}g` : `${Math.round(v).toLocaleString("en-AU")}`) : `${Math.round(v)}`)} />
        <BreakBand r={r} />
        {line && <path d={`${line}L${sx(total, total)},${sy(0, 0, hi)}L${sx(0, total)},${sy(0, 0, hi)}Z`} fill="url(#rcCyan)" />}
        <path d={line} fill="none" stroke={G.cyan} strokeWidth={2.6} filter="url(#rcGlow)" strokeLinecap="round" />
        {slots.length <= 80 && slots.map((q) => <circle key={q.batches} cx={sx(q.t, total)} cy={sy(val(q), 0, hi)} r={2.2} fill={G.yellow} />)}
        <Guide minute={minute} total={total} tag={p ? `${hm(p.t)} · ${mode === "kg" ? kg(p.roastedKg) : `${p.batches} batches`}` : ""} />
      </svg>
      <div className="mt-3"><Detail r={r} p={p} channel={channel} showMoney /></div>
      <p className="mt-2 text-[0.75rem]" style={{ color: G.dim }}>{pinned ? <button type="button" onClick={clear} className="underline">Unpin</button> : "Hover, or touch and drag along the graph. Tap to pin."} Yellow dots mark each finished roast; the figures count completed batches only.</p>
    </div>
  );
}

function MoneyChart({ r, channel }: { r: PackageResult; channel: CalcInput["channel"] }) {
  const [showC, setShowC] = useState(true);
  useChartSize();
  const { svg, minute, handlers } = useScrub(r);
  const total = r.hours * 60;
  const vals = r.points.flatMap((q) => [q.cost, q.sales, showC ? q.contribution : 0]);
  const tk = ticksFor(Math.min(0, ...vals), Math.max(...vals, 1) * 1.02);
  const hi = tk.hi, lo = tk.lo;
  const p = minute === null ? null : pointAt(r, minute);
  const short = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v) >= 1000 ? `${Math.round(Math.abs(v) / 100) / 10}k` : Math.round(Math.abs(v))}`;
  const base = sy(Math.max(lo, 0), lo, hi);
  const fill = (d: string) => (d ? `${d}L${sx(total, total)},${base}L${sx(0, total)},${base}Z` : "");
  const sales = smoothPath(r.points, (q) => q.sales, total, lo, hi), cost = smoothPath(r.points, (q) => q.cost, total, lo, hi), contrib = smoothPath(r.points, (q) => q.contribution, total, lo, hi);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] font-semibold" style={{ color: G.text }}>
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-5 rounded" style={{ background: G.pink }} />Committed cost</span>
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-5 rounded" style={{ background: G.cyan }} />Potential sales value</span>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={showC} onChange={(e) => setShowC(e.target.checked)} className="accent-[#F7D31E]" /><span className="h-[3px] w-5 rounded" style={{ background: G.yellow }} />Potential contribution</label>
      </div>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={svgClass} tabIndex={0} role="img"
        aria-label={`Costs and potential earnings for the ${r.label}: the whole ${aud(r.hire, false)} hire is committed from the start; potential sales value reaches ${aud(r.revenue, false)}.`} {...handlers}>
        <Defs />
        <Axes total={total} lo={lo} hi={hi} ticks={tk.ticks} fmt={short} />
        <BreakBand r={r} />
        <path d={fill(sales)} fill="url(#rcCyan)" />
        {showC && <path d={fill(contrib)} fill="url(#rcYellow)" />}
        <path d={sales} fill="none" stroke={G.cyan} strokeWidth={2.6} filter="url(#rcGlow)" strokeLinecap="round" />
        <path d={cost} fill="none" stroke={G.pink} strokeWidth={2.6} filter="url(#rcGlow)" strokeLinecap="round" />
        {showC && <path d={contrib} fill="none" stroke={G.yellow} strokeWidth={2.4} filter="url(#rcGlow)" strokeLinecap="round" />}
        <Guide minute={minute} total={total} tag={p ? `${hm(p.t)} · ${short(p.contribution)}` : ""} />
      </svg>
      <div className="mt-3"><Detail r={r} p={p} channel={channel} showMoney /></div>
      <p className="mt-2 text-[0.75rem]" style={{ color: G.dim }}>The whole booked hire is owed from the first minute. Sales are <strong className="text-white">potential</strong> — the value of the finished coffee if it sells as set, not money made during the session.</p>
    </div>
  );
}

function Mix({ r }: { r: PackageResult }) {
  const parts = [
    { k: "green", label: "Green coffee", v: r.costs.green, c: G.teal },
    { k: "hire", label: "Roaster hire", v: r.costs.hire, c: G.pink },
    { k: "packaging", label: "Packaging", v: r.costs.packaging, c: G.yellow },
    { k: "milk", label: "Milk", v: r.costs.milk, c: G.blue },
    { k: "cups", label: "Cups & lids", v: r.costs.cups, c: G.purple },
    { k: "extras", label: "Other costs you added", v: r.costs.extras, c: G.orange },
  ].filter((x) => x.v > 0);
  const [on, setOn] = useState<string | null>(null);
  const tot = r.costs.total;
  return (
    <div style={{ color: G.text }}>
      <p className="mb-3 text-[0.8125rem]" style={{ color: G.dim }}>What each roasted kilogram costs you — tap or hover a part.</p>
      <div className="flex h-14 w-full overflow-hidden rounded-xl ring-1 ring-white/10" role="list" aria-label="Cost composition">
        {parts.map((x) => (
          <button key={x.k} type="button" role="listitem" onMouseEnter={() => setOn(x.k)} onFocus={() => setOn(x.k)} onClick={() => setOn(x.k)}
            aria-label={`${x.label}: ${aud(r.roastedKg > 0 ? x.v / r.roastedKg : null)} per kg, ${pct((x.v / tot) * 100)} of the total`}
            style={{ width: `${(x.v / tot) * 100}%`, background: x.c, opacity: on && on !== x.k ? 0.35 : 0.95, boxShadow: `0 0 18px ${x.c}55` }} className="h-full transition-opacity" />
        ))}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {parts.map((x) => (
          <li key={x.k} onMouseEnter={() => setOn(x.k)} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[0.875rem] ${on === x.k ? "bg-white/10" : ""}`}>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: x.c }} />{x.label}</span>
            <span className="tabular-nums"><strong>{aud(r.roastedKg > 0 ? x.v / r.roastedKg : null)}</strong>/kg · {pct((x.v / tot) * 100)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex justify-between border-t border-white/10 pt-3 text-[0.9375rem] font-semibold"><span>Total modelled cost</span><span className="tabular-nums" style={{ color: G.pink }}>{aud(r.costPerKg)}/kg</span></p>
    </div>
  );
}

function Sessions({ rs }: { rs: PackageResult[] }) {
  const maxCost = Math.max(...rs.map((r) => r.costPerKg ?? 0), 1);
  return (
    <div className="overflow-x-auto" style={{ color: G.text }}>
      <table className="w-full min-w-[520px] text-left text-[0.875rem]">
        <thead><tr className="text-[0.75rem] uppercase tracking-wide" style={{ color: G.dim }}><th className="pb-2 font-semibold">Session</th><th className="pb-2 font-semibold">Roasted</th><th className="pb-2 font-semibold">Hire/kg</th><th className="pb-2 font-semibold">Cost/kg</th><th className="pb-2 font-semibold">Contribution/kg</th></tr></thead>
        <tbody>
          {rs.map((r) => (
            <tr key={r.key} className="border-t border-white/10 align-middle">
              <td className="py-3 pr-3 font-semibold">{r.label}<span className="block text-[0.75rem] font-normal" style={{ color: G.dim }}>{r.batches} batches · {aud(r.hire, false)} hire</span></td>
              <td className="py-3 pr-3 tabular-nums" style={{ color: G.cyan }}>{kg(r.roastedKg)}</td>
              <td className="py-3 pr-3 tabular-nums">{aud(r.hirePerKg)}</td>
              <td className="py-3 pr-3"><span className="flex items-center gap-2 tabular-nums">{aud(r.costPerKg)}<span className="hidden h-2 rounded-full sm:block" style={{ width: `${((r.costPerKg ?? 0) / maxCost) * 70}px`, background: G.pink, boxShadow: `0 0 10px ${G.pink}` }} /></span></td>
              <td className="py-3 tabular-nums font-semibold" style={{ color: (r.contributionPerKg ?? 0) < 0 ? "#FF6B6B" : G.yellow }}>{aud(r.contributionPerKg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[0.75rem]" style={{ color: G.dim }}>The eight-hour day costs the same as four standard hours — and full days depend on availability when you book.</p>
    </div>
  );
}

function Machines({ input, machines }: { input: CalcInput; machines: Machine[] }) {
  const rows = machineComparison(input, machines);
  return (
    <div className="overflow-x-auto" style={{ color: G.text }}>
      <table className="w-full min-w-[560px] text-left text-[0.875rem]">
        <thead><tr className="text-[0.75rem] uppercase tracking-wide" style={{ color: G.dim }}><th className="pb-2 font-semibold">Roaster</th><th className="pb-2 font-semibold">Batch (assumed)</th><th className="pb-2 font-semibold">Day output</th><th className="pb-2 font-semibold">Day hire</th><th className="pb-2 font-semibold">Hire/kg</th><th className="pb-2 font-semibold">Cost/kg</th></tr></thead>
        <tbody>
          {rows.map(({ id, name, batchKg, r }) => (
            <tr key={id} className="border-t border-white/10"><td className="py-2.5 pr-3 font-semibold">{name}</td><td className="py-2.5 pr-3 tabular-nums">{kg(batchKg)}</td><td className="py-2.5 pr-3 tabular-nums" style={{ color: G.cyan }}>{kg(r.roastedKg)}</td><td className="py-2.5 pr-3 tabular-nums">{aud(r.hire, false)}</td><td className="py-2.5 pr-3 tabular-nums">{aud(r.hirePerKg)}</td><td className="py-2.5 tabular-nums" style={{ color: G.pink }}>{aud(r.costPerKg)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[0.75rem]" style={{ color: G.dim }}>Every machine here uses your roast time ({input.roastMin} min), turnaround ({input.turnMin} min) and productivity ({input.productivity}%), with its own starting batch. Real cycle times differ by machine and coffee — change them to model yours.</p>
    </div>
  );
}

/** Profiler-style dials across the top of the screen */
function Gauge({ label, value, sub, frac, color }: { label: string; value: string; sub?: string; frac: number; color: string }) {
  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  const r = 34, c = Math.PI * r * 1.5; // 270° arc
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 90 80" className="h-[84px] w-[96px]" aria-hidden>
        <circle cx="45" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" strokeDasharray={`${c} 999`} strokeLinecap="round" transform="rotate(135 45 44)" />
        <circle cx="45" cy="44" r={r} fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${c * f} 999`} strokeLinecap="round" transform="rotate(135 45 44)" style={{ filter: `drop-shadow(0 0 5px ${color})` }} />
        <text x="45" y="46" textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>{value}</text>
        {sub && <text x="45" y="61" textAnchor="middle" fontSize="8.5" fill={G.dim}>{sub}</text>}
      </svg>
      <p className="-mt-1 text-[0.75rem] font-semibold" style={{ color: G.text }}>{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ the calculator */

export function RoastCalculator({ machines, membershipMonthly }: { machines: Machine[]; membershipMonthly: number }) {
  const start = machines.find((m) => m.id === "g450") ?? machines[machines.length - 1];
  const [machineId, setMachineId] = useState(start.id);
  const [input, setInput] = useState<CalcInput>({ ...DEFAULT_INPUT, hourly: start.hourly, batchKg: start.batchKg, extras: { ...DEFAULT_INPUT.extras, membershipMonthly } });
  const [view, setView] = useState<View>("day");
  const [graph, setGraph] = useState<Graph>("timeline");
  const [drinkSize, setDrinkSize] = useState<"small" | "large">("small");
  const [pricePerKg, setPricePerKg] = useState(40);

  const set = (p: Partial<CalcInput>) => setInput((x) => ({ ...x, ...p }));
  const setBags = (p: Partial<CalcInput["bags"]>) => setInput((x) => ({ ...x, bags: { ...x.bags, ...p } }));
  const setDrinks = (p: Partial<CalcInput["drinks"]>) => setInput((x) => ({ ...x, drinks: { ...x.drinks, ...p } }));
  const setExtras = (p: Partial<CalcInput["extras"]>) => setInput((x) => ({ ...x, extras: { ...x.extras, ...p } }));
  const machine = machines.find((m) => m.id === machineId)!;

  const chooseMachine = (m: Machine) => { setMachineId(m.id); set({ hourly: m.hourly, batchKg: m.batchKg }); };
  const chooseDrink = (s: "small" | "large") => { setDrinkSize(s); const d = DRINKS[s]; setDrinks({ doseG: d.doseG, drinksPerDose: d.drinksPerDose, price: d.price, milkMl: d.milkMl }); };
  // Bags are priced per kg in scenarios; the bag price follows the bag size
  const setKgPrice = (v: number) => { setPricePerKg(v); setBags({ price: Math.round(v * input.bags.bagKg * 100) / 100 }); };
  const setBagKg = (b: number) => setBags({ bagKg: b, price: Math.round(pricePerKg * b * 100) / 100 });

  const results = useMemo(() => (["two", "day", "dayBreak"] as const).map((k) => packageResult(input, k)), [input]);
  const r = view === "two" ? results[0] : results[1];

  const downloadCsv = () => {
    const blob = new Blob([toCsv(input, results, r)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `roast-culture-plan-${machine.id}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const graphs: { id: Graph; label: string }[] = [
    { id: "timeline", label: "Production" }, { id: "money", label: "Cost & earnings" }, { id: "mix", label: "Cost per kg" },
    { id: "sessions", label: "Compare sessions" }, { id: "machines", label: "Compare roasters" },
  ];

  return (
    <div id="roast-calc" className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <style>{`
        .rc-range{-webkit-appearance:none;appearance:none;height:5px;border-radius:3px;background:linear-gradient(90deg,rgba(39,217,232,.55),rgba(157,123,255,.35));outline:none}
        .rc-range::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:${C.gold};border:3px solid ${C.burgDeep};box-shadow:0 0 10px ${C.gold};cursor:pointer}
        .rc-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:${C.gold};border:3px solid ${C.burgDeep};cursor:pointer}
        .rc-range:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px rgba(39,217,232,.45)}
        @media print { body * { visibility: hidden !important } #roast-calc, #roast-calc * { visibility: visible !important } #roast-calc { position: absolute; inset: 0 auto auto 0; width: 100%; } .rc-noprint { display: none !important } #roast-calc .rc-panel { background: #fff !important; color: #000 !important } }
      `}</style>

      {/* Controls — the instrument */}
      <div className="rc-panel relative overflow-hidden rounded-[22px] p-6 text-white shadow-[0_24px_60px_-30px_rgba(13,19,48,.9)]" style={{ background: "linear-gradient(160deg, #1B2358, #0D1330 60%, #1C1446)" }}>
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full border border-[#27D9E8]/25" />
        <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-white/75">Your production</p>

        <div className="mt-4" role="radiogroup" aria-label="Roaster">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {machines.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={m.id === machineId} onClick={() => chooseMachine(m)}
                className={`rounded-[10px] px-2.5 py-2 text-left text-[0.75rem] font-semibold leading-tight ring-1 transition ${m.id === machineId ? "bg-[#27D9E8] text-[#0D1330] ring-[#27D9E8]" : "bg-white/5 text-white/85 ring-white/15 hover:ring-white/40"}`}>
                {m.short}<span className="block font-normal opacity-75">${m.hourly}/hr</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <Slider label="Green coffee per batch" value={input.batchKg} onChange={(v) => set({ batchKg: v })} min={machine.capacityKg < 1 ? 0.01 : 0.1} max={machine.capacityKg} step={machine.capacityKg < 1 ? 0.01 : machine.capacityKg < 5 ? 0.1 : 0.5} unit="kg" hint={machine.capacityKg < 1 ? `${Math.round(input.batchKg * 1000)} g` : undefined} />
          <Slider label="Roast time" value={input.roastMin} onChange={(v) => set({ roastMin: v })} min={1} max={30} step={0.5} unit="min" />
          <Slider label="Turnaround between batches" value={input.turnMin} onChange={(v) => set({ turnMin: v })} min={0} max={20} step={0.5} unit="min" />
          <Slider label="Productivity" value={input.productivity} onChange={(v) => set({ productivity: v })} min={10} max={100} step={1} unit="%" hint="time spent roasting" />
          <Check label="Take a 30-minute break in the eight-hour day" checked={input.breakMin > 0} onChange={(v) => set({ breakMin: v ? 30 : 0 })} hint="Two-hour sessions assume no break." />
          <Slider label="Roast weight loss" value={input.lossPct} onChange={(v) => set({ lossPct: v })} min={5} max={25} step={0.5} unit="%" hint="editable assumption" />
          <Slider label="Green coffee price" value={input.greenPerKg} onChange={(v) => set({ greenPerKg: v })} min={1} max={60} step={0.5} unit="$/kg" />
        </div>

        <Fold title="Selling it" open>
          <Toggle label="Sales channel" value={input.channel} onChange={(v) => set({ channel: v })} options={[{ id: "bags", label: "Wholesale & retail bags" }, { id: "drinks", label: "Prepared drinks" }]} />
          <div className="mt-4">
            {input.channel === "bags" ? (
              <>
                <div className="mb-4">
                  <p className="mb-1.5 text-[0.8438rem] text-white/80">Bag size</p>
                  <Toggle label="Bag size" value={String(input.bags.bagKg)} onChange={(v) => setBagKg(Number(v))} options={[{ id: "0.25", label: "250 g" }, { id: "0.5", label: "500 g" }, { id: "1", label: "1 kg" }]} />
                </div>
                <div className="mb-4">
                  <p className="mb-1.5 text-[0.8438rem] text-white/80">Selling price scenario <span className="text-white/50">· per kg, editable</span></p>
                  <div className="flex gap-1.5">{[35, 40, 45].map((v) => <button key={v} type="button" aria-pressed={pricePerKg === v} onClick={() => setKgPrice(v)} className={`flex-1 rounded-[8px] py-1.5 text-[0.8125rem] font-semibold ring-1 ${pricePerKg === v ? "bg-[#27D9E8] text-[#0D1330] ring-[#27D9E8]" : "ring-white/20 text-white/85"}`}>${v}/kg</button>)}</div>
                </div>
                <Slider label="Selling price per bag" value={input.bags.price} onChange={(v) => setBags({ price: v })} min={1} max={120} step={0.5} unit="$" />
                <Check label="Include bag & label cost" checked={input.bags.packaging} onChange={(v) => setBags({ packaging: v })} />
                {input.bags.packaging && <Slider label="Bag & label per bag" value={input.bags.costPerBag} onChange={(v) => setBags({ costPerBag: v })} min={0} max={5} step={0.05} unit="$" />}
                <Slider label="Bags you expect to sell" value={input.bags.sellPct} onChange={(v) => setBags({ sellPct: v })} min={0} max={100} step={1} unit="%" />
                <Slider label="Wastage" value={input.bags.wastePct} onChange={(v) => setBags({ wastePct: v })} min={0} max={20} step={0.5} unit="%" hint="optional" />
              </>
            ) : (
              <>
                <div className="mb-4"><Toggle label="Drink size" value={drinkSize} onChange={chooseDrink} options={[{ id: "small", label: "6 oz · split shot" }, { id: "large", label: "12 oz · double" }]} /></div>
                <Slider label="Coffee per double shot" value={input.drinks.doseG} onChange={(v) => setDrinks({ doseG: v })} min={14} max={24} step={0.5} unit="g" />
                <Slider label="Drinks per double shot" value={input.drinks.drinksPerDose} onChange={(v) => setDrinks({ drinksPerDose: v })} min={1} max={2} step={1} hint={input.drinks.drinksPerDose === 2 ? "both halves must sell" : undefined} />
                <Slider label="Price per drink" value={input.drinks.price} onChange={(v) => setDrinks({ price: v })} min={2} max={12} step={0.1} unit="$" />
                <Slider label="Dial-in & waste" value={input.drinks.dialInPct} onChange={(v) => setDrinks({ dialInPct: v })} min={0} max={20} step={0.5} unit="%" />
                <Slider label="Drinks you expect to sell" value={input.drinks.sellPct} onChange={(v) => setDrinks({ sellPct: v })} min={0} max={100} step={1} unit="%" />
                <Check label="Include milk" checked={input.drinks.milk} onChange={(v) => setDrinks({ milk: v })} />
                {input.drinks.milk && <>
                  <Slider label="Milk bottle price" value={input.drinks.milkBottle} onChange={(v) => setDrinks({ milkBottle: v })} min={1} max={8} step={0.05} unit="$" hint={`${(input.drinks.bottleMl / 1000).toLocaleString("en-AU")} L bottle`} />
                  <Slider label="Milk per drink" value={input.drinks.milkMl} onChange={(v) => setDrinks({ milkMl: v })} min={50} max={500} step={10} unit="ml" hint={`${input.drinks.milkMl > 0 ? Math.round((input.drinks.bottleMl / input.drinks.milkMl) * 10) / 10 : 0} drinks a bottle · ${aud(input.drinks.bottleMl > 0 ? input.drinks.milkBottle * input.drinks.milkMl / input.drinks.bottleMl : 0)} each`} />
                </>}
                <Slider label="Cups & lids per 1,000" value={input.drinks.cupsPer1000} onChange={(v) => setDrinks({ cupsPer1000: v })} min={0} max={100} step={1} unit="$" hint={`= $${(input.drinks.cupsPer1000 / 1000).toFixed(3)} per cup`} />
              </>
            )}
          </div>
        </Fold>

        <Fold title="Advanced costs">
          <Check label="Add these costs to the plan" checked={input.extras.enabled} onChange={(v) => setExtras({ enabled: v })} />
          <div className={input.extras.enabled ? "" : "pointer-events-none opacity-40"}>
            <Slider label="Production & packing labour" value={input.extras.labourPerHour} onChange={(v) => setExtras({ labourPerHour: v })} min={0} max={80} step={1} unit="$/hr" />
            <Slider label="Labour hours this session" value={input.extras.labourHours} onChange={(v) => setExtras({ labourHours: v })} min={0} max={12} step={0.5} unit="hrs" />
            <Slider label="Setup & cleanup labour" value={input.extras.setupCost} onChange={(v) => setExtras({ setupCost: v })} min={0} max={300} step={5} unit="$" />
            <Slider label="Consumables" value={input.extras.consumablesPerKg} onChange={(v) => setExtras({ consumablesPerKg: v })} min={0} max={5} step={0.05} unit="$/kg" />
            <Slider label="Freight" value={input.extras.freightPerKg} onChange={(v) => setExtras({ freightPerKg: v })} min={0} max={5} step={0.05} unit="$/kg" />
            <Slider label="Overheads this session" value={input.extras.overheadPerSession} onChange={(v) => setExtras({ overheadPerSession: v })} min={0} max={1000} step={10} unit="$" />
            <Slider label="Roasted kg you expect per month" value={input.extras.monthlyKg} onChange={(v) => setExtras({ monthlyKg: v })} min={0} max={5000} step={10} unit="kg" hint={`spreads the $${input.extras.membershipMonthly}/month membership`} />
          </div>
        </Fold>

        <Fold title="Tax view">
          <Toggle label="Tax view" value={input.tax.mode} onChange={(v) => setInput((x) => ({ ...x, tax: { ...x.tax, mode: v } }))} options={[{ id: "cash", label: "Cash (prices as paid)" }, { id: "business", label: "Business (GST removed)" }]} />
          <p className="mt-3 text-[0.75rem] text-white/60">Hire prices are advertised including GST. The business view takes GST off only the lines you mark — a starting point to confirm with your accountant.</p>
          {input.tax.mode === "business" && (
            <div className="mt-3 grid grid-cols-2 gap-x-3">
              {([["hire", "Roaster hire"], ["green", "Green coffee"], ["packaging", "Packaging"], ["extras", "Other costs"], ["milk", "Milk"], ["cups", "Cups & lids"], ["sales", "Sales"]] as const).map(([k, l]) => (
                <Check key={k} label={`${l} includes GST`} checked={input.tax.gst[k]} onChange={(v) => setInput((x) => ({ ...x, tax: { ...x.tax, gst: { ...x.tax.gst, [k]: v } } }))} />
              ))}
            </div>
          )}
        </Fold>
      </div>

      {/* Results */}
      <div className="min-w-0 space-y-5">
        <div className="rounded-[22px] bg-[#111836] p-5 text-[#E7ECFF] ring-1 ring-white/10 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Session" className="flex gap-1 rounded-full bg-white/10 p-1">
              {([["two", `Two hours · ${aud(results[0].hire, false)}`], ["day", `Eight-hour day · ${aud(results[1].hire, false)}`]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold ${view === k ? "bg-[#27D9E8] text-[#0D1330]" : "text-[#C9D2F0]"}`}>{l}</button>
              ))}
            </div>
            <div className="rc-noprint flex gap-2">
              <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold ring-1 ring-white/10 hover:bg-white/[0.05]"><Download className="h-4 w-4" />CSV</button>
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold ring-1 ring-white/10 hover:bg-white/[0.05]"><Printer className="h-4 w-4" />Print</button>
            </div>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-[0.8125rem] text-[#8F9AC0]">Roasted coffee from the {view === "two" ? "two-hour hire" : `eight-hour day${input.breakMin ? " (with break)" : ""}`}</p>
              <p className="shop-serif mt-1 text-[clamp(2.5rem,6vw,3.5rem)] font-semibold leading-none tabular-nums" style={{ color: "#27D9E8", textShadow: "0 0 24px rgba(39,217,232,.45)" }}>{kg(r.roastedKg)}</p>
              <p className="mt-2 text-[0.875rem] text-[#C9D2F0]">{r.batches} complete batch{r.batches === 1 ? "" : "es"} · {kg(r.greenKg)} green · {r.units.full.toLocaleString("en-AU")} {r.units.label}{r.units.leftoverKg > 0.0005 ? ` + ${kg(r.units.leftoverKg)} left over` : ""}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[0.8125rem]">
              <div className="rounded-2xl bg-white/[0.05] p-3"><dt className="text-[#8F9AC0]">Cost per kg</dt><dd className="mt-0.5 text-[1.125rem] font-semibold tabular-nums">{aud(r.costPerKg)}</dd></div>
              <div className="rounded-2xl bg-white/[0.05] p-3"><dt className="text-[#8F9AC0]">Hire per kg</dt><dd className="mt-0.5 text-[1.125rem] font-semibold tabular-nums">{aud(r.hirePerKg)}</dd></div>
              <div className="rounded-2xl bg-white/[0.05] p-3"><dt className="text-[#8F9AC0]">Potential revenue</dt><dd className="mt-0.5 text-[1.125rem] font-semibold tabular-nums">{aud(r.revenue, false)}</dd></div>
              <div className="rounded-2xl bg-white/[0.05] p-3"><dt className="text-[#8F9AC0]">Contribution</dt><dd className={`mt-0.5 text-[1.125rem] font-semibold tabular-nums ${r.contribution < 0 ? "text-[#FF6B6B]" : "text-[#F7D31E]"}`}>{aud(r.contribution, false)}</dd></div>
            </dl>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-[0.8125rem] sm:grid-cols-4">
            <div><dt className="text-[#8F9AC0]">Contribution / kg</dt><dd className="font-semibold tabular-nums">{aud(r.contributionPerKg)}</dd></div>
            <div><dt className="text-[#8F9AC0]">Contribution margin</dt><dd className="font-semibold tabular-nums">{pct(r.marginPct)}</dd></div>
            <div><dt className="text-[#8F9AC0]">Markup on cost</dt><dd className="font-semibold tabular-nums">{pct(r.markupPct)}</dd></div>
            <div><dt className="text-[#8F9AC0]">Break-even price</dt><dd className="font-semibold tabular-nums">{aud(r.breakEvenPrice)}<span className="font-normal text-[#8F9AC0]"> /{input.channel === "bags" ? "bag" : "drink"}</span></dd></div>
          </dl>
        </div>

        <div className="rc-screen rounded-[22px] p-5 shadow-[0_30px_70px_-40px_rgba(13,19,48,.9)] sm:p-6" style={{ background: `linear-gradient(150deg, ${G.bg}, ${G.bg2})` }}>
          <div className="mb-4 grid grid-cols-3 gap-2 border-b border-white/10 pb-4" aria-label="Session dials">
            <Gauge label="Roasted" value={kg(r.roastedKg)} sub={`${r.batches} batches`} frac={(() => { const cyc = input.roastMin + input.turnMin; const max = cyc > 0 ? Math.floor((r.hours * 60) / cyc) : 0; return max ? r.batches / max : 0; })()} color={G.cyan} />
            <Gauge label="Cost per kg" value={aud(r.costPerKg, false)} sub={`vs ${aud((input.channel === "bags" ? (input.bags.bagKg > 0 ? input.bags.price / input.bags.bagKg : 0) : (r.roastedKg > 0 ? r.revenue / r.roastedKg : 0)), false)}/kg`} frac={(r.costPerKg ?? 0) / Math.max(1e-9, input.channel === "bags" ? (input.bags.bagKg > 0 ? input.bags.price / input.bags.bagKg : 1) : (r.roastedKg > 0 ? r.revenue / r.roastedKg : 1))} color={G.pink} />
            <Gauge label="Margin" value={pct(r.marginPct)} sub="contribution" frac={(r.marginPct ?? 0) / 100} color={G.yellow} />
          </div>
          <div role="tablist" aria-label="Graphs" className="rc-noprint no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
            {graphs.map((g) => <button key={g.id} type="button" role="tab" aria-selected={graph === g.id} onClick={() => setGraph(g.id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold ${graph === g.id ? "bg-[#27D9E8] text-[#0D1330]" : "bg-white/10 text-white/80 hover:text-white"}`}>{g.label}</button>)}
          </div>
          {graph === "timeline" && <Timeline key={`t-${view}`} r={r} channel={input.channel} />}
          {graph === "money" && <MoneyChart key={`m-${view}`} r={r} channel={input.channel} />}
          {graph === "mix" && <Mix r={r} />}
          {graph === "sessions" && <Sessions rs={results} />}
          {graph === "machines" && <Machines input={input} machines={machines} />}
        </div>

        <div className="rounded-[22px] bg-white/[0.05] p-5 text-[0.8125rem] leading-relaxed text-[#C9D2F0] ring-1 ring-white/10">
          <p className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4" style={{ color: "#27D9E8" }} />What this plan doesn&apos;t include</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">{r.excluded.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="mt-3 text-[#8F9AC0]">
            A planning tool, not a quote or a promise of output. The example — 30 kg batches on the 45 kg Giesen with about 12-minute roasts and a 3-minute turnaround — reflects efficient, experienced operation; every coffee and roaster behaves differently.
            Potential revenue is what the finished coffee could bring in if it sells as set{input.channel === "drinks" ? " — drinks are sold later, not during the roasting session" : ""}. {input.tax.mode === "cash" ? "Prices are shown as paid, including GST where it applies — this is not net profit." : "GST is removed only from the lines you marked."}
          </p>
        </div>
      </div>
    </div>
  );
}
