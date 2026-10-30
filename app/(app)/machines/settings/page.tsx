import { requireOrg } from "@/lib/context";
import { readMachines } from "@/lib/machines/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { MachineSettingsForm, ModelFacts } from "@/components/machines/settings-form";

export const dynamic = "force-dynamic";

export default async function MachineSettingsPage() {
  const { supabase, org } = await requireOrg();
  const s = readMachines(org.settings);
  const { data } = await supabase.from("shop_products").select("slug, name").eq("organisation_id", org.id).eq("category", s.shopCategory).neq("status", "archived").order("position");
  const products = (data ?? []) as { slug: string; name: string }[];
  return (
    <div className="space-y-6">
      <PageHeader title="Settings & machines" />
      <MachineSettingsForm initial={s} slug={org.slug} />
      <Card className="overflow-hidden">
        <CardHeader title="Machine chooser" subtitle={`The facts behind the chooser, for each product in your “${s.shopCategory}” shop category. Name, price and photos come from the shop.`} />
        <div className="divide-y divide-line border-t border-line">
          {products.length ? products.map((p) => <ModelFacts key={p.slug} product={p} model={s.models.find((m) => m.slug === p.slug) ?? null} />) : <p className="px-4 py-3 text-[0.8125rem] text-ink-muted">No products in that shop category yet.</p>}
        </div>
      </Card>
    </div>
  );
}
