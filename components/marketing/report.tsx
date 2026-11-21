import { Card, CardHeader } from "@/components/ui/card";
import { Kpi } from "@/components/records/kpi";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Trend } from "./trend";
import type { MarketingReport } from "@/lib/marketing/core";

const pct = (f: number) => `${(f * 100).toFixed(f < 0.1 ? 1 : 0)}%`;
const whole = (n: number) => new Intl.NumberFormat("en-AU").format(Math.round(n));

/** Small +/- change chip vs the previous period (up is good for every metric here). */
function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-faint">— no prior data</span>;
  const up = value >= 0;
  return (
    <span className={cn("font-medium", up ? "text-emerald-600" : "text-rose-600")}>
      {up ? "▲" : "▼"} {Math.abs(value * 100).toFixed(0)}% vs prev.
    </span>
  );
}

export function MarketingReportView({ report, currency, days }: { report: MarketingReport; currency: string; days: number }) {
  const c = report.current;
  const ads = report.googleAds;
  return (
    <div className="space-y-5">
      {ads && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[0.8125rem] text-brand-800">
          <strong>Google Ads</strong> drove <strong>{whole(ads.sessions)}</strong> visits
          {ads.purchases > 0 && <> and <strong>{money(ads.revenue, currency, { cents: false })}</strong> in sales ({whole(ads.purchases)} order{ads.purchases === 1 ? "" : "s"})</>}
          {" "}over the last {days} days — {pct(ads.share)} of all traffic.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Revenue" value={money(c.revenue, currency, { cents: false })} sub={<Delta value={report.deltas.revenue} />} />
        <Kpi label="Orders" value={whole(c.purchases)} sub={<Delta value={report.deltas.purchases} />} />
        <Kpi label="Conversion rate" value={pct(c.convRate)} sub={<Delta value={report.deltas.convRate} />} />
        <Kpi label="Sessions" value={whole(c.sessions)} sub={<Delta value={report.deltas.sessions} />} />
        <Kpi label="Visitors" value={whole(c.users)} sub={<Delta value={report.deltas.users} />} />
        <Kpi label="Avg. order" value={money(c.aov, currency, { cents: false })} sub={<Delta value={report.deltas.aov} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <Trend points={report.daily.map((d) => ({ day: d.day, value: d.revenue }))} title="Revenue" color="text-emerald-500" format={(n) => money(n, currency, { cents: false })} />
        </Card>
        <Card className="p-4">
          <Trend points={report.daily.map((d) => ({ day: d.day, value: d.sessions }))} title="Sessions" color="text-brand-500" format={whole} />
        </Card>
      </div>

      <Card>
        <CardHeader title="Where the traffic & sales come from" subtitle={`By channel, last ${days} days`} />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[520px] text-[0.8125rem]">
            <thead>
              <tr className="text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 text-right font-medium">Sessions</th>
                <th className="px-3 py-2 font-medium">Share</th>
                <th className="px-3 py-2 text-right font-medium">Orders</th>
                <th className="px-5 py-2 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.channels.map((ch) => {
                const isAds = ["Paid Search", "Paid Shopping", "Paid Social", "Display", "Paid Video", "Cross-network"].includes(ch.channel);
                return (
                  <tr key={ch.channel} className={cn(isAds && "bg-brand-50/60")}>
                    <td className="px-5 py-2.5 text-ink">
                      <span className={cn("inline-block h-2 w-2 rounded-full align-middle", isAds ? "bg-brand-500" : "bg-zinc-300")} /> <span className="align-middle">{ch.channel}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-ink">{whole(ch.sessions)}</td>
                    <td className="px-3 py-2.5">
                      <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-canvas">
                        <div className={cn("h-full rounded-full", isAds ? "bg-brand-500" : "bg-zinc-400")} style={{ width: `${Math.max(2, ch.share * 100).toFixed(0)}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-ink">{whole(ch.purchases)}</td>
                    <td className="px-5 py-2.5 text-right tabular text-ink">{money(ch.revenue, currency, { cents: false })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
