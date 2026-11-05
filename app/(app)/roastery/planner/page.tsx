import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { loadRoastery } from "@/lib/roastery/load";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { GreenPlanner, type PlanCoffee } from "@/components/roastery/planner";

export const dynamic = "force-dynamic";

/** Work backwards: the roasted coffee you need → the green to load, in batches, against what's on hand. */
export default async function PlannerPage() {
  const { supabase, org } = await requireOrg();
  const { coffees, loss } = await loadRoastery(supabase, org.id);
  const list: PlanCoffee[] = coffees.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, batch_kg: c.batch_kg, lossPct: c.loss?.pct ?? null, lossOwn: !!c.loss?.own, onHand: c.onHand }));
  return (
    <div>
      <PageHeader title="Green planner" subtitle={<>Enter the roasted coffee you need; it works out the green to load from each coffee&apos;s weight loss. For what your shop orders need, see the <Link className="underline" href="/store/roast">Shop roast plan</Link>.</>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card><CardHeader title="How much green do I need?" /><div className="border-t border-line px-5 py-2"><GreenPlanner coffees={list} /></div></Card>
        <Card>
          <CardHeader title="Weight loss used" subtitle="Total roasted ÷ total green from weighed batches, so every kilo counts equally. It's total loss: moisture plus chaff and roast gases." />
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-left text-[0.8438rem]">
              <thead className="bg-canvas text-[0.75rem] text-ink-muted"><tr><th className="px-4 py-2">Coffee</th><th className="px-4 py-2 text-right">Loss</th><th className="px-4 py-2 text-right">Yield</th><th className="px-4 py-2 text-right">Green per 1 kg</th></tr></thead>
              <tbody className="divide-y divide-line">
                {list.map((c) => (
                  <tr key={c.id}><td className="px-4 py-2 text-ink">{c.name}{c.lossPct != null && !c.lossOwn && <div className="text-[0.7188rem] text-ink-muted">all-coffee average</div>}</td>
                    <td className="px-4 py-2 text-right tabular">{c.lossPct != null ? `${c.lossPct.toFixed(1)} %` : "–"}</td>
                    <td className="px-4 py-2 text-right tabular">{c.lossPct != null ? `${(100 - c.lossPct).toFixed(1)} %` : "–"}</td>
                    <td className="px-4 py-2 text-right tabular">{c.lossPct != null ? `${(1 / (1 - c.lossPct / 100)).toFixed(3)} kg` : "–"}</td></tr>
                ))}
                {loss.all && <tr className="font-semibold text-ink"><td className="px-4 py-2">All coffees ({loss.all.n} batches)</td><td className="px-4 py-2 text-right tabular">{loss.all.lossPct.toFixed(1)} %</td><td className="px-4 py-2 text-right tabular">{(100 - loss.all.lossPct).toFixed(1)} %</td><td className="px-4 py-2 text-right tabular">{(1 / (1 - loss.all.lossPct / 100)).toFixed(3)} kg</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
