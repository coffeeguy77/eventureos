import { cn } from "@/lib/cn";

/**
 * A small area chart drawn as inline SVG — no chart library (the house rule is no new npm dependencies).
 * Colours come from the theme (currentColor), so it reads correctly in dark mode.
 */
export function Trend({ points, title, color = "text-brand-500", format }: {
  points: { day: string; value: number }[];
  title: string;
  color?: string;
  format: (n: number) => string;
}) {
  const W = 720, H = 170, padX = 6, padTop = 10, padBottom = 20;
  const vals = points.map((p) => p.value);
  const max = Math.max(1, ...vals);
  const n = points.length;
  const x = (i: number) => (n <= 1 ? padX : padX + (i * (W - padX * 2)) / (n - 1));
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = n ? `${line} L${x(n - 1).toFixed(1)},${(H - padBottom).toFixed(1)} L${x(0).toFixed(1)},${(H - padBottom).toFixed(1)} Z` : "";
  const total = vals.reduce((a, b) => a + b, 0);
  const gid = `g-${title.replace(/\W+/g, "")}`;
  const first = points[0]?.day, last = points[n - 1]?.day;
  const dayLabel = (d: string) => (d && d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[0.75rem] font-medium text-ink-muted">{title}</span>
        <span className="text-[0.75rem] tabular text-ink-faint">{format(total)} total</span>
      </div>
      {n === 0 ? (
        <div className="mt-2 flex h-[120px] items-center justify-center rounded-lg bg-canvas text-[0.75rem] text-ink-faint">No data in this period</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className={cn("mt-2 h-auto w-full", color)} preserveAspectRatio="none" role="img" aria-label={title}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom} className="text-line" stroke="currentColor" strokeWidth="1" />
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <text x={padX} y={H - 6} className="fill-ink-faint" style={{ fontSize: 11 }}>{dayLabel(first ?? "")}</text>
          <text x={W - padX} y={H - 6} textAnchor="end" className="fill-ink-faint" style={{ fontSize: 11 }}>{dayLabel(last ?? "")}</text>
        </svg>
      )}
    </div>
  );
}
