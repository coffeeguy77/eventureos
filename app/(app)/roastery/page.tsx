import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDateTime, money } from "@/lib/format";
import { loadRoastery } from "@/lib/roastery/load";
import { expectedRoasted, mmss } from "@/lib/roastery/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CoffeeForm, StockForm, type CoffeeOpt } from "@/components/roastery/forms";

export const dynamic = "force-dynamic";

/** Roastery home: green coffee on hand and its value, weight loss per coffee, and how each coffee is roasting. */
export default async function RoasteryPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { supabase, org } = await requireOrg();
  const showAll = (await searchParams).all === "1";
  const { coffees, roasts, loss } = await loadRoastery(supabase, org.id);
  const list = coffees.filter((c) => showAll || !c.archived);
  const opts: CoffeeOpt[] = coffees.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, batch_kg: c.batch_kg, lossPct: c.loss?.pct ?? null, lossOwn: !!c.loss?.own }));
  const onHand = list.reduce((a, c) => a + Math.max(0, c.onHand), 0);
  const value = list.reduce((a, c) => a + (c.value ?? 0), 0);
  const unvalued = list.filter((c) => c.onHand > 0 && c.value == null).length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const thisMonth = roasts.filter((r) => new Date(r.roasted_at) >= monthStart);
  const low = list.filter((c) => c.low && !c.archived);
  const roastedFromStock = list.reduce((a, c) => a + (c.loss && c.onHand > 0 ? expectedRoasted(c.onHand, c.loss.pct) : 0), 0);

  return (
    <div>
      <PageHeader title="Roastery" subtitle="Green coffee on hand, what it's worth, and how much roasted coffee it makes."
        actions={<><ButtonLink href="/roastery/planner">Green planner</ButtonLink><ButtonLink href="/roastery/roasts" variant="primary">Log a roast</ButtonLink></>} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Green on hand" value={`${onHand.toFixed(1)} kg`} sub={roastedFromStock ? `≈ ${roastedFromStock.toFixed(0)} kg roasted` : undefined} />
        <Kpi label="Green stock value" value={money(value)} sub={unvalued ? `${unvalued} coffee${unvalued > 1 ? "s" : ""} with no cost yet` : "at average cost, ex GST"} />
        <Kpi label="Average weight loss" value={loss.all ? `${loss.all.lossPct.toFixed(1)} %` : "–"} sub={loss.all ? `yield ${(100 - loss.all.lossPct).toFixed(1)} % · ${loss.all.n} weighed batch${loss.all.n > 1 ? "es" : ""}` : "weigh a batch after roasting"} />
        <Kpi label="Roasted this month" value={`${thisMonth.reduce((a, r) => a + r.green_kg, 0).toFixed(0)} kg green`} sub={`${thisMonth.length} roast${thisMonth.length === 1 ? "" : "s"}`} />
      </div>

      {low.length > 0 && <div className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900 ring-1 ring-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Time to reorder: {low.map((c) => `${c.name} (${c.onHand.toFixed(1)} kg left)`).join(", ")}.</span></div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card className="overflow-x-auto">
            {list.length === 0 ? <EmptyState title="No green coffees yet">Add each green coffee you buy, then record what comes in and what you roast.</EmptyState> : (
              <table className="w-full min-w-[760px] text-left text-[0.8438rem]">
                <thead className="border-b border-line bg-canvas text-[0.75rem] text-ink-muted">
                  <tr><th className="px-4 py-2">Coffee</th><th className="px-4 py-2 text-right">On hand</th><th className="px-4 py-2 text-right">Value</th><th className="px-4 py-2 text-right">Cost / kg</th><th className="px-4 py-2 text-right">Weight loss</th><th className="px-4 py-2 text-right">Makes ≈</th><th className="px-4 py-2">Last roast</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map((c) => (
                    <tr key={c.id} className="hover:bg-canvas">
                      <td className="px-4 py-2.5"><Link href={`/roastery/coffees/${c.id}`} className="font-medium text-ink hover:underline">{c.name}</Link>
                        <div className="text-[0.75rem] text-ink-muted">{[c.origin, c.supplier].filter(Boolean).join(" · ") || `${c.batch_kg} kg batches`}</div>
                        {c.archived && <Badge>not stocked</Badge>}{c.low && <Badge tone="amber">reorder</Badge>}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-ink tabular">{c.onHand.toFixed(1)} kg</td>
                      <td className="px-4 py-2.5 text-right tabular">{c.value != null ? money(c.value) : <span className="text-ink-faint">no cost</span>}</td>
                      <td className="px-4 py-2.5 text-right tabular">{c.avgCost != null ? money(c.avgCost, "AUD", { cents: true }) : "–"}</td>
                      <td className="px-4 py-2.5 text-right tabular">{c.loss ? <>{c.loss.pct.toFixed(1)} %<div className="text-[0.7188rem] text-ink-muted">{c.loss.own ? `${c.loss.n} weighed` : "all-coffee avg"}</div></> : "–"}</td>
                      <td className="px-4 py-2.5 text-right tabular">{c.loss && c.onHand > 0 ? `${expectedRoasted(c.onHand, c.loss.pct).toFixed(1)} kg` : "–"}</td>
                      <td className="px-4 py-2.5 text-[0.8125rem] text-ink-muted">{c.lastRoast ? fmtDateTime(c.lastRoast, org.timezone, "date") : "–"}<div className="text-[0.7188rem]">{c.roasts} roast{c.roasts === 1 ? "" : "s"}</div></td>
                      <td className="px-2"><Link href={`/roastery/coffees/${c.id}`} aria-label={`Open ${c.name}`}><ChevronRight className="h-4 w-4 text-ink-faint" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          {coffees.some((c) => c.archived) && <p className="text-[0.75rem] text-ink-muted"><Link className="underline" href={showAll ? "/roastery" : "/roastery?all=1"}>{showAll ? "Hide coffees no longer stocked" : "Show coffees no longer stocked"}</Link></p>}

          <Card>
            <CardHeader title="How each coffee is roasting" subtitle="Averages from your logged roasts. Score roasts in the Roast log to see which one to repeat." />
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[640px] text-left text-[0.8438rem]">
                <thead className="bg-canvas text-[0.75rem] text-ink-muted"><tr><th className="px-4 py-2">Coffee</th><th className="px-4 py-2 text-right">Roasts</th><th className="px-4 py-2 text-right">First crack</th><th className="px-4 py-2 text-right">Drop</th><th className="px-4 py-2 text-right">DTR</th><th className="px-4 py-2 text-right">Score</th><th className="px-4 py-2">Best roast</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {list.filter((c) => c.roasts).map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 font-medium text-ink">{c.name}</td><td className="px-4 py-2 text-right tabular">{c.roasts}</td>
                      <td className="px-4 py-2 text-right tabular">{mmss(c.avg.fc)}</td><td className="px-4 py-2 text-right tabular">{c.avg.drop != null ? `${c.avg.drop.toFixed(1)} °C` : "–"}</td>
                      <td className="px-4 py-2 text-right tabular">{c.avg.dtr != null ? `${c.avg.dtr.toFixed(1)} %` : "–"}</td><td className="px-4 py-2 text-right tabular">{c.avg.score != null ? c.avg.score.toFixed(1) : "–"}</td>
                      <td className="px-4 py-2 text-[0.8125rem] text-ink-muted">{c.best ? `${c.best.score} on ${fmtDateTime(c.best.roasted_at, org.timezone, "date")}${c.best.dtr_pct != null ? ` · DTR ${c.best.dtr_pct} %` : ""}${c.best.drop_c != null ? ` · drop ${c.best.drop_c} °C` : ""}` : "not scored yet"}</td>
                    </tr>
                  ))}
                  {!list.some((c) => c.roasts) && <tr><td colSpan={7} className="px-4 py-4 text-ink-muted">No roasts logged yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card><CardHeader title="Stock in, stock-take" /><div className="border-t border-line px-5 py-4"><StockForm coffees={opts} /></div></Card>
          <Card><CardHeader title="Add a green coffee" /><div className="border-t border-line px-5 py-4"><CoffeeForm /></div></Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="text-[0.75rem] text-ink-muted">{label}</div>
      <div className="mt-1 text-[1.375rem] font-semibold text-ink tabular">{value}</div>
      {sub && <div className="text-[0.75rem] text-ink-muted">{sub}</div>}
    </div>
  );
}
