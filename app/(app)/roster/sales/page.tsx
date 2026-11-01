import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { money } from "@/lib/format";
import { readRosterSettings } from "@/lib/roster/settings";
import { wageHistory } from "@/lib/roster/wage-history";
import { WageGauge, wageColour } from "@/components/roster/wage-gauge";
import { RosterTabs } from "../tabs";
import { WageTargetForm } from "./ui";

export const metadata = { title: "Wages vs sales" };
export const dynamic = "force-dynamic";

const RANGES = [14, 28, 56, 91];

/** Wages as a % of sales: today, this week, the period — and every day, coloured green (good) to red (too high). */
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const days = RANGES.includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 28;
  const st = readRosterSettings(org.settings);
  const { createServiceClient } = await import("@/lib/integrations/runtime");
  const h = await wageHistory(createServiceClient(), org, days);
  const { good, bad } = st.wage_target;
  const sum = (list: typeof h.days) => { const w = list.reduce((t, d) => t + d.wages, 0), s = list.reduce((t, d) => t + (d.sales ?? 0), 0); return { w, s, pct: s > 0 && w > 0 ? Math.round((w / s) * 1000) / 10 : null }; };
  const today = h.days[h.days.length - 1], week = sum(h.days.slice(-7)), all = sum(h.days);
  const top = Math.max(1, ...h.days.map((d) => Math.max(d.wages, d.sales ?? 0)));
  return (
    <div>
      <PageHeader title="Roster" subtitle="Wages as a share of sales — from clocked timesheets (or the roster, for days not clocked yet) and your Square takings." />
      <RosterTabs active="sales" />
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-around gap-6 px-5 py-5">
            <WageGauge pct={today?.pct ?? null} good={good} bad={bad} label={`Today so far · ${money(today?.wages ?? 0, org.currency)} of ${money(today?.sales ?? 0, org.currency)}`} />
            <WageGauge pct={week.pct} good={good} bad={bad} label={`Last 7 days · ${money(week.w, org.currency)} of ${money(week.s, org.currency)}`} />
            <WageGauge pct={all.pct} good={good} bad={bad} label={`Last ${days} days · ${money(all.w, org.currency)} of ${money(all.s, org.currency)}`} />
          </div>
          {h.salesNote && <p className="border-t border-line px-5 py-2 text-[0.75rem] text-amber-800">{h.salesNote}</p>}
          <div className="border-t border-line px-5 py-3"><WageTargetForm good={good} bad={bad} /></div>
        </Card>
        <Card>
          <CardHeader title="Day by day" action={<span className="flex gap-1 text-[0.75rem]">{RANGES.map((n) => <a key={n} href={`/roster/sales?days=${n}`} className={n === days ? "rounded-md bg-ink px-2 py-1 text-surface" : "rounded-md px-2 py-1 text-ink-muted ring-1 ring-line"}>{n} days</a>)}</span>} />
          <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
            {[...h.days].reverse().map((d) => (
              <li key={d.date} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4rem] items-center gap-3 px-5 py-2 sm:grid-cols-[8rem_minmax(0,1fr)_9rem_4rem]">
                <span className="text-ink-muted">{new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="space-y-1">
                  <span className="block h-2 rounded-full bg-canvas ring-1 ring-line"><span className="block h-2 rounded-full bg-emerald-500/70" style={{ width: `${((d.sales ?? 0) / top) * 100}%` }} /></span>
                  <span className="block h-2 rounded-full bg-canvas ring-1 ring-line"><span className="block h-2 rounded-full" style={{ width: `${(d.wages / top) * 100}%`, background: wageColour(d.pct, good, bad) }} /></span>
                </span>
                <span className="hidden text-right text-[0.75rem] text-ink-muted sm:block">{money(d.wages, org.currency)} / {d.sales == null ? "—" : money(d.sales, org.currency)}{d.from === "roster" ? " · rostered" : ""}</span>
                <span className="text-right font-bold" style={{ color: wageColour(d.pct, good, bad) }}>{d.pct == null ? "—" : `${d.pct}%`}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-2 text-[0.7188rem] text-ink-faint">Top bar: sales. Bottom bar: wages, coloured by % of sales. Wages are award estimates before super; people not paid through the roster are left out.</p>
        </Card>
      </div>
    </div>
  );
}
