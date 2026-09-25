/**
 * Report chart primitives — plain HTML/CSS, no chart library.
 * Palette (validated with the dataviz validator against white): series 1 = brand violet #6D4AFF,
 * series 2 = orange #eb6834 (adjacent CVD ΔE 32, all ≥ 3:1). Ordinal ramp for ordered stages:
 * #9173FF → #5A35F0 → #2F1C80 (monotone lightness, light end 3.4:1).
 * Marks: bars ≤ 24px thick, 4px rounded data-end, square at the baseline; hairline solid grid.
 * Every chart has a table twin via <ChartFrame table>. Values are direct-labelled; text never wears the series colour.
 */
import { cn } from "@/lib/cn";

export const SERIES = ["#6D4AFF", "#eb6834"] as const;
export const ORDINAL = ["#9173FF", "#5A35F0", "#2F1C80"] as const;
export const STATUS = { neutral: "#A1A1AA", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" } as const;

/** A report card: title, optional caption, the chart, and a "View as table" disclosure. */
export function ChartFrame({ title, subtitle, children, table, action, className }: {
  title: string; subtitle?: React.ReactNode; children: React.ReactNode; table?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <figure className={cn("min-w-0 rounded-xl border border-line bg-white shadow-card", className)}>
      <figcaption className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-muted">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </figcaption>
      <div className="px-5 pb-4">{children}</div>
      {table && (
        <details className="group border-t border-line">
          <summary className="cursor-pointer list-none px-5 py-2.5 text-[12px] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">View as table</span><span className="hidden group-open:inline">Hide table</span>
          </summary>
          <div className="overflow-x-auto px-5 pb-4">{table}</div>
        </details>
      )}
    </figure>
  );
}

export function DataTable({ head, rows, align }: { head: string[]; rows: React.ReactNode[][]; align?: ("left" | "right")[] }) {
  return (
    <table className="w-full min-w-[360px] text-left text-[12.5px]">
      <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
        {head.map((h, i) => <th key={h} scope="col" className={cn("py-2 pr-3 font-medium", align?.[i] === "right" && "text-right")}>{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, ri) => (
          <tr key={ri}>{r.map((c, ci) => <td key={ci} className={cn("py-1.5 pr-3 text-ink", align?.[ci] === "right" && "tabular text-right")}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Horizontal bars, one series. Value label sits past the bar end; an optional note column carries a secondary figure. */
export function BarList({ rows, format = (n) => String(n), color = SERIES[0], empty = "No data in this period." }: {
  rows: { label: string; value: number; note?: React.ReactNode; color?: string; href?: string }[];
  format?: (n: number) => string; color?: string; empty?: string;
}) {
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return <p className="py-6 text-center text-[12.5px] text-ink-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(84px,30%)_1fr_auto] items-center gap-3" title={`${r.label}: ${format(r.value)}`}>
          <span className="truncate text-[12.5px] text-ink-muted">{r.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="block h-[14px] min-w-[2px] rounded-r-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }} />
            <span className="tabular shrink-0 text-[12.5px] font-medium text-ink">{format(r.value)}</span>
          </span>
          <span className="tabular min-w-[64px] text-right text-[12px] text-ink-faint">{r.note}</span>
        </li>
      ))}
    </ul>
  );
}

/** Conversion funnel: ordered stages on the ordinal ramp, each with its share of the first stage and step conversion. */
export function Funnel({ stages }: { stages: { label: string; value: number; hint?: string }[] }) {
  const top = stages[0]?.value ?? 0;
  if (top === 0) return <p className="py-6 text-center text-[12.5px] text-ink-muted">No enquiries in this period.</p>;
  return (
    <ol className="space-y-3">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const step = prev ? Math.round((s.value / prev) * 100) : null;
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="text-ink">{s.label}{s.hint && <span className="ml-1.5 text-ink-faint">{s.hint}</span>}</span>
              <span className="tabular shrink-0 text-ink-muted">
                <span className="font-semibold text-ink">{s.value}</span>
                {step != null && <span> · {step}% of previous</span>}
              </span>
            </div>
            <div className="h-[18px] rounded-[4px] bg-zinc-100">
              <div className="h-full min-w-[2px] rounded-[4px]" style={{ width: `${(s.value / top) * 100}%`, background: ORDINAL[Math.min(i, ORDINAL.length - 1)] }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Legend key for bars (rect swatch) — text stays in ink tokens. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: i.color }} />{i.label}</li>
      ))}
    </ul>
  );
}

export function Stat({ label, value, sub, alert }: { label: string; value: React.ReactNode; sub?: React.ReactNode; alert?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-zinc-50/80 px-3.5 py-3 ring-1 ring-inset ring-line">
      <div className="text-[11.5px] font-medium text-ink-muted">{label}</div>
      <div className={cn("mt-1 text-[20px] font-semibold tracking-tight", alert ? "text-rose-700" : "text-ink")}>{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-faint">{sub}</div>}
    </div>
  );
}
