import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";
import { cleanCurve, mmss } from "@/lib/roastery/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { RoastChart } from "@/components/roastery/roast-chart";
import { RoastEdit } from "@/components/roastery/forms";

export const dynamic = "force-dynamic";

const COLS = "id, coffee_id, roasted_at, green_kg, roasted_kg, loss_pct, profile, charge_c, turning_point_s, first_crack_s, first_crack_c, end_s, drop_c, dtr_pct, score, notes, source, curve";
type Row = { id: string; coffee_id: string | null; roasted_at: string; green_kg: number; roasted_kg: number | null; loss_pct: number | null; profile: string | null; charge_c: number | null; turning_point_s: number | null; first_crack_s: number | null; first_crack_c: number | null; end_s: number | null; drop_c: number | null; dtr_pct: number | null; score: number | null; notes: string | null; source: string; curve: unknown };

/** One roast: its graph, its numbers, and another roast laid over it to compare. */
export default async function RoastPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vs?: string }> }) {
  const { id } = await params;
  const vsParam = (await searchParams).vs;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const [{ data: r }, { data: coffees }, { data: others }] = await Promise.all([
    supabase.from("roastery_roasts").select(COLS).eq("organisation_id", org.id).eq("id", id).maybeSingle(),
    supabase.from("roastery_coffees").select("id, name").eq("organisation_id", org.id),
    supabase.from("roastery_roasts").select("id, coffee_id, roasted_at, profile, score").eq("organisation_id", org.id).eq("has_curve", true).neq("id", id).order("roasted_at", { ascending: false }).limit(300),
  ]);
  if (!r) notFound();
  const roast = r as unknown as Row;
  const names = new Map((coffees ?? []).map((c) => [c.id as string, c.name as string]));
  const coffee = roast.coffee_id ? names.get(roast.coffee_id) ?? "Unknown coffee" : "Unknown coffee";
  const label = (x: { coffee_id: string | null; roasted_at: string; profile?: string | null }) => `${x.coffee_id ? names.get(x.coffee_id) ?? "?" : "?"} · ${fmtDateTime(x.roasted_at, org.timezone)}${x.profile ? ` · ${x.profile}` : ""}`;
  const list = (others ?? []) as { id: string; coffee_id: string | null; roasted_at: string; profile: string | null; score: number | null }[];
  const same = list.filter((x) => x.coffee_id === roast.coffee_id), rest = list.filter((x) => x.coffee_id !== roast.coffee_id);
  const vsId = vsParam === "none" ? null : vsParam && list.some((x) => x.id === vsParam) ? vsParam : same[0]?.id ?? null;
  let vs: Row | null = null;
  if (vsId) { const { data } = await supabase.from("roastery_roasts").select(COLS).eq("organisation_id", org.id).eq("id", vsId).maybeSingle(); vs = data as unknown as Row | null; }
  const curve = cleanCurve(roast.curve), vsCurve = vs ? cleanCurve(vs.curve) : null;
  const dev = (x: Row) => (x.first_crack_s != null && x.end_s != null ? x.end_s - x.first_crack_s : null);
  const rowsCmp: [string, (x: Row) => string][] = [
    ["Green in", (x) => `${Number(x.green_kg)} kg`],
    ["Roasted out", (x) => (x.roasted_kg != null ? `${Number(x.roasted_kg)} kg (loss ${Number(x.loss_pct).toFixed(1)} %)` : "not weighed")],
    ["Charge", (x) => (x.charge_c != null ? `${x.charge_c} °C` : "–")],
    ["Turning point", (x) => mmss(x.turning_point_s)],
    ["First crack", (x) => `${mmss(x.first_crack_s)}${x.first_crack_c != null ? ` at ${x.first_crack_c} °C` : ""}`],
    ["Drop", (x) => `${mmss(x.end_s)}${x.drop_c != null ? ` at ${x.drop_c} °C` : ""}`],
    ["Development", (x) => (dev(x) != null ? `${mmss(dev(x))}${x.dtr_pct != null ? ` · DTR ${x.dtr_pct} %` : ""}` : x.dtr_pct != null ? `DTR ${x.dtr_pct} %` : "–")],
    ["Cup score", (x) => (x.score != null ? String(x.score) : "not scored")],
  ];
  return (
    <div>
      <Link href="/roastery/roasts" className="mb-2 inline-flex items-center gap-1 text-[0.8125rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Roast log</Link>
      <PageHeader title={<span className="flex flex-wrap items-center gap-2">{coffee}<Badge>{roast.source === "recorder" ? "from the recorder" : roast.source === "weighed_list" ? "weighed batch" : "logged"}</Badge></span>}
        subtitle={`${fmtDateTime(roast.roasted_at, org.timezone)}${roast.profile ? ` · ${roast.profile}` : ""}`} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            {curve ? <RoastChart main={{ label: "This roast", curve, fc: roast.first_crack_s, end: roast.end_s }} compare={vsCurve && vs ? { label: label(vs), curve: vsCurve, fc: vs.first_crack_s, end: vs.end_s } : null} />
              : <EmptyState title="No roast graph for this roast">Graphs come from the roast recorder. Import its roast files in the Roast log (select everything in the roasts folder, including index.csv).</EmptyState>}
          </Card>
          {curve && (
            <Card className="p-4">
              <form className="flex flex-wrap items-end gap-2" action={`/roastery/roasts/${roast.id}`}>
                <label className="min-w-[240px] flex-1 text-[0.7812rem] font-medium text-ink">Compare with
                  <Select name="vs" defaultValue={vsId ?? "none"} className="mt-1.5">
                    <option value="none">Nothing</option>
                    {same.length > 0 && <optgroup label={`${coffee}`}>{same.map((x) => <option key={x.id} value={x.id}>{label(x)}{x.score != null ? ` · score ${x.score}` : ""}</option>)}</optgroup>}
                    {rest.length > 0 && <optgroup label="Other coffees">{rest.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</optgroup>}
                  </Select>
                </label>
                <button className={buttonClass("secondary")}>Show</button>
              </form>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title={vs ? "Side by side" : "This roast"} />
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-left text-[0.8125rem]">
                {vs && <thead className="bg-canvas text-[0.75rem] text-ink-muted"><tr><th className="px-4 py-2" /><th className="px-4 py-2">This roast</th><th className="px-4 py-2">Compare</th></tr></thead>}
                <tbody className="divide-y divide-line">
                  {rowsCmp.map(([k, f]) => <tr key={k}><td className="px-4 py-2 text-ink-muted">{k}</td><td className="px-4 py-2 text-ink tabular">{f(roast)}</td>{vs && <td className="px-4 py-2 text-ink-muted tabular">{f(vs)}</td>}</tr>)}
                </tbody>
              </table>
            </div>
            {vs && <div className="border-t border-line px-4 py-2 text-[0.75rem] text-ink-muted">Compare: {label(vs)}. <Link className="underline" href={`/roastery/roasts/${vs.id}`}>Open it</Link></div>}
          </Card>
          <Card>
            <CardHeader title="Weight, score and notes" />
            <div className="space-y-2 border-t border-line px-4 py-3 text-[0.8125rem]">
              {roast.notes && <p className="text-ink">{roast.notes}</p>}
              <RoastEdit id={roast.id} green={Number(roast.green_kg)} roasted={roast.roasted_kg != null ? Number(roast.roasted_kg) : null} score={roast.score != null ? Number(roast.score) : null} notes={roast.notes} lossPct={null} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
