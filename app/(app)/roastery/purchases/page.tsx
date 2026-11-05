import { requireOrg } from "@/lib/context";
import { fmtDate, money } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportPanel, PriceChart, SendersEditor, type PriceSeries } from "@/components/roastery/purchases";
import { byOrigin, originOf, priceIndex, pricePerYear, type StatLine } from "@/lib/roastery/purchases";
import { greenImportState, greenSenders } from "@/lib/roastery/purchase-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // "Read invoices now" runs for up to ~4 minutes a round
export const metadata = { title: "Green purchases · Roastery" };

type Line = StatLine & { id: string; purchase_id: string; description: string; region: string | null; farm: string | null; variety: string | null; process: string | null; grade: string | null; crop_year: number | null; supplier: string };
type Purchase = { id: string; supplier: string; invoice_number: string | null; invoice_date: string | null; coffee_ex_gst: number | null; freight_ex_gst: number; warnings: string[] };

/** Every green coffee invoice from the importers: kilos by origin since opening, price per kilo over the years, every coffee bought. */
export default async function GreenPurchasesPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const cur = org.currency || "AUD";
  const [pR, lR, eR] = await Promise.all([
    supabase.from("roastery_purchases").select("id, supplier, invoice_number, invoice_date, coffee_ex_gst, freight_ex_gst, warnings").eq("organisation_id", org.id).order("invoice_date", { ascending: false }).limit(5000),
    supabase.from("roastery_purchase_lines").select("id, purchase_id, description, country, region, farm, variety, process, grade, crop_year, decaf, blend, kg, price_per_kg, amount_ex_gst").eq("organisation_id", org.id).limit(20000),
    supabase.from("roastery_purchase_emails").select("status, message, subject, received_at, attachment_name").eq("organisation_id", org.id).order("received_at", { ascending: false }).limit(2000),
  ]);
  const ready = !pR.error;
  const purchases = (pR.data ?? []) as Purchase[];
  const byId = new Map(purchases.map((p) => [p.id, p]));
  const lines: Line[] = ((lR.data ?? []) as (Omit<Line, "invoice_date" | "supplier">)[]).map((l) => ({
    ...l, kg: l.kg == null ? null : Number(l.kg), price_per_kg: l.price_per_kg == null ? null : Number(l.price_per_kg), amount_ex_gst: l.amount_ex_gst == null ? null : Number(l.amount_ex_gst),
    invoice_date: byId.get(l.purchase_id)?.invoice_date ?? null, supplier: byId.get(l.purchase_id)?.supplier ?? "",
  }));
  const emails = (eR.data ?? []) as { status: string; message: string | null; subject: string | null; received_at: string | null; attachment_name: string }[];
  const st = greenImportState(org.settings);

  const origins = byOrigin(lines);
  const totalKg = origins.reduce((t, o) => t + o.kg, 0);
  const totalSpend = purchases.reduce((t, p) => t + Number(p.coffee_ex_gst ?? 0), 0);
  const totalFreight = purchases.reduce((t, p) => t + Number(p.freight_ex_gst ?? 0), 0);
  const dates = purchases.map((p) => p.invoice_date).filter((d): d is string => !!d).sort();
  const first = dates[0] ?? null, last = dates[dates.length - 1] ?? null;
  const perYear = pricePerYear(lines);
  const top = origins.filter((o) => !["Unknown", "Blends"].includes(o.origin)).slice(0, 5);
  const series: PriceSeries[] = top.map((o) => ({ name: o.origin, points: Object.entries(perYear[o.origin] ?? {}).map(([y, v]) => ({ year: Number(y), perKg: v.perKg, kg: v.kg })).sort((a, b) => a.year - b.year) })).filter((s) => s.points.length);
  const index = priceIndex(lines);
  const change = index.length >= 2 ? Math.round(index[index.length - 1].index - 100) : null;
  const years = [...new Set(series.flatMap((s) => s.points.map((p) => p.year)))].sort((a, b) => a - b);

  // every coffee: country → region → the coffees (farm / variety / process / grade), how often and how much
  const coffees = new Map<string, { country: string; region: string; name: string; process: string | null; times: number; kg: number; years: Set<number>; suppliers: Set<string> }>();
  for (const l of lines) {
    const country = originOf(l), region = l.region ?? "—";
    const name = [l.farm, l.variety, l.grade].filter(Boolean).join(" · ") || l.description.replace(/^\[[^\]]+\]\s*/, "").slice(0, 120);
    const k = `${country}|${region}|${name.toLowerCase()}|${l.process ?? ""}`;
    const c = coffees.get(k) ?? { country, region, name, process: l.process, times: 0, kg: 0, years: new Set(), suppliers: new Set() };
    c.times++; c.kg += l.kg ?? 0; if (l.invoice_date) c.years.add(Number(l.invoice_date.slice(0, 4))); if (l.supplier) c.suppliers.add(l.supplier);
    coffees.set(k, c);
  }
  const countries = new Map<string, Map<string, typeof coffees extends Map<string, infer V> ? V[] : never>>();
  for (const c of coffees.values()) {
    const cm = countries.get(c.country) ?? new Map();
    cm.set(c.region, [...(cm.get(c.region) ?? []), c]);
    countries.set(c.country, cm);
  }
  const countryOrder = origins.map((o) => o.origin).filter((o) => countries.has(o));

  const suppliers = new Map<string, { name: string; invoices: number; kg: number; spend: number; first: string | null; last: string | null }>();
  for (const p of purchases) {
    const s = suppliers.get(p.supplier) ?? { name: p.supplier, invoices: 0, kg: 0, spend: 0, first: null, last: null };
    s.invoices++; s.spend += Number(p.coffee_ex_gst ?? 0);
    if (p.invoice_date) { if (!s.first || p.invoice_date < s.first) s.first = p.invoice_date; if (!s.last || p.invoice_date > s.last) s.last = p.invoice_date; }
    suppliers.set(p.supplier, s);
  }
  for (const l of lines) { const s = suppliers.get(l.supplier); if (s) s.kg += l.kg ?? 0; }
  const kgOf = (pid: string) => lines.filter((l) => l.purchase_id === pid).reduce((t, l) => t + (l.kg ?? 0), 0);
  const problems = emails.filter((e) => e.status === "failed");
  const checks = purchases.filter((p) => p.warnings?.length);
  const showAll = sp.all === "1";
  const kg = (n: number) => `${Math.round(n).toLocaleString("en-AU")} kg`;

  return (
    <div>
      <PageHeader title="Green coffee purchases" subtitle="Every invoice from your green coffee importers, read from Gmail — what you've bought since you opened, and what it has cost over the years." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Green coffee bought" value={kg(totalKg)} sub={first ? `since ${fmtDate(first, "medium")}` : "no invoices read yet"} />
        <Kpi label="Spent on green coffee" value={money(totalSpend, cur, { cents: false })} sub={`ex GST${totalFreight ? ` · plus ${money(totalFreight, cur, { cents: false })} delivery` : ""}${totalKg ? ` · avg $${(totalSpend / totalKg).toFixed(2)}/kg` : ""}`} />
        <Kpi label="Invoices" value={purchases.length.toLocaleString("en-AU")} sub={`${suppliers.size} importer${suppliers.size === 1 ? "" : "s"}${last ? ` · latest ${fmtDate(last, "short")}` : ""}`} />
        <Kpi label="Origins" value={String(origins.filter((o) => !["Unknown", "Blends", "Decaf"].includes(o.origin)).length)} sub={`${coffees.size} different coffees`} />
        <Kpi label="Price change" value={change == null ? "–" : `${change > 0 ? "+" : ""}${change}%`} sub={index.length >= 2 ? `average $/kg, ${index[0].year} → ${index[index.length - 1].year}` : "needs two years of invoices"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Price per kilo over the years" subtitle="Average paid per kilo of green coffee (ex GST, weighted by kilos), for your five biggest origins. Hover for each year." />
            <PriceChart series={series} currency={cur} />
            {years.length > 0 && (
              <details className="border-t border-line">
                <summary className="cursor-pointer px-5 py-3 text-[0.8125rem] font-medium text-brand-700">Show as a table</summary>
                <div className="overflow-x-auto px-5 pb-4">
                  <table className="w-full min-w-[480px] text-[0.8125rem]">
                    <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted"><th className="py-2 pr-3 font-medium">Origin</th>{years.map((y) => <th key={y} className="px-2 py-2 text-right font-medium tabular-nums">{y}</th>)}</tr></thead>
                    <tbody>{series.map((s) => <tr key={s.name} className="border-b border-line last:border-0"><td className="py-2 pr-3 text-ink">{s.name}</td>{years.map((y) => { const p = s.points.find((q) => q.year === y); return <td key={y} className="px-2 py-2 text-right tabular-nums text-ink-muted">{p ? `$${p.perKg.toFixed(2)}` : "–"}</td>; })}</tr>)}</tbody>
                  </table>
                </div>
              </details>
            )}
          </Card>

          <Card>
            <CardHeader title="By origin" subtitle="Everything bought since the first invoice" />
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[560px] text-[0.8125rem]">
                <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted"><th className="px-4 py-2 font-medium sm:px-5">Origin</th><th className="px-2 py-2 text-right font-medium">Kilos</th><th className="w-40 px-2 py-2 font-medium">Share</th><th className="px-2 py-2 text-right font-medium">Avg $/kg</th><th className="px-4 py-2 font-medium sm:px-5">First → latest</th></tr></thead>
                <tbody>
                  {origins.map((o) => (
                    <tr key={o.origin} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 font-medium text-ink sm:px-5">{o.origin}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink">{Math.round(o.kg).toLocaleString("en-AU")}</td>
                      <td className="px-2 py-2"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${totalKg ? (o.kg / totalKg) * 100 : 0}%` }} /></div><span className="w-10 text-right text-[0.75rem] tabular-nums text-ink-muted">{totalKg ? Math.round((o.kg / totalKg) * 100) : 0}%</span></div></td>
                      <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{o.avgPerKg ? `$${o.avgPerKg.toFixed(2)}` : "–"}</td>
                      <td className="px-4 py-2 text-ink-muted sm:px-5">{o.first ? fmtDate(o.first, "short") : "–"}{o.first ? ` ${o.first.slice(0, 4)}` : ""} → {o.last ? `${fmtDate(o.last, "short")} ${o.last.slice(0, 4)}` : "–"}</td>
                    </tr>
                  ))}
                  {!origins.length && <tr><td colSpan={5} className="px-5 py-6 text-center text-ink-muted">Nothing yet — read the invoices from Gmail (right).</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Every coffee, by country and region" subtitle="Each different coffee you've bought — how many times, how much, and in which years" />
            <div className="divide-y divide-line border-t border-line">
              {countryOrder.map((country) => {
                const regions = [...countries.get(country)!.entries()].sort((a, b) => b[1].reduce((t, c) => t + c.kg, 0) - a[1].reduce((t, c) => t + c.kg, 0));
                return (
                  <details key={country} className="group" open={countryOrder.length <= 3}>
                    <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 sm:px-5">
                      <span className="font-semibold text-ink">{country}</span>
                      <span className="text-[0.75rem] text-ink-muted">{regions.reduce((t, r) => t + r[1].length, 0)} coffees · {regions.length} region{regions.length === 1 ? "" : "s"}</span>
                    </summary>
                    <div className="space-y-3 px-4 pb-4 sm:px-5">
                      {regions.map(([region, list]) => (
                        <div key={region}>
                          <p className="mb-1 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{region === "—" ? "Region not stated" : region}</p>
                          <ul className="space-y-1">
                            {list.sort((a, b) => b.kg - a.kg).map((c) => (
                              <li key={c.name + c.process} className="flex flex-wrap items-baseline gap-x-2 text-[0.8125rem]">
                                <span className="text-ink">{c.name}</span>
                                {c.process && <Badge>{c.process}</Badge>}
                                <span className="text-[0.75rem] text-ink-muted">{kg(c.kg)} · bought {c.times}× · {[...c.years].sort().join(", ")} · {[...c.suppliers].join(", ")}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
              {!countryOrder.length && <p className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">The coffees appear here once invoices are read.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Invoices" subtitle={checks.length ? `${checks.length} to check — a line without kilos, or a price that didn't add up` : "Newest first"} />
            <ul className="divide-y divide-line border-t border-line">
              {(showAll ? purchases : purchases.slice(0, 25)).map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="w-24 shrink-0 tabular-nums text-ink-muted">{p.invoice_date ? fmtDate(p.invoice_date, "medium") : "—"}</span>
                  <span className="min-w-0 flex-1 text-ink">{p.supplier} <span className="text-ink-faint">{p.invoice_number}</span>{p.warnings?.length ? <span className="ml-2 text-[0.75rem] text-amber-700">⚠ {p.warnings[0]}</span> : null}</span>
                  <span className="tabular-nums text-ink-muted">{kg(kgOf(p.id))}</span>
                  <span className="w-24 text-right tabular-nums text-ink">{p.coffee_ex_gst != null ? money(Number(p.coffee_ex_gst), cur) : "–"}</span>
                </li>
              ))}
              {!purchases.length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">No invoices yet.</li>}
            </ul>
            {!showAll && purchases.length > 25 && <a href="/roastery/purchases?all=1" className="block border-t border-line px-5 py-3 text-center text-[0.8125rem] font-medium text-brand-700 hover:bg-zinc-50">Show all {purchases.length}</a>}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="p-4">
            <p className="mb-2 font-semibold text-ink">Read invoices from Gmail</p>
            <ImportPanel found={emails.length} done={st.done} lastRun={st.lastRun} ready={ready} />
            {emails.length > 0 && (
              <p className="mt-3 text-[0.75rem] text-ink-muted">
                {emails.filter((e) => e.status === "imported").length} read · {emails.filter((e) => e.status === "duplicate").length} already in · {emails.filter((e) => e.status === "skipped").length} not invoices (statements, price lists…) · {problems.length} couldn&apos;t be read{problems.length ? " (tried again next time)" : ""}
              </p>
            )}
            {problems.length > 0 && (
              <ul className="mt-2 space-y-1 text-[0.75rem] text-rose-700">{problems.slice(0, 5).map((e, k) => <li key={k} className="break-words">{e.subject ?? e.attachment_name}: {e.message}</li>)}</ul>
            )}
          </Card>
          <Card className="p-4">
            <p className="font-semibold text-ink">Importers</p>
            <p className="mb-2 text-[0.75rem] text-ink-muted">Emails from these addresses (or anyone at these domains) with a PDF are read as green coffee invoices.</p>
            <SendersEditor senders={greenSenders(org.settings)} />
          </Card>
          <Card className="p-4">
            <p className="mb-2 font-semibold text-ink">By importer</p>
            <ul className="space-y-2 text-[0.8125rem]">
              {[...suppliers.values()].sort((a, b) => b.kg - a.kg).map((s) => (
                <li key={s.name}>
                  <p className="flex justify-between gap-2"><span className="font-medium text-ink">{s.name}</span><span className="tabular-nums text-ink">{kg(s.kg)}</span></p>
                  <p className="text-[0.75rem] text-ink-muted">{s.invoices} invoice{s.invoices === 1 ? "" : "s"} · {money(s.spend, cur)} · {s.first?.slice(0, 4)}–{s.last?.slice(0, 4)}</p>
                </li>
              ))}
              {!suppliers.size && <li className="text-ink-muted">None yet.</li>}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[0.75rem] font-medium text-ink-muted">{label}</p>
      <p className="mt-1 text-[1.5rem] font-semibold tabular-nums leading-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[0.75rem] text-ink-muted">{sub}</p>}
    </Card>
  );
}
