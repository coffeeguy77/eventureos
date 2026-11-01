/**
 * Wages as a % of sales on a dial: green up to your target, through amber, to red at your limit and beyond.
 * Pure SVG (server or client). pct null = no sales yet.
 */
export function wageColour(pct: number | null, good: number, bad: number): string {
  if (pct == null) return "rgb(var(--ink-faint, 161 161 170))";
  if (pct <= good) return "#16a34a";
  if (pct >= bad) return "#dc2626";
  const t = (pct - good) / (bad - good); // green → amber → red
  const mix = (a: number[], b: number[], k: number) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
  const c = t < 0.5 ? mix([22, 163, 74], [245, 158, 11], t * 2) : mix([245, 158, 11], [220, 38, 38], (t - 0.5) * 2);
  return `rgb(${c.join(",")})`;
}

export function WageGauge({ pct, good, bad, label, size = 180 }: { pct: number | null; good: number; bad: number; label: string; size?: number }) {
  const max = Math.max(bad + 20, 60);
  const r = 70, cx = 90, cy = 86;
  const angle = (v: number) => Math.PI * (1 - Math.min(Math.max(v, 0), max) / max);
  const pt = (v: number, rr = r) => [cx + rr * Math.cos(angle(v)), cy - rr * Math.sin(angle(v))];
  const arc = (a: number, b: number) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`; };
  const id = `g${Math.round(good)}-${Math.round(bad)}`;
  const [nx, ny] = pt(pct ?? 0, r - 14);
  return (
    <figure className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 180 100" width={size} height={size * 0.56} role="img" aria-label={`${label}: ${pct == null ? "no sales yet" : `${pct}% of sales`}`}>
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#16a34a" /><stop offset={`${(good / max) * 100}%`} stopColor="#16a34a" />
            <stop offset={`${(((good + bad) / 2) / max) * 100}%`} stopColor="#f59e0b" />
            <stop offset={`${(bad / max) * 100}%`} stopColor="#dc2626" /><stop offset="1" stopColor="#991b1b" />
          </linearGradient>
        </defs>
        <path d={arc(0, max)} fill="none" stroke={`url(#${id})`} strokeWidth="14" strokeLinecap="round" />
        {pct != null && <><line x1={cx} y1={cy} x2={nx} y2={ny} stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-ink" /><circle cx={cx} cy={cy} r="5" className="fill-ink" /></>}
      </svg>
      <figcaption className="-mt-1 text-center">
        <span className="block text-[1.375rem] font-bold leading-tight" style={{ color: wageColour(pct, good, bad) }}>{pct == null ? "—" : `${pct}%`}</span>
        <span className="block text-[0.75rem] text-ink-muted">{label}</span>
      </figcaption>
    </figure>
  );
}
