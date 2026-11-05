"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { mmss, rorOf, type Curve } from "@/lib/roastery/core";

export interface ChartRoast { label: string; curve: Curve; fc: number | null; end: number | null }

const W = 1000, H = 560, L = 46, R = 46, T = 16, GAP = 26, STRIP = 90, B = 28;
const PLOT_H = H - T - B - STRIP - GAP;

/**
 * A roast graph: bean temp, air temp and rate of rise, with the burner underneath (solid = what it did,
 * dashed = what it was set to). A second roast, if given, is drawn dashed on top to compare.
 */
export function RoastChart({ main, compare }: { main: ChartRoast; compare?: ChartRoast | null }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const series = (c: ChartRoast) => ({ ...c, ror: rorOf(c.curve), len: c.curve.bt.length * c.curve.step });
  const a = useMemo(() => series(main), [main]);
  const b = useMemo(() => (compare ? series(compare) : null), [compare]);
  const tMax = Math.ceil(Math.max(a.end ?? a.len, b ? b.end ?? b.len : 0, 60) / 60) * 60 + 30;
  const allT = [...a.curve.bt, ...a.curve.et, ...(b ? [...b.curve.bt, ...b.curve.et] : [])].filter((x): x is number => x != null);
  const yMax = Math.min(400, Math.max(250, Math.ceil(Math.max(...allT) / 50) * 50));
  const x = (s: number) => L + (s / tMax) * (W - L - R);
  const y = (v: number) => T + PLOT_H - (v / yMax) * PLOT_H;
  const yr = (v: number) => T + PLOT_H - (Math.max(0, Math.min(25, v)) / 25) * PLOT_H;
  const sTop = T + PLOT_H + GAP, yb = (v: number) => sTop + STRIP - (Math.max(0, Math.min(100, v)) / 100) * STRIP;
  const path = (arr: (number | null)[] | undefined, step: number, fy: (v: number) => number, from = 0) => {
    if (!arr) return "";
    let d = "", on = false;
    arr.forEach((v, i) => { const s = i * step; if (v == null || s < from || s > tMax) { on = false; return; } d += `${on ? "L" : "M"}${x(s).toFixed(1)},${fy(v).toFixed(1)}`; on = true; });
    return d;
  };
  const rorFrom = (c: typeof a) => { // RoR from 45 s after the turning point (lowest bean temp in the first 4 minutes), as in the advisor
    let best = 0, min = Infinity; c.curve.bt.forEach((v, i) => { if (v != null && i * c.curve.step < 240 && v < min) { min = v; best = i * c.curve.step; } });
    return best + 45;
  };
  const tickStep = tMax > 1200 ? 180 : 120;
  const at = (c: typeof a | null, s: number) => { if (!c) return null; const i = Math.round(s / c.curve.step); return i < c.curve.bt.length ? { bt: c.curve.bt[i], et: c.curve.et[i], ror: c.ror[i], burner: c.curve.burner?.[i], sp: c.curve.burner_sp?.[i], air: c.curve.air_sp?.[i] } : null; };
  const move = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const s = ((px - L) / (W - L - R)) * tMax;
    setHover(s >= 0 && s <= tMax ? Math.round(s / 2) * 2 : null);
  };
  const ha = hover != null ? at(a, hover) : null, hb = hover != null ? at(b, hover) : null;
  const lines = (c: typeof a, dash: boolean) => {
    const da = dash ? "6 5" : undefined, op = dash ? 0.75 : 1;
    return (
      <g opacity={op}>
        <path d={path(c.curve.et, c.curve.step, y)} className="text-sky-500" stroke="currentColor" strokeWidth={dash ? 1.6 : 2} fill="none" strokeDasharray={da} />
        <path d={path(c.curve.bt, c.curve.step, y)} className="text-rose-500" stroke="currentColor" strokeWidth={dash ? 2 : 2.6} fill="none" strokeDasharray={da} />
        <path d={path(c.ror, c.curve.step, yr, rorFrom(c))} className="text-amber-500" stroke="currentColor" strokeWidth={dash ? 1.6 : 2} fill="none" strokeDasharray={da} />
        <path d={path(c.curve.burner, c.curve.step, yb)} className="text-emerald-500" stroke="currentColor" strokeWidth={dash ? 1.4 : 2} fill="none" strokeDasharray={da} />
        {!dash && <path d={path(c.curve.burner_sp, c.curve.step, yb)} className="text-emerald-500" stroke="currentColor" strokeWidth={1.2} fill="none" strokeDasharray="2 4" opacity={0.8} />}
        {c.fc != null && <g className="text-ink-muted"><line x1={x(c.fc)} x2={x(c.fc)} y1={T} y2={T + PLOT_H} stroke="currentColor" strokeDasharray={dash ? "2 5" : "4 4"} /><text x={x(c.fc) + 4} y={T + (dash ? 26 : 12)} fontSize="11" fill="currentColor">{dash ? "FC (compare)" : `FC ${mmss(c.fc)}`}</text></g>}
        {c.end != null && <g className="text-ink-muted"><line x1={x(c.end)} x2={x(c.end)} y1={T} y2={T + PLOT_H} stroke="currentColor" strokeDasharray={dash ? "2 5" : "4 4"} /><text x={x(c.end) + 4} y={T + (dash ? 52 : 38)} fontSize="11" fill="currentColor">{dash ? "drop (compare)" : `drop ${mmss(c.end)}`}</text></g>}
      </g>
    );
  };
  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1"><svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[640px] touch-pan-x select-none" onPointerMove={move} onPointerLeave={() => setHover(null)} role="img" aria-label={`Roast graph: ${main.label}`}>
        <g className="text-line" stroke="currentColor">
          {Array.from({ length: yMax / 50 + 1 }, (_, k) => k * 50).map((v) => <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />)}
          <rect x={L} y={sTop} width={W - L - R} height={STRIP} fill="none" />
        </g>
        <g className="text-ink-faint" fill="currentColor" fontSize="11">
          {Array.from({ length: yMax / 50 + 1 }, (_, k) => k * 50).map((v) => <text key={v} x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text>)}
          {[0, 5, 10, 15, 20, 25].map((v) => <text key={v} x={W - R + 6} y={yr(v) + 4}>{v}</text>)}
          <text x={L - 6} y={T - 4} textAnchor="end">°C</text><text x={W - R + 6} y={T - 4}>RoR</text>
          {[0, 50, 100].map((v) => <text key={v} x={W - R + 6} y={yb(v) + 4}>{v}%</text>)}
          <text x={L + 6} y={sTop + 13}>burner</text>
          {Array.from({ length: Math.floor(tMax / tickStep) + 1 }, (_, k) => k * tickStep).map((s) => <text key={s} x={x(s)} y={H - 8} textAnchor="middle">{mmss(s)}</text>)}
        </g>
        {b && lines(b, true)}
        {lines(a, false)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={sTop + STRIP} className="text-ink-muted" stroke="currentColor" strokeWidth={1} />}
      </svg></div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted">
        <Key c="bg-rose-500">Bean temp</Key><Key c="bg-sky-500">Air temp</Key><Key c="bg-amber-500">RoR °C/min (right)</Key><Key c="bg-emerald-500">Burner (dotted: setting)</Key>
        {b && <span>Dashed: {b.label}</span>}
      </div>
      <div className="mt-2 min-h-[2.5rem] rounded-lg bg-canvas px-3 py-2 text-[0.7812rem] text-ink ring-1 ring-line tabular">
        {hover == null ? <span className="text-ink-muted">Move over the graph to read the values at any moment.</span> : (
          <div className="grid gap-1 sm:grid-cols-2">
            <Read t={hover} label={main.label} v={ha} />
            {b && <Read t={hover} label={b.label} v={hb} dashed />}
          </div>
        )}
      </div>
    </div>
  );
}

function Key({ c, children }: { c: string; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("inline-block h-[3px] w-4 rounded", c)} />{children}</span>;
}
function Read({ t, label, v, dashed }: { t: number; label: string; v: { bt: number | null; et: number | null; ror: number | null; burner?: number | null; sp?: number | null; air?: number | null } | null; dashed?: boolean }) {
  const f = (n: number | null | undefined, u = "") => (n == null ? "–" : `${n}${u}`);
  return <div><span className={cn("font-medium", dashed && "text-ink-muted")}>{mmss(t)} · {label}:</span> {v ? <>bean {f(v.bt, "°")} · air {f(v.et, "°")} · RoR {f(v.ror)} · burner {f(v.burner, "%")}{v.sp != null ? ` (set ${v.sp}%)` : ""}{v.air != null ? ` · air set ${v.air}°` : ""}</> : "ended"}</div>;
}
