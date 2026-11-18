"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Validated categorical palette (same as the loan charts), with dark-mode steps. */
export const CHART_VARS = "[--s1:#2a78d6] [--s2:#eb6834] [--s3:#1baf7a] [--s4:#eda100] [--s5:#e87ba4] [--s6:#6250d6] [--good:#0ca30c] [--bad:#d03b3b] " +
  "dark:[--s1:#3987e5] dark:[--s2:#d95926] dark:[--s3:#199e70] dark:[--s4:#c98500] dark:[--s5:#d55181] dark:[--s6:#9085e9] dark:[--good:#2fbf2f] dark:[--bad:#e05a5a]";

import { aud } from "@/lib/sales/format";
export { aud };
const short = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return a >= 1_000_000 ? `${s}$${(a / 1_000_000).toFixed(1)}m` : a >= 1000 ? `${s}$${Math.round(a / 1000)}k` : `${s}$${Math.round(a)}`;
};
const monthLabel = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" });
const monthLong = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width))); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}

export interface ChartMonth { month: string; sales: number; cogs: number; wages: number; overheads: number; profit: number; partial: boolean }

/** Monthly sales (bars) with profit (line and points); tap or hover a month for the breakdown. */
export function MonthlyChart({ months }: { months: ChartMonth[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const H = 240, padL = 44, padR = 8, padT = 12, padB = 26;
  const max = Math.max(1, ...months.map((m) => Math.max(m.sales, m.profit)));
  const min = Math.min(0, ...months.map((m) => m.profit));
  const plotW = Math.max(10, w - padL - padR), plotH = H - padT - padB;
  const y = (v: number) => padT + ((max - v) / (max - min || 1)) * plotH;
  const step = plotW / Math.max(1, months.length), bw = Math.max(4, Math.min(34, step * 0.56));
  const x = (i: number) => padL + step * i + step / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + (max - min) * t);
  const pts = months.map((m, i) => `${x(i)},${y(m.profit)}`).join(" ");
  const show = sel ?? months.length - 1;
  const cur = months[show];
  const everyOther = w > 0 && step < 34;
  return (
    <div className={cn("w-full", CHART_VARS)}>
      <div ref={ref} className="w-full">
        {w > 0 && (
          <svg width={w} height={H} role="img" aria-label="Monthly sales and profit" onMouseLeave={() => setSel(null)}>
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} strokeDasharray={Math.abs(t) < 0.5 ? undefined : "2 4"} />
                <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-faint text-[10px] tabular-nums">{short(t)}</text>
              </g>
            ))}
            {months.map((m, i) => (
              <g key={m.month} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} className="cursor-pointer">
                <rect x={x(i) - step / 2} y={padT} width={step} height={plotH} fill="transparent" />
                <rect x={x(i) - bw / 2} y={y(Math.max(0, m.sales))} width={bw} height={Math.max(0, y(0) - y(Math.max(0, m.sales)))} rx={4}
                  fill="var(--s1)" opacity={show === i ? 1 : m.partial ? 0.35 : 0.7} />
                {(!everyOther || i % 2 === months.length % 2) && (
                  <text x={x(i)} y={H - 8} textAnchor="middle" className={cn("text-[10px]", show === i ? "fill-ink font-semibold" : "fill-ink-faint")}>{monthLabel(m.month)}</text>
                )}
              </g>
            ))}
            <polyline points={pts} fill="none" stroke="var(--good)" strokeWidth={2} strokeLinejoin="round" />
            {months.map((m, i) => (
              <circle key={m.month} cx={x(i)} cy={y(m.profit)} r={show === i ? 5.5 : 4} fill={m.profit < 0 ? "var(--bad)" : "var(--good)"} stroke="rgb(var(--surface))" strokeWidth={2} className="pointer-events-none" />
            ))}
          </svg>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--s1)" }} />Sales (ex GST)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--good)" }} />Profit</span>
        <span>Tap a month for its breakdown</span>
      </div>
      {cur && (
        <div className="mt-3 rounded-xl bg-canvas p-3 ring-1 ring-line">
          <p className="text-[0.8125rem] font-semibold text-ink">{monthLong(cur.month)}{cur.partial ? " (so far)" : ""}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.8125rem] sm:grid-cols-5">
            {([["Sales", cur.sales], ["Cost of goods", -cur.cogs], ["Wages", -cur.wages], ["Overheads", -cur.overheads], ["Profit", cur.profit]] as [string, number][]).map(([l, v]) => (
              <div key={l} className="min-w-0"><dt className="text-[0.6875rem] text-ink-faint">{l}</dt><dd className={cn("tabular-nums text-ink", l === "Profit" && "font-semibold", l === "Profit" && v < 0 && "text-rose-600")}>{aud(v)}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** A ranked list with bars (locations, categories, best sellers, weekdays). */
export function BarList({ rows, color = "var(--s1)", format = (n: number) => aud(n), max: maxIn, note }: { rows: { label: string; value: number; sub?: string; highlight?: boolean }[]; color?: string; format?: (n: number) => string; max?: number; note?: string }) {
  const max = maxIn ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-[0.8125rem] text-ink-muted">{note ?? "Nothing yet."}</p>;
  return (
    <ul className={cn("space-y-2.5", CHART_VARS)}>
      {rows.map((r) => (
        <li key={r.label} className="text-[0.8125rem]">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className={cn("min-w-0 truncate", r.highlight ? "font-semibold text-ink" : "text-ink")}>{r.label}{r.sub ? <span className="ml-1.5 text-[0.75rem] text-ink-faint">{r.sub}</span> : null}</span>
            <span className="shrink-0 tabular-nums text-ink">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-canvas"><div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, (Math.max(0, r.value) / max) * 100)}%`, background: color, opacity: r.highlight ? 1 : 0.75 }} /></div>
        </li>
      ))}
    </ul>
  );
}
