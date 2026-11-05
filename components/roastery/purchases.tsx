"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { importGreenNow, saveGreenSenders } from "@/app/(app)/roastery/purchase-actions";

/* ---------------- import from Gmail ---------------- */
export function ImportPanel({ found, done, lastRun, ready }: { found: number; done: boolean; lastRun: string | null; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null); stop.current = false;
    // keeps going (a few minutes per round) while this page is open, until every invoice has been read
    for (let round = 1; round <= 30 && !stop.current; round++) {
      const r = await importGreenNow().catch(() => ({ ok: false as const, error: "Lost the connection — press Read again to carry on." }));
      if (!r.ok) { setErr(r.error); break; }
      const d = r.data;
      setLog((l) => [`Round ${round}: ${d.imported} invoice${d.imported === 1 ? "" : "s"} added${d.duplicates ? `, ${d.duplicates} already in` : ""}${d.skipped ? `, ${d.skipped} not invoices` : ""}${d.failed ? `, ${d.failed} couldn't be read` : ""} · ${d.found} emails found`, ...d.problems.map((p) => `  ↳ ${p}`), ...l].slice(0, 40));
      router.refresh();
      if (!d.more) { setLog((l) => ["Done — every invoice email has been read.", ...l]); break; }
    }
    setBusy(false);
  };
  return (
    <div className="space-y-3">
      <p className="text-[0.8125rem] text-ink-muted">
        {!ready ? "Run the database update 0100_green_purchases.sql first."
          : done ? `All invoice emails read${lastRun ? ` · last checked ${new Date(lastRun).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}` : ""}. New invoices are picked up every hour.`
          : found ? "Still working through the email history — it carries on by itself every 10 minutes, or press Read now to speed it up (keep this page open)."
          : "Reads every green coffee invoice in your Gmail from the importers below, back to the first one, with Claude. It takes a while the first time (about 15 seconds an invoice, several at once)."}
      </p>
      <div className="flex flex-wrap gap-2">
        {!busy ? <Button variant="primary" disabled={!ready} onClick={run}><Download className="h-4 w-4" />Read invoices now</Button>
          : <><Button disabled><Loader2 className="h-4 w-4 animate-spin" />Reading invoices…</Button><Button variant="ghost" onClick={() => { stop.current = true; }}><Square className="h-4 w-4" />Stop after this round</Button></>}
      </div>
      {err && <p className="text-[0.8125rem] text-rose-700">{err}</p>}
      {log.length > 0 && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line">{log.join("\n")}</pre>}
    </div>
  );
}

export function SendersEditor({ senders }: { senders: string[] }) {
  const router = useRouter();
  const [list, setList] = useState(senders);
  const [add, setAdd] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = list.join(",") !== senders.join(",");
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {list.map((s) => (
          <li key={s} className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-[0.75rem] text-ink ring-1 ring-inset ring-line">
            {s.includes("@") ? s : `anyone @${s}`}
            <button type="button" onClick={() => setList(list.filter((x) => x !== s))} className="-mr-1 grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-zinc-100 hover:text-rose-700" aria-label={`Remove ${s}`}>×</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="orders@importer.com.au or importer.com.au" aria-label="Add a sender" className="min-w-0 flex-1 basis-56"
          onKeyDown={(e) => { if (e.key === "Enter" && add.trim()) { e.preventDefault(); setList([...new Set([...list, add.trim().toLowerCase().replace(/^@/, "")])]); setAdd(""); } }} />
        <Button size="sm" disabled={!add.trim()} onClick={() => { setList([...new Set([...list, add.trim().toLowerCase().replace(/^@/, "")])]); setAdd(""); }}>Add</Button>
        <Button size="sm" variant="primary" disabled={!dirty || pending} onClick={() => start(async () => { const r = await saveGreenSenders(list); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); })}>Save</Button>
      </div>
      {msg && <p className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </div>
  );
}

/* ---------------- price per kilo by year ---------------- */
export interface PriceSeries { name: string; points: { year: number; perKg: number; kg: number }[] }

/** Kilo-weighted average $/kg per year, one line per origin (validated categorical slots, light and dark steps). */
export function PriceChart({ series, currency = "AUD" }: { series: PriceSeries[]; currency?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const years = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.year)))].sort((a, b) => a - b), [series]);
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.perKg)));
  const top = Math.ceil(max / 5) * 5;
  const W = 720, H = 300, L = 44, R = 96, T = 16, B = 28;
  if (years.length < 2) return <p className="px-5 py-6 text-[0.8125rem] text-ink-muted">The graph appears once there are purchases in at least two different years.</p>;
  const x = (y: number) => L + ((y - years[0]) / (years[years.length - 1] - years[0])) * (W - L - R);
  const yv = (v: number) => T + (1 - v / top) * (H - T - B);
  const fmt = (v: number) => v.toLocaleString("en-AU", { style: "currency", currency, maximumFractionDigits: 2 });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f * 100) / 100);
  const hy = hover != null ? years[hover] : null;
  // direct labels at each line's last point, nudged apart so they don't overlap
  const ends = series.map((s, i) => ({ i, name: s.name, p: s.points[s.points.length - 1] })).filter((e) => e.p).map((e) => ({ ...e, y: yv(e.p.perKg) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;

  return (
    <div className="gp-chart relative px-3 pb-3 sm:px-5">
      <style>{`
        .gp-chart{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4}
        html[data-scheme="dark"] .gp-chart,html[data-scheme="dim"] .gp-chart,html[data-scheme="midnight"] .gp-chart{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181}
        @media (prefers-color-scheme: dark){html[data-scheme="system"] .gp-chart{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181}}
      `}</style>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted" aria-label="Legend">
        {series.map((s, i) => <li key={s.name} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: `var(--s${i + 1})` }} />{s.name}</li>)}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Average price per kilo of green coffee by year, by origin"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0; years.forEach((yy, k) => { if (Math.abs(x(yy) - px) < Math.abs(x(years[best]) - px)) best = k; });
          setHover(best);
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={yv(t)} y2={yv(t)} stroke="rgb(var(--line))" strokeWidth={1} />
            <text x={L - 6} y={yv(t) + 4} textAnchor="end" fontSize={11} fill="rgb(var(--ink-faint))">{t === 0 ? "$0" : `$${t}`}</text>
          </g>
        ))}
        {years.map((yy, k) => (k === 0 || k === years.length - 1 || years.length <= 8 || k % 2 === 0) && <text key={yy} x={x(yy)} y={H - 8} textAnchor="middle" fontSize={11} fill="rgb(var(--ink-faint))">{yy}</text>)}
        {hy != null && <line x1={x(hy)} x2={x(hy)} y1={T} y2={H - B} stroke="rgb(var(--line-strong))" strokeWidth={1} />}
        {series.map((s, i) => (
          <g key={s.name}>
            <polyline fill="none" stroke={`var(--s${i + 1})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s.points.map((p) => `${x(p.year)},${yv(p.perKg)}`).join(" ")} />
            {s.points.map((p) => <circle key={p.year} cx={x(p.year)} cy={yv(p.perKg)} r={hy === p.year ? 5 : 3} fill={`var(--s${i + 1})`} stroke="rgb(var(--surface))" strokeWidth={2} />)}
          </g>
        ))}
        {ends.map((e) => <text key={e.name} x={W - R + 8} y={e.y + 4} fontSize={11} fill="rgb(var(--ink-muted))">{e.name}</text>)}
      </svg>
      {hy != null && (
        <div className="pointer-events-none absolute right-4 top-8 rounded-lg bg-surface px-3 py-2 text-[0.75rem] shadow-pop ring-1 ring-line">
          <p className="mb-1 font-semibold text-ink">{hy}</p>
          {series.map((s, i) => { const p = s.points.find((q) => q.year === hy); return p ? <p key={s.name} className="flex items-center gap-1.5 text-ink-muted"><span className="h-2 w-2 rounded-full" style={{ background: `var(--s${i + 1})` }} />{s.name}: <span className="font-medium text-ink">{fmt(p.perKg)}/kg</span> · {p.kg.toLocaleString("en-AU")} kg</p> : null; })}
        </div>
      )}
    </div>
  );
}
