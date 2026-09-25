"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** Nice round axis maximum and tick step for a value range starting at zero. */
function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: 1, step: 0.25 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { top: step * Math.ceil(max / step), step };
}

const compact = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency, notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: n >= 10000 ? 1 : 0 }).format(n);
const full = (n: number, currency: string) => new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

/**
 * Grouped column chart (one shared $ axis — never dual-axis). Each group is one hit target with a tooltip
 * listing every series; keyboard focus shows the same tooltip.
 */
export function ColumnChart({ groups, series, currency, height = 190 }: {
  groups: { key: string; label: string; values: number[] }[];
  series: { label: string; color: string }[];
  currency: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...groups.flatMap((g) => g.values));
  const { top, step } = niceScale(max);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const barW = groups.length > 8 ? 10 : groups.length > 4 ? 16 : 24;
  // Label every month when few; thin them when many so they never collide.
  const every = groups.length > 8 ? 2 : 1;

  if (max === 0) return <p className="py-10 text-center text-[12.5px] text-ink-muted">Nothing recorded in this period.</p>;

  return (
    <div className="flex gap-2">
      <div className="relative shrink-0 text-right" style={{ height, width: 44 }} aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="tabular absolute right-0 text-[10.5px] text-ink-faint" style={{ bottom: `${(t / top) * 100}%`, transform: "translateY(50%)" }}>
            {compact(t, currency)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-line-strong" : "bg-line")} style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex items-stretch">
            {groups.map((g, gi) => (
              <div
                key={g.key}
                tabIndex={0}
                role="img"
                aria-label={`${g.label}: ${series.map((s, si) => `${s.label} ${full(g.values[si] ?? 0, currency)}`).join(", ")}`}
                onPointerEnter={() => setActive(gi)}
                onPointerLeave={() => setActive((a) => (a === gi ? null : a))}
                onFocus={() => setActive(gi)}
                onBlur={() => setActive((a) => (a === gi ? null : a))}
                className={cn("relative flex min-w-0 flex-1 items-end justify-center gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-300", active === gi && "bg-zinc-100/70")}
              >
                {series.map((s, si) => {
                  const v = g.values[si] ?? 0;
                  return (
                    <span key={s.label} className="block rounded-t-[4px]"
                      style={{ width: `min(${barW}px, 44%)`, height: v > 0 ? `max(2px, ${(v / top) * 100}%)` : 0, background: s.color, opacity: active != null && active !== gi ? 0.55 : 1 }} />
                  );
                })}
                {active === gi && (
                  <div role="tooltip" className={cn("pointer-events-none absolute bottom-full z-10 mb-2 w-max min-w-[150px] rounded-lg border border-line bg-white px-3 py-2 shadow-pop",
                    gi < groups.length / 2 ? "left-0" : "right-0")}>
                    <p className="mb-1 text-[11.5px] font-medium text-ink-muted">{g.label}</p>
                    {series.map((s, si) => (
                      <p key={s.label} className="flex items-center gap-2 text-[12px]">
                        <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />
                        <span className="tabular font-semibold text-ink">{full(g.values[si] ?? 0, currency)}</span>
                        <span className="text-ink-muted">{s.label}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex" aria-hidden>
          {groups.map((g, gi) => (
            <span key={g.key} className="flex-1 truncate text-center text-[10.5px] text-ink-faint">{gi % every === 0 || gi === groups.length - 1 ? g.label : ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
