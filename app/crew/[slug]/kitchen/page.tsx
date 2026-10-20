import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCrew } from "@/lib/crew/server";
import { isKitchen } from "@/lib/crew/skills";
import { addDaysISO, todayISO } from "@/lib/format";
import type { Ingredient, RecipeLine } from "@/lib/kitchen/core";
import { cateringMenu, loadCateringJobs } from "@/lib/kitchen/jobs";
import { readSent } from "@/lib/kitchen/changes";
import { MakeOrderView, RunSheetView } from "@/components/kitchen/views";
import { IngredientsEditor, RecipesEditor } from "@/components/kitchen/editors";
import { cn } from "@/lib/cn";
import { Card } from "../parts";
import { chefArchiveIngredient, chefSaveIngredient, chefSaveRecipe } from "./actions";

export const metadata = { title: "Kitchen" };
export const dynamic = "force-dynamic";

const TABS = [{ key: "jobs", label: "Jobs" }, { key: "make", label: "Make & order" }, { key: "recipes", label: "Recipes" }, { key: "ingredients", label: "Ingredients" }];
const RANGES = [7, 14, 28];
const JOBS_AHEAD = 60;

/** The chef's kitchen: confirmed catering jobs by day, what to make and order, and the recipes and ingredients. */
export default async function CrewKitchen({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; days?: string }> }) {
  const { slug } = await params;
  const s = await requireCrew(slug);
  if (!isKitchen(s.member.skills)) redirect(`/crew/${slug}`);
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "jobs";
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 7;
  const today = todayISO(s.org.timezone);
  const base = `/crew/${slug}/kitchen`;

  const [ingR, recR, menu] = await Promise.all([
    s.db.from("catering_ingredients").select("id, name, unit, pack_size, pack_label, supplier, station, notes, active").eq("organisation_id", s.org.id).order("name"),
    s.db.from("catering_recipe_lines").select("id, service_id, ingredient_id, qty_per_serve, prep_note").eq("organisation_id", s.org.id),
    cateringMenu(s.db, s.org.id),
  ]);
  const ingredients = ((ingR.data ?? []) as (Ingredient & { active: boolean })[]).map((i) => ({ ...i, pack_size: i.pack_size == null ? null : Number(i.pack_size) }));
  const recipes = ((recR.data ?? []) as RecipeLine[]).map((r) => ({ ...r, qty_per_serve: Number(r.qty_per_serve) }));
  const actions = { saveIngredient: chefSaveIngredient.bind(null, slug), archiveIngredient: chefArchiveIngredient.bind(null, slug), saveRecipe: chefSaveRecipe.bind(null, slug) };

  let body: React.ReactNode;
  if (tab === "recipes") body = <RecipesEditor menu={menu} ingredients={ingredients} recipes={recipes} actions={actions} />;
  else if (tab === "ingredients") body = <IngredientsEditor items={ingredients} actions={actions} />;
  else {
    const to = addDaysISO(today, tab === "make" ? days - 1 : JOBS_AHEAD);
    const { deliveries, warnings } = await loadCateringJobs(s.db, s.org.id, { from: today, to, statuses: ["confirmed"], menu });
    // "Changed" for three days after the kitchen was emailed about a change
    const changed = new Set<string>();
    const ids = [...new Set(deliveries.map((d) => d.event_id))];
    if (ids.length) {
      const { data } = await s.db.from("events").select("id, catering_sent").eq("organisation_id", s.org.id).in("id", ids);
      for (const r of (data ?? []) as { id: string; catering_sent: unknown }[]) {
        const at = readSent(r.catering_sent)?.changed_at;
        if (at && Date.now() - Date.parse(at) < 3 * 86_400_000) changed.add(r.id);
      }
    }
    if (!deliveries.length) body = <Card><p className="text-[0.9375rem] font-semibold text-ink">No confirmed catering {tab === "make" ? `in the next ${days} days` : "coming up"}</p><p className="mt-1 text-[0.8125rem] text-ink-muted">Confirmed catering jobs show here, and you&apos;ll get an email when one is added or changes.</p></Card>;
    else if (tab === "make") body = <MakeOrderView deliveries={deliveries} recipes={recipes} ingredients={ingredients} from={today} to={to} recipesHref={`${base}?tab=recipes`} />;
    else body = <RunSheetView deliveries={deliveries} warnings={warnings} changed={changed} compact />;
  }

  return (
    <div>
      <h1 className="mb-3 text-[1.5rem] font-bold tracking-tight text-ink">Kitchen</h1>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "jobs" ? base : `${base}?tab=${t.key}`}
            className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium", t.key === tab ? "bg-[var(--crew-brand)] text-white" : "bg-surface text-ink-muted ring-1 ring-inset ring-line")}>{t.label}</Link>
        ))}
      </div>
      {tab === "make" && (
        <div className="mb-4 flex gap-2 text-[0.75rem]">
          {RANGES.map((n) => <Link key={n} href={`${base}?tab=make&days=${n}`} className={cn("rounded-md px-2.5 py-1", n === days ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-inset ring-line")}>Next {n} days</Link>)}
        </div>
      )}
      {tab === "jobs" && <p className="mb-3 text-[0.8125rem] text-ink-muted">Confirmed catering for the next {JOBS_AHEAD} days.</p>}
      {body}
    </div>
  );
}
