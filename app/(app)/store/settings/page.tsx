import { requireOrg } from "@/lib/context";
import { readShop } from "@/lib/shop/core";
import { appBaseUrl } from "@/lib/integrations/registry";
import { PageHeader } from "@/components/ui/page-header";
import { ShopSettingsForm } from "@/components/store/settings-form";
import { SiteNavForm } from "@/components/store/site-nav-form";
import { readSiteNav } from "@/lib/site-nav";

export const dynamic = "force-dynamic";

export default async function ShopSettingsPage() {
  const { org } = await requireOrg();
  return (
    <>
      <PageHeader title="Shop settings" subtitle="Card payments use the Stripe account connected under Settings → Integrations. Subscription cards are saved in your Stripe account." />
      <ShopSettingsForm orgId={org.id} initial={readShop(org.settings)} shopUrl={`${appBaseUrl()}/shop/${org.slug}`} />
      <SiteNavForm initial={readSiteNav(org.settings)} />
    </>
  );
}
