import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { isDrop, isRise, type ProductPrices } from "@/lib/pricing/analysis";
import { cn } from "@/lib/cn";

/** Small single-series price line for a row; last point marked; each point has a tooltip. */
export function Sparkline({ points, width = 120, height = 30, label }: { points: { date: string; price: number }[]; width?: number; height?: number; label: string }) {
  if (points.length < 2) return <span className="text-[0.7188rem] text-ink-faint">1 order</span>;
  const pad = 4;
  const ps = points.map((p) => p.price);
  let lo = Math.min(...ps), hi = Math.max(...ps);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible text-brand-600">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.price)} r={i === points.length - 1 ? 3.5 : 6} fill={i === points.length - 1 ? "currentColor" : "transparent"} stroke={i === points.length - 1 ? "white" : "none"} strokeWidth={1.5}>
          <title>{`${p.date}: $${p.price.toFixed(2)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** One product's price over time. */
export function PriceChart({ points, unitLabel }: { points: { date: string; price: number }[]; unitLabel: string }) {
  if (points.length < 2) return <p className="px-4 py-8 text-center text-[0.8125rem] text-ink-muted">Only one order so far — the chart appears after the next one.</p>;
  const W = 720, H = 220, padL = 52, padR = 14, padT = 14, padB = 26;
  const ps = points.map((p) => p.price);
  let lo = Math.min(...ps), hi = Math.max(...ps);
  const span = Math.max(hi - lo, hi * 0.04, 0.2);
  lo = Math.max(0, lo - span * 0.25); hi = hi + span * 0.25;
  const t0 = Date.parse(points[0].date), t1 = Date.parse(points[points.length - 1].date);
  const x = (d: string) => padL + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" ");
  const every = Math.max(1, Math.ceil(points.length / 6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full text-brand-600" role="img" aria-label={`Price per ${unitLabel} over time`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-zinc-200" />
          <text x={padL - 6} y={y(t) + 3.5} fontSize="10.5" textAnchor="end" className="fill-zinc-400">${t.toFixed(2)}</text>
        </g>
      ))}
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(p.date)} cy={y(p.price)} r="4" fill="currentColor" stroke="white" strokeWidth="2" />
          <circle cx={x(p.date)} cy={y(p.price)} r="12" fill="transparent"><title>{`${p.date}: $${p.price.toFixed(2)} per ${unitLabel}`}</title></circle>
          {(i % every === 0 || i === points.length - 1) && <text x={x(p.date)} y={H - 7} fontSize="10.5" textAnchor="middle" className="fill-zinc-400">{p.date.slice(8, 10)}/{p.date.slice(5, 7)}/{p.date.slice(2, 4)}</text>}
        </g>
      ))}
    </svg>
  );
}

/** Rise / discount badge — an arrow and a word, never colour alone. */
export function ChangeCell({ p }: { p: ProductPrices }) {
  if (p.change === null) return <span className="text-[0.7812rem] text-ink-faint">First order</span>;
  if (!isRise(p) && !isDrop(p)) return <span className="inline-flex items-center gap-1 text-[0.7812rem] text-ink-muted"><Minus className="h-3.5 w-3.5" />No change</span>;
  const up = isRise(p);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.7812rem] font-semibold tabular-nums", up ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700")}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{up ? "Up" : "Down"} {Math.abs(p.changePct ?? 0).toFixed(1)}%
    </span>
  );
}
