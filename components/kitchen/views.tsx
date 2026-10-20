/**
 * Kitchen views shared by the office Kitchen page and the chef's staff app: the run sheet and "make & order".
 * Server components — plain markup, no state.
 */
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { amount, production, runSheet, shoppingList, type Delivery, type Ingredient, type RecipeLine } from "@/lib/kitchen/core";

export const niceDate = (iso: string) => new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
export const fmtTime = (t: string | null) => { if (!t) return "Time TBC"; const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)}${h < 12 ? "am" : "pm"}`; };

const tag = (d: Delivery) => d.firm
  ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-700">Confirmed</span>
  : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-700">Not confirmed yet</span>;

/** Notes worth showing the kitchen: dietary lines if there are any, else the last line. */
const kitchenNotes = (notes: string) => notes.length <= 400 ? notes : notes.split("\n").filter((l) => /customer notes|dietary|gluten|vegan|allerg/i.test(l)).join("\n") || notes.split("\n").slice(-1)[0];

export function RunSheetView({ deliveries, jobHref, editHref, warnings = {}, changed = new Set<string>(), compact = false }: {
  deliveries: Delivery[]; jobHref?: (eventId: string) => string; editHref?: (eventId: string) => string; warnings?: Record<string, string[]>; changed?: Set<string>; compact?: boolean;
}) {
  const sheet = runSheet(deliveries);
  return (
    <div className="space-y-6">
      {sheet.map((day) => (
        <section key={day.date} className="break-inside-avoid">
          <h2 className="text-[1rem] font-semibold text-ink">{niceDate(day.date)}</h2>
          <div className={`mt-2 grid gap-3 ${compact ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {day.deliveries.map((d, i) => (
              <Card key={d.event_id + d.date + i} className="break-inside-avoid p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {d.ready ? <p className="text-[1.125rem] font-semibold tabular-nums text-ink">Ready {fmtTime(d.ready)}</p> : <p className="text-[0.9375rem] font-semibold text-amber-700">Ready-by time not set</p>}
                    <p className="text-[0.75rem] text-ink-muted">{d.time ? `At the event ${fmtTime(d.time)}` : "Event time TBC"}</p>
                    <p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">{d.label}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {tag(d)}
                    {changed.has(d.event_id) && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-sky-700">Changed</span>}
                  </div>
                </div>
                <p className="mt-2 font-medium text-ink">
                  {jobHref ? <Link href={jobHref(d.event_id)} className="hover:underline">{d.customer ?? d.title}</Link> : (d.customer ?? d.title)}
                  {d.event_number ? <span className="ml-1.5 text-[0.75rem] text-ink-faint">{d.event_number}</span> : null}
                </p>
                {(d.venue || d.address) && <p className="text-[0.8125rem] text-ink-muted">{[d.venue, d.address].filter(Boolean).join(" · ")}</p>}
                {d.guests ? <p className="text-[0.75rem] text-ink-faint">{d.guests} guests</p> : null}
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[0.8125rem]">
                  {d.items.map((it, k) => <li key={it.name + k} className="flex justify-between gap-3"><span><span className="mr-2 inline-block h-3 w-3 rounded border border-line-strong align-middle" />{it.name}{it.note && <span className="block pl-5 text-[0.75rem] font-medium text-amber-800">{it.note}</span>}</span><span className="font-semibold tabular-nums">{it.qty}</span></li>)}
                </ul>
                {d.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900">{kitchenNotes(d.notes)}</p>}
                {(warnings[d.event_id] ?? []).length > 0 && <p className="mt-2 text-[0.7188rem] text-amber-700">{warnings[d.event_id].join(" · ")}</p>}
                {editHref && <a href={editHref(d.event_id)} className="mt-3 inline-block text-[0.75rem] font-medium text-brand-700 hover:underline print:hidden">Edit kitchen order</a>}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function MakeOrderView({ deliveries, recipes, ingredients, from, to, recipesHref }: {
  deliveries: Delivery[]; recipes: RecipeLine[]; ingredients: Ingredient[]; from: string; to: string; recipesHref?: string;
}) {
  const prod = production(deliveries, recipes);
  const shop = shoppingList(deliveries, recipes, ingredients);
  const suppliers = [...new Set(shop.map((s) => s.ingredient.supplier ?? "No supplier set"))];
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardHeader title="What to make, day by day" subtitle={`Catering going out ${niceDate(from)} – ${niceDate(to)}`} />
        <div className="space-y-4 px-5 pb-4 text-[0.8125rem]">
          {[...new Set(deliveries.map((d) => d.date))].sort().map((date) => {
            const today = deliveries.filter((d) => d.date === date);
            const rows = production(today, recipes);
            const earliest = today.map((d) => d.ready).filter(Boolean).sort()[0] ?? null;
            return (
              <div key={date}>
                <p className="flex flex-wrap items-baseline gap-x-2 font-semibold text-ink">{niceDate(date)}<span className="text-[0.75rem] font-normal text-ink-muted">{earliest ? `first ready by ${fmtTime(earliest)}` : "ready-by time not set"} · {today.length} job{today.length === 1 ? "" : "s"}</span></p>
                <ul className="mt-1 divide-y divide-line">
                  {rows.map((p) => (
                    <li key={p.name} className="py-1.5">
                      <p className="flex justify-between gap-3"><span className="text-ink">{p.name}</span><span className="font-semibold tabular-nums">{p.total}</span></p>
                      {(p.noRecipe || p.prep.length > 0) && <p className="text-[0.7188rem] text-ink-faint">{p.prep.join(" · ")}{p.noRecipe ? <span className="text-amber-600">{p.prep.length ? " · " : ""}no recipe yet</span> : null}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {prod.length > 0 && <p className="border-t border-line pt-2 text-[0.75rem] text-ink-muted">All days: {prod.map((p) => `${p.total} ${p.name}`).join(" · ")}</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Order list" subtitle={`Ingredients for everything above (${niceDate(from)} – ${niceDate(to)}), rounded up to whole packs, by supplier.`} />
        <div className="space-y-4 px-5 pb-5">
          {!shop.length && <p className="text-[0.8125rem] text-ink-muted">Add recipes for these items ({recipesHref ? <Link href={recipesHref} className="font-medium text-brand-600">Recipes</Link> : "Recipes tab"}) and the shopping list builds itself.</p>}
          {suppliers.map((sup) => (
            <div key={sup}>
              <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{sup}</p>
              <table className="mt-1 w-full text-[0.8125rem]"><tbody className="divide-y divide-line">
                {shop.filter((s) => (s.ingredient.supplier ?? "No supplier set") === sup).map((s) => (
                  <tr key={s.ingredient.id}>
                    <td className="py-2"><span className="mr-2 inline-block h-3.5 w-3.5 rounded border border-line-strong align-middle print:inline-block" /><span className="font-medium text-ink">{s.ingredient.name}</span><span className="block pl-6 text-[0.6875rem] text-ink-faint">{s.usedIn.join(", ")}</span></td>
                    <td className="text-right tabular-nums text-ink-muted">{amount(s.needed, s.ingredient.unit)}</td>
                    <td className="w-40 text-right font-semibold tabular-nums">{s.packs !== null ? `${s.packs} × ${s.ingredient.pack_label || amount(s.ingredient.pack_size!, s.ingredient.unit)}` : amount(s.buy, s.ingredient.unit)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
