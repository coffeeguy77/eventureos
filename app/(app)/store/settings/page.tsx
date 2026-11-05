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
import { Card, CardHeader } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";

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
      {imp.enabled && (
        <Card className="mt-6">
          <CardHeader title="Recent order emails" subtitle={`What happened to each WooCommerce order email read from Gmail. Only emails whose subject starts with ${imp.subjects.map((x) => `“${x}”`).join(" or ")} are read.`} />
          {imp.log.length === 0 ? <p className="border-t border-line px-5 py-5 text-[0.8125rem] text-ink-muted">Nothing read yet — results show here after the next check (every 10 minutes, or “Check for new orders now”).</p> : (
            <ul className="divide-y divide-line border-t border-line">
              {imp.log.map((x) => (
                <li key={x.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-[0.8125rem] sm:px-5">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${x.result === "imported" ? "bg-emerald-100 text-emerald-800" : x.result === "duplicate" || x.result === "bookings" ? "bg-zinc-100 text-ink-muted" : "bg-rose-100 text-rose-800"}`}>
                    {x.result === "imported" ? "Added" : x.result === "duplicate" ? "Already in" : x.result === "bookings" ? "Not a shop order" : x.result === "unreadable" ? "Couldn't read" : "Error"}
                  </span>
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="break-words text-ink">{x.number ? `#${x.number} · ` : ""}{x.subject}</p>
                    <p className="text-[0.75rem] text-ink-muted">{x.sent ? `Emailed ${fmtDateTime(x.sent, org.timezone)}` : ""}{x.detail ? `${x.sent ? " · " : ""}${x.detail}` : ""}</p>
                  </div>
                  <a href={`https://mail.google.com/mail/u/0/#all/${x.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[0.75rem] font-medium text-brand-700 hover:underline">Open in Gmail</a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <AusPostForm initial={readAusPost(org.settings)} />
      <SiteNavForm initial={readSiteNav(org.settings)} />
    </>
  );
}
