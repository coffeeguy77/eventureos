import Link from "next/link";
import { LineChart } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";
import { loadRoastery } from "@/lib/roastery/load";
import { mmss } from "@/lib/roastery/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecorderImport, RoastEdit, RoastForm, type CoffeeOpt } from "@/components/roastery/forms";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { recorder: "recorder", manual: "logged", weighed_list: "weighed" };

/** Every roast: green in, roasted out, weight loss, and the roast's numbers from the recorder. */
export default async function RoastLogPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { supabase, org } = await requireOrg();
  const filter = (await searchParams).c ?? "";
  const { coffees, roasts } = await loadRoastery(supabase, org.id);
  const names = new Map(coffees.map((c) => [c.id, c]));
  const opts: CoffeeOpt[] = coffees.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, batch_kg: c.batch_kg, lossPct: c.loss?.pct ?? null, lossOwn: !!c.loss?.own }));
  const shown = roasts.filter((r) => !filter || r.coffee_id === filter).slice(0, 300);
  const unweighed = roasts.filter((r) => r.roasted_kg == null).length;

  return (
    <div>
      <PageHeader title="Roast log" subtitle={unweighed ? `${unweighed} roast${unweighed > 1 ? "s" : ""} not weighed yet. Weighing every batch keeps the yield figures right.` : "Every roast, with green in, roasted out and weight loss."} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {[{ id: "", name: "All coffees" }, ...coffees.filter((c) => c.roasts)].map((c) => (
              <Link key={c.id || "all"} href={c.id ? `/roastery/roasts?c=${c.id}` : "/roastery/roasts"} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", filter === c.id ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{c.name}</Link>
            ))}
          </div>
          <Card>
            {shown.length === 0 ? <EmptyState title="No roasts yet">Log a roast, add weighed batches, or import from the roast recorder.</EmptyState> : (
              <ul className="divide-y divide-line">
                {shown.map((r) => {
                  const c = r.coffee_id ? names.get(r.coffee_id) : null;
                  const est = c?.loss ? r.green_kg * (1 - c.loss.pct / 100) : null;
                  return (
                    <li key={r.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <Link href={`/roastery/roasts/${r.id}`} className="font-medium text-ink hover:underline">{c?.name ?? "Unknown coffee"}</Link>
                        <span className="text-[0.8125rem] text-ink-muted">{fmtDateTime(r.roasted_at, org.timezone)}</span>
                        <Badge>{SOURCE[r.source]}</Badge>
                        {r.has_curve && <Link href={`/roastery/roasts/${r.id}`} className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-brand-700 hover:underline"><LineChart className="h-3.5 w-3.5" />Roast graph</Link>}
                        <span className="ml-auto text-[0.875rem] font-semibold text-ink tabular">{r.score != null ? r.score : <span className="font-normal text-ink-faint">not scored</span>}</span>
                      </div>
                      <div className="mt-1 text-[0.8125rem] text-ink-muted tabular">
                        {r.green_kg} kg green → {r.roasted_kg != null ? <span className="text-ink">{r.roasted_kg} kg roasted · loss {r.loss_pct?.toFixed(1)} %</span> : <>{est != null ? `≈ ${est.toFixed(2)} kg roasted (est.)` : "not weighed"}</>}
                        {r.first_crack_s != null && ` · FC ${mmss(r.first_crack_s)}${r.first_crack_c != null ? ` at ${r.first_crack_c} °C` : ""}`}
                        {r.end_s != null && ` · drop ${mmss(r.end_s)}`}{r.drop_c != null && ` at ${r.drop_c} °C`}
                        {r.dtr_pct != null && ` · DTR ${r.dtr_pct} %`}{r.profile && ` · ${r.profile}`}
                      </div>
                      {r.notes && <div className="mt-1 text-[0.8125rem] text-ink">{r.notes}</div>}
                      <div className="mt-2"><RoastEdit id={r.id} green={r.green_kg} roasted={r.roasted_kg} score={r.score} notes={r.notes} lossPct={c?.loss?.pct ?? null} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card><CardHeader title="Log a roast" subtitle="Or several batches you weighed after roasting." /><div className="border-t border-line px-5 py-4"><RoastForm coffees={opts} /></div></Card>
          <RecorderImport />
        </div>
      </div>
    </div>
  );
}
