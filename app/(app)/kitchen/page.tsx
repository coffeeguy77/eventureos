import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { cateringGroup, isCatering } from "@/lib/events/core";
import { type Ingredient, type RecipeLine } from "@/lib/kitchen/core";
import { FIRM_STATUSES, loadCateringJobs } from "@/lib/kitchen/jobs";
import { IngredientsEditor, PrintButton, RecipesEditor } from "@/components/kitchen/editors";
import { MakeOrderView, RunSheetView } from "@/components/kitchen/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kitchen" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

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

  let body: React.ReactNode = null;
  if (tab === "recipes") body = <RecipesEditor menu={menu} ingredients={ingredients} recipes={recipes} />;
  else if (tab === "ingredients") body = <IngredientsEditor items={ingredients} />;
  else {
    const { deliveries, warnings } = await loadCateringJobs(supabase, org.id, { from, to, statuses: includeQuoted ? undefined : FIRM_STATUSES, menu });
    const range = (
      <form className="flex flex-wrap items-end gap-3 print:hidden" action="/kitchen">
        <input type="hidden" name="tab" value={tab} />
        <label className="text-[0.75rem] text-ink-muted">From<input type="date" name="from" defaultValue={from} className="ml-2 rounded-lg border border-line-strong px-2 py-1.5 text-[0.8125rem]" /></label>
        <label className="text-[0.75rem] text-ink-muted">To<input type="date" name="to" defaultValue={to} className="ml-2 rounded-lg border border-line-strong px-2 py-1.5 text-[0.8125rem]" /></label>
        <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted"><select name="all" defaultValue={includeQuoted ? "1" : "0"} className="rounded-lg border border-line-strong px-2 py-1.5 text-[0.8125rem]"><option value="1">Confirmed + quoted</option><option value="0">Confirmed only</option></select></label>
        <button className="h-8 rounded-lg bg-ink px-3 text-[0.7812rem] font-medium text-surface">Show</button>
        <PrintButton />
      </form>
    );
    if (!deliveries.length) body = <>{range}<Card className="mt-4"><EmptyState title="No catering in these dates">Website catering orders and jobs with catering on an accepted quote show here.</EmptyState></Card></>;
    else if (tab === "orders") body = <>{range}<div className="mt-4"><MakeOrderView deliveries={deliveries} recipes={recipes} ingredients={ingredients} from={from} to={to} /></div></>;
    else body = <>{range}<div className="mt-4"><RunSheetView deliveries={deliveries} jobHref={(id) => `/events/${id}`} warnings={warnings} /></div></>;
  }

  return (
    <>
      <PageHeader eyebrow="Catering" title="Kitchen" subtitle="Run sheet for each day, what to make, and the order list for your suppliers — from upcoming catering and your recipes." />
      <div className="mb-5 print:hidden"><Tabs baseHref="/kitchen" active={tab} tabs={[{ key: "run", label: "Run sheet" }, { key: "orders", label: "Make & order" }, { key: "recipes", label: "Recipes" }, { key: "ingredients", label: "Ingredients" }]} /></div>
      {body}
    </>
  );
}
