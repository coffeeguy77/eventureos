import { requireOrg } from "@/lib/context";
import { readShop } from "@/lib/shop/core";
import { appBaseUrl } from "@/lib/integrations/registry";
import { PageHeader } from "@/components/ui/page-header";
import { ShopSettingsForm } from "@/components/store/settings-form";
import { SiteNavForm } from "@/components/store/site-nav-form";
import { BoxesForm } from "@/components/store/boxes-form";
import { readSiteNav } from "@/lib/site-nav";
import { AusPostForm, ShopEmailsForm } from "@/components/store/fulfilment-forms";
import { readShopImport } from "@/lib/shop/email-import";
import { readAusPost } from "@/lib/shop/auspost";

export const dynamic = "force-dynamic";

export default async function ShopSettingsPage() {
  const { org, supabase } = await requireOrg();
  const { data: gm } = await supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle();
  const imp = readShopImport(org.settings, org.name);
  const { data: products } = await supabase.from("shop_products").select("id, name, kind").eq("organisation_id", org.id).neq("status", "archived").order("position");
  return (
    <>
      <PageHeader title="Shop settings" subtitle="Card payments use the Stripe account connected under Settings → Integrations. Subscription cards are saved in your Stripe account." />
      <ShopSettingsForm orgId={org.id} initial={readShop(org.settings)} shopUrl={`${appBaseUrl()}/shop/${org.slug}`} />
      <BoxesForm initial={readShop(org.settings).boxes} products={(products ?? []) as { id: string; name: string; kind: string }[]} />
      <ShopEmailsForm initial={{ enabled: imp.enabled, subjects: imp.subjects, since: imp.since }} gmail={!!gm && ["connected", "syncing", "error"].includes(gm.status as string)} />
      <AusPostForm initial={readAusPost(org.settings)} />
      <SiteNavForm initial={readSiteNav(org.settings)} />
    </>
  );
}
