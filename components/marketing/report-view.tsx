import { money } from "@/lib/format";
import type { ReportData, Totals } from "@/lib/marketing/report";

/** The monthly report as the client sees it (also shown to staff above the editing tools). */
const n0 = (n: number) => Math.round(n).toLocaleString("en-AU");
function delta(now: number, before: number, lowerIsBetter = false) {
  if (!before || !isFinite(before)) return null;
  const pct = ((now - before) / before) * 100;
  if (Math.abs(pct) < 0.5) return { text: "same", tone: "text-ink-faint" };
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  return { text: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%`, tone: good ? "text-emerald-700" : "text-rose-700" };
}

function Stat({ label, value, now, prev, lastYear, lowerIsBetter }: { label: string; value: string; now: number; prev?: number; lastYear?: number; lowerIsBetter?: boolean }) {
  const a = prev != null ? delta(now, prev, lowerIsBetter) : null;
  const b = lastYear != null ? delta(now, lastYear, lowerIsBetter) : null;
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[0.75rem] text-ink-muted">{label}</p>
      <p className="mt-0.5 text-[1.375rem] font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[0.7188rem]">
        {a && <span className={a.tone}>{a.text} <span className="text-ink-faint">on last month</span></span>}
        {b && <span className={b.tone}>{b.text} <span className="text-ink-faint">on last year</span></span>}
      </p>
    </div>
  );
}

const cpa = (t: Totals) => (t.conversions > 0 ? t.cost / t.conversions : 0);

function DailyChart({ daily, currency }: { daily: { day: string; cost: number; conversions: number }[]; currency: string }) {
  if (daily.length < 2) return null;
  const W = 640, H = 160, pad = 24;
  const maxC = Math.max(...daily.map((d) => d.cost), 1), maxV = Math.max(...daily.map((d) => d.conversions), 1);
  const bw = (W - pad * 2) / daily.length;
  const pts = daily.map((d, i) => `${pad + i * bw + bw / 2},${H - pad - (d.conversions / maxV) * (H - pad * 2)}`).join(" ");
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily ad spend (bars) and conversions (line)">
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="rgb(var(--line))" />
        {daily.map((d, i) => {
          const h = (d.cost / maxC) * (H - pad * 2);
          return <rect key={d.day} x={pad + i * bw + 1} y={H - pad - h} width={Math.max(1, bw - 2)} height={h} rx={2} className="fill-brand-200"><title>{`${d.day}: ${money(d.cost, currency)} spent, ${d.conversions} conversions`}</title></rect>;
        })}
        <polyline points={pts} fill="none" strokeWidth={2} className="stroke-brand-600" />
        <text x={pad} y={H - 6} fontSize={10} className="fill-ink-faint">{daily[0].day.slice(5)}</text>
        <text x={W - pad} y={H - 6} fontSize={10} textAnchor="end" className="fill-ink-faint">{daily[daily.length - 1].day.slice(5)}</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-[0.7188rem] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-200" />Spend per day (up to {money(maxC, currency, { cents: false })})</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-brand-600" />Conversions per day (up to {maxV})</span>
      </figcaption>
    </figure>
  );
}

export function ReportView({ d, commentary, agency }: { d: ReportData; commentary: string | null; agency: string }) {
  const cur = d.currency;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.8125rem] text-ink-muted">{agency} · Monthly report</p>
        <h1 className="mt-1 text-[1.5rem] font-semibold tracking-tight text-ink sm:text-[1.75rem]">{d.client} — {d.period.label}</h1>
      </header>

      {commentary && (
        <section className="rounded-xl border border-line bg-surface px-5 py-4">
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">How the month went</h2>
          <div className="whitespace-pre-line text-[0.875rem] leading-relaxed text-ink">{commentary}</div>
        </section>
      )}

      {d.ads && (
        <section>
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Google Ads</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Conversions" value={d.ads.now.conversions.toLocaleString("en-AU")} now={d.ads.now.conversions} prev={d.ads.prev.conversions} lastYear={d.ads.lastYear.conversions} />
            <Stat label="Cost per conversion" value={d.ads.now.conversions ? money(cpa(d.ads.now), cur) : "—"} now={cpa(d.ads.now)} prev={cpa(d.ads.prev) || undefined} lastYear={cpa(d.ads.lastYear) || undefined} lowerIsBetter />
            <Stat label="Spend" value={money(d.ads.now.cost, cur, { cents: false })} now={d.ads.now.cost} prev={d.ads.prev.cost} lastYear={d.ads.lastYear.cost} lowerIsBetter />
            <Stat label="Clicks" value={n0(d.ads.now.clicks)} now={d.ads.now.clicks} prev={d.ads.prev.clicks} lastYear={d.ads.lastYear.clicks} />
          </div>
          {d.ads.now.conv_value > 0 && <p className="mt-2 text-[0.8125rem] text-ink-muted">Conversion value {money(d.ads.now.conv_value, cur, { cents: false })} — {(d.ads.now.conv_value / Math.max(d.ads.now.cost, 0.01)).toFixed(1)}× what was spent.</p>}
          <DailyChart daily={d.ads.daily} currency={cur} />
          {d.ads.campaigns.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[520px] text-left text-[0.8125rem]">
                <thead><tr className="border-b border-line text-[0.75rem] text-ink-muted"><th className="px-4 py-2 font-medium">Campaign</th><th className="px-4 py-2 text-right font-medium">Spend</th><th className="px-4 py-2 text-right font-medium">Clicks</th><th className="px-4 py-2 text-right font-medium">Conversions</th><th className="px-4 py-2 text-right font-medium">Per conversion</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {d.ads.campaigns.map((c) => (
                    <tr key={c.name}><td className="px-4 py-2 text-ink">{c.name}</td><td className="px-4 py-2 text-right tabular-nums">{money(c.cost, cur)}</td><td className="px-4 py-2 text-right tabular-nums">{n0(c.clicks)}</td><td className="px-4 py-2 text-right tabular-nums">{c.conversions}</td><td className="px-4 py-2 text-right tabular-nums">{c.conversions ? money(c.cost / c.conversions, cur) : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {d.ga4 && (
        <section>
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Website visits (Google Analytics)</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="Visits" value={n0(d.ga4.now.sessions)} now={d.ga4.now.sessions} prev={d.ga4.prev.sessions} lastYear={d.ga4.lastYear.sessions} />
            <Stat label="Visitors (sum of daily)" value={n0(d.ga4.now.users)} now={d.ga4.now.users} prev={d.ga4.prev.users} lastYear={d.ga4.lastYear.users} />
            <Stat label="Key events (enquiries, sales…)" value={d.ga4.now.conversions.toLocaleString("en-AU")} now={d.ga4.now.conversions} prev={d.ga4.prev.conversions} lastYear={d.ga4.lastYear.conversions} />
          </div>
          {d.ga4.channels.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {d.ga4.channels.slice(0, 8).map((c) => (
                <li key={c.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[0.8125rem]">
                  <span className="min-w-0 flex-1 text-ink">{c.name}</span>
                  <span className="tabular-nums text-ink">{n0(c.sessions)} visits</span>
                  <span className="w-28 text-right tabular-nums text-ink-muted">{c.conversions} key events</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {d.gsc && (
        <section>
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Google search (unpaid)</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="Clicks from Google" value={n0(d.gsc.now.clicks)} now={d.gsc.now.clicks} prev={d.gsc.prev.clicks} lastYear={d.gsc.lastYear.clicks} />
            <Stat label="Times shown in results" value={n0(d.gsc.now.impressions)} now={d.gsc.now.impressions} prev={d.gsc.prev.impressions} lastYear={d.gsc.lastYear.impressions} />
            <Stat label="Average position" value={d.gsc.now.position != null ? d.gsc.now.position.toFixed(1) : "—"} now={d.gsc.now.position ?? 0} prev={d.gsc.prev.position ?? undefined} lastYear={d.gsc.lastYear.position ?? undefined} lowerIsBetter />
          </div>
          {d.gsc.queries.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[460px] text-left text-[0.8125rem]">
                <thead><tr className="border-b border-line text-[0.75rem] text-ink-muted"><th className="px-4 py-2 font-medium">What people searched</th><th className="px-4 py-2 text-right font-medium">Clicks</th><th className="px-4 py-2 text-right font-medium">Shown</th><th className="px-4 py-2 text-right font-medium">Position</th></tr></thead>
                <tbody className="divide-y divide-line">{d.gsc.queries.map((q) => <tr key={q.query}><td className="px-4 py-2 text-ink">{q.query}</td><td className="px-4 py-2 text-right tabular-nums">{n0(q.clicks)}</td><td className="px-4 py-2 text-right tabular-nums">{n0(q.impressions)}</td><td className="px-4 py-2 text-right tabular-nums">{q.position}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {d.changes.length > 0 && (
        <section>
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">What we changed in your Google Ads</h2>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {d.changes.map((c, i) => (
              <li key={i} className="px-4 py-2.5 text-[0.8125rem]">
                <p className="text-ink">{c.label}{c.status === "undone" ? " (later put back)" : ""}</p>
                <p className="text-[0.75rem] text-ink-muted">{new Date(c.at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} · {c.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!d.ads && !d.ga4 && !d.gsc && <p className="text-[0.875rem] text-ink-muted">No figures for this month yet.</p>}
    </div>
  );
}
