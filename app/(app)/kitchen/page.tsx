import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { cateringGroup, isCatering } from "@/lib/events/core";
import { amount, deliveriesFromEvent, production, runSheet, shoppingList, type Delivery, type Ingredient, type RecipeLine } from "@/lib/kitchen/core";
import { IngredientsEditor, PrintButton, RecipesEditor } from "@/components/kitchen/editors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kitchen" };

const ACTIVE = ["planning", "quoted", "awaiting_approval", "confirmed"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nice = (iso: string) => new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const fmtT = (t: string | null) => { if (!t) return "Time TBC"; const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)}${h < 12 ? "am" : "pm"}`; };

export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ tab?: string; from?: string; to?: string; all?: string }> }) {
  const { supabase, org, role } = await requireOrg();
  if (role === "staff" || role === "customer") redirect("/dashboard");
  const sp = await searchParams;
  const tab = ["orders", "recipes", "ingredients"].includes(sp.tab ?? "") ? sp.tab! : "run";
  const tz = (org as { timezone?: string }).timezone ?? "Australia/Sydney";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const from = sp.from && DATE.test(sp.from) ? sp.from : today;
  const to = sp.to && DATE.test(sp.to) && sp.to >= from ? sp.to : addDays(from, 6);
  const includeQuoted = sp.all !== "0";

  const [ingR, recR, svcR] = await Promise.all([
    supabase.from("catering_ingredients").select("id, name, unit, pack_size, pack_label, supplier, station, notes, active").eq("organisation_id", org.id).order("name"),
    supabase.from("catering_recipe_lines").select("id, service_id, ingredient_id, qty_per_serve, prep_note").eq("organisation_id", org.id),
    supabase.from("services").select("id, name, category, unit, active, position").eq("organisation_id", org.id).order("position"),
  ]);
  if (ingR.error && /catering_ingredients|does not exist/i.test(ingR.error.message)) {
    return <><PageHeader title="Kitchen" /><p className="text-[0.875rem] text-ink-muted">The kitchen needs the website database update (0057_events_site.sql).</p></>;
  }
  const ingredients = ((ingR.data ?? []) as (Ingredient & { active: boolean })[]).map((i) => ({ ...i, pack_size: i.pack_size == null ? null : Number(i.pack_size) }));
  const recipes = ((recR.data ?? []) as RecipeLine[]).map((r) => ({ ...r, qty_per_serve: Number(r.qty_per_serve) }));
  const menu = ((svcR.data ?? []) as { id: string; name: string; category: string | null; unit: string | null; active: boolean }[]).filter((s) => s.active && isCatering(s.category)).map((s) => ({ id: s.id, name: s.name, unit: s.unit, group: cateringGroup(s.category) }));
  const cateringIds = new Set(menu.map((m) => m.id));

  let body: React.ReactNode = null;
  if (tab === "recipes") body = <RecipesEditor menu={menu} ingredients={ingredients} recipes={recipes} />;
  else if (tab === "ingredients") body = <IngredientsEditor items={ingredients} />;
  else {
    // Upcoming catering: website orders (events.catering) + office jobs whose accepted quote has catering items
    const { data: evs } = await supabase.from("events").select("id, number, name, status, event_date, start_time, address, venue, guest_count, customer_notes, catering, fleet_dates, customer:customers(name)")
      .eq("organisation_id", org.id).in("status", includeQuoted ? ACTIVE : ["confirmed", "awaiting_approval"]).gte("event_date", addDays(from, -14)).lte("event_date", to).limit(500);
    const events = ((evs ?? []) as unknown as { id: string; number: number | null; name: string; status: string; event_date: string | null; start_time: string | null; address: string | null; venue: string | null; guest_count: number | null; customer_notes: string | null; catering: unknown; customer: { name: string } | null }[]).map((e) => ({ ...e, title: e.name }));
    let deliveries: Delivery[] = events.flatMap((e) => deliveriesFromEvent({ ...e, customer: e.customer?.name ?? null }));
    const without = events.filter((e) => (!Array.isArray(e.catering) || !e.catering.length) && e.event_date && e.event_date >= from);
    if (without.length && cateringIds.size) {
      const { data: qs } = await supabase.from("quotes").select("id, event_id").eq("organisation_id", org.id).eq("status", "accepted").in("event_id", without.map((e) => e.id));
      const qIds = (qs ?? []).map((q) => q.id as string);
      if (qIds.length) {
        const { data: items } = await supabase.from("quote_items").select("quote_id, service_id, name, quantity").in("quote_id", qIds).eq("organisation_id", org.id);
        for (const q of qs ?? []) {
          const e = without.find((x) => x.id === q.event_id)!;
          const mine = (items ?? []).filter((i) => i.quote_id === q.id && i.service_id && cateringIds.has(i.service_id as string));
          if (!mine.length) continue;
          deliveries.push({ event_id: e.id, event_number: e.number ? `EV-${e.number}` : null, title: e.title, customer: e.customer?.name ?? null, status: e.status, firm: true, date: e.event_date!, time: e.start_time?.slice(0, 5) ?? null, label: "Catering", address: e.address, venue: e.venue, guests: e.guest_count, notes: e.customer_notes, items: mine.map((i) => ({ service_id: i.service_id as string, name: i.name as string, qty: Number(i.quantity) })) });
        }
      }
    }
    deliveries = deliveries.filter((d) => d.date >= from && d.date <= to);
    const sheet = runSheet(deliveries);
    const prod = production(deliveries, recipes);
    const shop = shoppingList(deliveries, recipes, ingredients);
    const suppliers = [...new Set(shop.map((s) => s.ingredient.supplier ?? "No supplier set"))];
    const range = (
      <form className="flex flex-wrap items-end gap-3 print:hidden" action="/kitchen">
        <input type="hidden" name="tab" value={tab} />
        <label className="text-[0.75rem] text-ink-muted">From<input type="date" name="from" defaultValue={from} className="ml-2 rounded-lg border border-line-strong px-2 py-1.5 text-[0.8125rem]" /></label>
        <label className="text-[0.75rem] text-ink-muted">To<input type="date" name="to" defaultValue={to} className="ml-2 rounded-lg border border-line-strong px-2 py-1.5 text-[0.8125rem]" /></label>
        <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted"><select name="all" defaultValue={includeQuoted ? "1" : "0"} className="rounded-lg border border-line-strong px-2 py-1.5 text-[0.8125rem]"><option value="1">Confirmed + quoted</option><option value="0">Confirmed only</option></select></label>
        <button className="h-8 rounded-lg bg-ink px-3 text-[0.7812rem] font-medium text-white">Show</button>
        <PrintButton />
      </form>
    );
    const tag = (d: Delivery) => d.firm ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-700">Confirmed</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-700">Not confirmed yet</span>;
    if (!deliveries.length) body = <>{range}<Card className="mt-4"><EmptyState title="No catering in these dates">Website catering orders and jobs with catering on an accepted quote show here.</EmptyState></Card></>;
    else if (tab === "orders") body = (
      <>
        {range}
        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader title="What to make" subtitle={`${nice(from)} – ${nice(to)}`} />
            <ul className="divide-y divide-line px-5 pb-4 text-[0.8125rem]">
              {prod.map((p) => (
                <li key={p.name} className="py-2.5">
                  <p className="flex justify-between gap-3"><span className="font-medium text-ink">{p.name}</span><span className="font-semibold tabular-nums">{p.total}</span></p>
                  <p className="text-[0.75rem] text-ink-faint">{Object.entries(p.byDate).map(([d, n]) => `${nice(d).split(",")[0]} ${n}`).join(" · ")}{p.noRecipe ? <span className="ml-2 text-amber-600">· no recipe yet</span> : null}</p>
                  {p.prep.length > 0 && <p className="mt-0.5 text-[0.75rem] text-ink-muted">{p.prep.join(" · ")}</p>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Order list" subtitle="Rounded up to whole packs. Grouped by supplier." />
            <div className="space-y-4 px-5 pb-5">
              {!shop.length && <p className="text-[0.8125rem] text-ink-muted">Add recipes for these items (Recipes tab) and the shopping list builds itself.</p>}
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
      </>
    );
    else body = (
      <>
        {range}
        <div className="mt-4 space-y-6">
          {sheet.map((day) => (
            <section key={day.date} className="break-inside-avoid">
              <h2 className="text-[1rem] font-semibold text-ink">{nice(day.date)}</h2>
              <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {day.deliveries.map((d, i) => (
                  <Card key={d.event_id + i} className="break-inside-avoid p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="text-[1.125rem] font-semibold tabular-nums text-ink">{fmtT(d.time)}</p><p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">{d.label}</p></div>
                      {tag(d)}
                    </div>
                    <p className="mt-2 font-medium text-ink"><Link href={`/events/${d.event_id}`} className="hover:underline">{d.customer ?? d.title}</Link>{d.event_number ? <span className="ml-1.5 text-[0.75rem] text-ink-faint">{d.event_number}</span> : null}</p>
                    {(d.venue || d.address) && <p className="text-[0.8125rem] text-ink-muted">{[d.venue, d.address].filter(Boolean).join(" · ")}</p>}
                    <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[0.8125rem]">
                      {d.items.map((it) => <li key={it.name} className="flex justify-between gap-3"><span><span className="mr-2 inline-block h-3 w-3 rounded border border-line-strong align-middle" />{it.name}</span><span className="font-semibold tabular-nums">{it.qty}</span></li>)}
                    </ul>
                    {d.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900">{d.notes.split("\n").filter((l) => /customer notes|dietary|gluten|vegan|allerg/i.test(l)).join("\n") || d.notes.split("\n").slice(-1)[0]}</p>}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Catering" title="Kitchen" subtitle="Run sheet for each day, what to make, and the order list for your suppliers — from upcoming catering and your recipes." />
      <div className="mb-5 print:hidden"><Tabs baseHref="/kitchen" active={tab} tabs={[{ key: "run", label: "Run sheet" }, { key: "orders", label: "Make & order" }, { key: "recipes", label: "Recipes" }, { key: "ingredients", label: "Ingredients" }]} /></div>
      {body}
    </>
  );
}
