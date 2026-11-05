import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { fmtDateTime, money } from "@/lib/format";
import { loadRoastery } from "@/lib/roastery/load";
import { expectedRoasted, mmss } from "@/lib/roastery/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CoffeeForm, RoastForm, StockForm, type CoffeeOpt } from "@/components/roastery/forms";

export const dynamic = "force-dynamic";
const KIND: Record<string, string> = { received: "Received", roasted: "Roasted", adjusted: "Adjusted" };

/** One green coffee: stock and value, its weight loss, every stock movement and its roasts. */
export default async function CoffeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { coffees, roasts } = await loadRoastery(supabase, org.id);
  const c = coffees.find((x) => x.id === id);
  if (!c) notFound();
  const { data: moves } = await supabase.from("roastery_stock_moves").select("id, kind, kg, cost_per_kg, note, happened_at").eq("organisation_id", org.id).eq("coffee_id", id).order("happened_at", { ascending: false }).limit(200);
  const mine = roasts.filter((r) => r.coffee_id === id);
  const opt: CoffeeOpt[] = [{ id: c.id, name: c.name, batch_kg: c.batch_kg, lossPct: c.loss?.pct ?? null, lossOwn: !!c.loss?.own }];
  const next = c.onHand <= 0 ? "Record green coffee received to start tracking stock." : c.low ? `Reorder: ${c.onHand.toFixed(1)} kg left (reorder level ${c.reorder_kg} kg).` : c.loss ? `${c.onHand.toFixed(1)} kg green on hand makes about ${expectedRoasted(c.onHand, c.loss.pct).toFixed(1)} kg roasted (${Math.floor(c.onHand / c.batch_kg)} full ${c.batch_kg} kg batches).` : "Weigh a batch after roasting to get this coffee's weight loss.";
  return (
    <div>
      <PageHeader eyebrow="Roastery · green coffee" title={<span className="flex flex-wrap items-center gap-2">{c.name}{c.archived && <Badge>not stocked</Badge>}{c.low && <Badge tone="amber">reorder</Badge>}</span>} subtitle={[c.origin, c.supplier, c.process].filter(Boolean).join(" · ") || undefined} />
      <div className="mb-5 rounded-xl bg-brand-50 px-4 py-3 text-[0.875rem] text-brand-800 ring-1 ring-brand-100">{next}</div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="On hand" value={`${c.onHand.toFixed(2)} kg`} />
        <Stat label="Value" value={c.value != null ? money(c.value) : "no cost yet"} sub={c.avgCost != null ? `${money(c.avgCost, "AUD", { cents: true })}/kg average` : undefined} />
        <Stat label="Weight loss" value={c.loss ? `${c.loss.pct.toFixed(1)} %` : "–"} sub={c.loss ? (c.loss.own ? `${c.loss.n} weighed batch${c.loss.n > 1 ? "es" : ""}` : "all-coffee average (none weighed yet)") : undefined} />
        <Stat label="Roasts" value={String(c.roasts)} sub={c.avg.dtr != null ? `average DTR ${c.avg.dtr.toFixed(1)} %` : undefined} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Stock movements" />
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[520px] text-left text-[0.8438rem]">
                <thead className="bg-canvas text-[0.75rem] text-ink-muted"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">What</th><th className="px-4 py-2 text-right">Green kg</th><th className="px-4 py-2 text-right">Cost / kg</th><th className="px-4 py-2">Note</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {(moves ?? []).map((m) => (
                    <tr key={m.id as string}><td className="px-4 py-2 text-ink-muted">{fmtDateTime(m.happened_at as string, org.timezone)}</td><td className="px-4 py-2 text-ink">{KIND[m.kind as string]}</td>
                      <td className={`px-4 py-2 text-right tabular ${Number(m.kg) > 0 ? "text-emerald-700" : "text-ink"}`}>{Number(m.kg) > 0 ? "+" : ""}{Number(m.kg)}</td>
                      <td className="px-4 py-2 text-right tabular">{m.cost_per_kg != null ? money(Number(m.cost_per_kg), "AUD", { cents: true }) : ""}</td><td className="px-4 py-2 text-ink-muted">{m.note as string | null}</td></tr>
                  ))}
                  {!moves?.length && <tr><td colSpan={5} className="px-4 py-4 text-ink-muted">Nothing recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Roasts" />
            <ul className="divide-y divide-line border-t border-line">
              {mine.slice(0, 100).map((r) => (
                <li key={r.id} className="px-4 py-2.5 text-[0.8125rem]">
                  <a href={`/roastery/roasts/${r.id}`} className="text-ink hover:underline">{fmtDateTime(r.roasted_at, org.timezone)}</a>{r.has_curve && <a href={`/roastery/roasts/${r.id}`} className="ml-2 text-[0.75rem] font-medium text-brand-700 hover:underline">graph</a>}
                  <span className="text-ink-muted tabular"> · {r.green_kg} kg → {r.roasted_kg != null ? `${r.roasted_kg} kg (loss ${r.loss_pct?.toFixed(1)} %)` : "not weighed"}{r.first_crack_s != null ? ` · FC ${mmss(r.first_crack_s)}` : ""}{r.dtr_pct != null ? ` · DTR ${r.dtr_pct} %` : ""}{r.drop_c != null ? ` · drop ${r.drop_c} °C` : ""}{r.score != null ? ` · score ${r.score}` : ""}</span>
                </li>
              ))}
              {!mine.length && <li className="px-4 py-4 text-[0.8125rem] text-ink-muted">No roasts yet.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-5">
          <Card><CardHeader title="Stock in, stock-take" /><div className="border-t border-line px-5 py-4"><StockForm coffees={opt} coffeeId={c.id} /></div></Card>
          <Card><CardHeader title="Log a roast" /><div className="border-t border-line px-5 py-4"><RoastForm coffees={opt} coffeeId={c.id} /></div></Card>
          <Card><CardHeader title="Details" /><div className="border-t border-line px-5 py-4"><CoffeeForm initial={{ id: c.id, name: c.name, origin: c.origin, supplier: c.supplier, process: c.process, batch_kg: c.batch_kg, reorder_kg: c.reorder_kg, notes: c.notes, archived: c.archived }} /></div></Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl bg-surface p-4 ring-1 ring-line"><div className="text-[0.75rem] text-ink-muted">{label}</div><div className="mt-1 text-[1.25rem] font-semibold text-ink tabular">{value}</div>{sub && <div className="text-[0.75rem] text-ink-muted">{sub}</div>}</div>;
}
