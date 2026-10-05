import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { loadProducts, loadSubs, shopOrgById, subDelivery } from "@/lib/shop/server";
import { addressLine, frequencyLabel, SUB_STATUS, type Address } from "@/lib/shop/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
const TABS = [{ k: "live", label: "Active & paused" }, { k: "attention", label: "Needs attention" }, { k: "woo", label: "Still billed in WooCommerce" }, { k: "cancelled", label: "Cancelled" }];

export default async function SubsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab ?? "live";
  const { org } = await requireOrg();
  const db = createServiceClient();
  const shop = await shopOrgById(db, org.id);
  const [subs, products] = await Promise.all([loadSubs(db, org.id, {}), loadProducts(db, org.id, { all: true })]);
  const { data: custs } = await db.from("shop_customers").select("id, name, email").eq("organisation_id", org.id);
  const cmap = new Map((custs ?? []).map((c) => [c.id as string, c]));
  const list = subs.filter((s) => tab === "live" ? ["active", "paused", "pending"].includes(s.status) && s.billing !== "woocommerce"
    : tab === "attention" ? s.status === "payment_failed" : tab === "woo" ? s.billing === "woocommerce" && s.status !== "cancelled" : s.status === "cancelled");
  const active = subs.filter((s) => s.status === "active");
  const monthly = active.reduce((a, s) => {
    const per = subDelivery(s, products ?? [], shop.shop, null).total;
    const perMonth = s.interval_unit === "month" ? per / s.interval_count : (per * 52) / 12 / s.interval_count;
    return a + (s.billing === "prepaid" ? 0 : perMonth);
  }, 0);
  return (
    <>
      <PageHeader title="Subscriptions" subtitle={`${active.length} active · about ${money(monthly, org.currency)} a month from card and WooCommerce subscriptions`} />
      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => <Link key={t.k} href={`/store/subscriptions?tab=${t.k}`} className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium", t.k === tab ? "bg-ink text-white" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{t.label}</Link>)}
      </div>
      {list.length === 0 ? <Card><EmptyState title="None here">Subscriptions started in the shop (or imported from WooCommerce) appear here.</EmptyState></Card> : (
        <Card className="divide-y divide-line overflow-hidden">
          {list.map((s) => {
            const c = cmap.get(s.customer_id);
            const per = subDelivery(s, products ?? [], shop.shop, null).total;
            return (
              <Link key={s.id} href={`/store/subscriptions/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50">
                <div className="min-w-0 flex-1"><p className="font-medium text-ink">{c?.name ?? c?.email ?? "—"}</p><p className="truncate text-[0.75rem] text-ink-muted">{s.parcels.map((p) => p.delivery === "pickup" ? `${p.label}: pick up` : `${p.label}: ${addressLine(p.address as Address)}`).join(" · ")}</p></div>
                <div className="text-[0.8125rem] text-ink-muted">{frequencyLabel(s.interval_unit, s.interval_count)}{s.parcels.length > 1 ? ` · split ×${s.parcels.length}` : ""}</div>
                <div className="w-28 text-right text-[0.8125rem]"><p className="font-semibold text-ink">{money(per, org.currency, { cents: true })}</p><p className="text-ink-faint">{s.billing === "prepaid" ? `prepaid · ${s.prepaid_remaining} left` : s.billing === "woocommerce" ? "WooCommerce" : "card"}</p></div>
                <div className="w-32 text-right text-[0.8125rem] text-ink-muted">{s.status === "paused" ? (s.paused_until ? `back ${s.paused_until}` : "paused") : s.next_date ?? "—"}</div>
                <Badge tone={s.status === "active" ? "green" : s.status === "paused" ? "amber" : s.status === "payment_failed" ? "red" : "slate"}>{SUB_STATUS[s.status] ?? s.status}</Badge>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
