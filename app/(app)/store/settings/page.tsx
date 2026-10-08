import { requireOrg } from "@/lib/context";
import { readShop } from "@/lib/shop/core";
import { appBaseUrl } from "@/lib/integrations/registry";
import { PageHeader } from "@/components/ui/page-header";
import { ShopSettingsForm } from "@/components/store/settings-form";
import { SiteNavForm } from "@/components/store/site-nav-form";
import { BoxesForm } from "@/components/store/boxes-form";
import { readSiteNav } from "@/lib/site-nav";

export const dynamic = "force-dynamic";

export default async function ShopSettingsPage() {
  const { org, supabase } = await requireOrg();
  const { data: products } = await supabase.from("shop_products").select("id, name, kind").eq("organisation_id", org.id).neq("status", "archived").order("position");
  return (
    <>
      <PageHeader title="Shop settings" subtitle="Card payments use the Stripe account connected under Settings → Integrations. Subscription cards are saved in your Stripe account." />
      <ShopSettingsForm orgId={org.id} initial={readShop(org.settings)} shopUrl={`${appBaseUrl()}/shop/${org.slug}`} />
      <BoxesForm initial={readShop(org.settings).boxes} products={(products ?? []) as { id: string; name: string; kind: string }[]} />
      <SiteNavForm initial={readSiteNav(org.settings)} />
    </>
  );
}
