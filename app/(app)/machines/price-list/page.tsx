import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { readMachines } from "@/lib/machines/core";
import { PageHeader } from "@/components/ui/page-header";
import { MachinePriceList, type ListItem } from "@/components/machines/price-list";

export const dynamic = "force-dynamic";

export default async function MachinePriceListPage() {
  const { supabase, org } = await requireOrg();
  const s = readMachines(org.settings);
  const { data } = await supabase.from("services").select("id, name, description, category, unit_price, tax_rate, code, unit, xero_account_code, active").eq("organisation_id", org.id)
    .in("category", s.priceCategories.length ? s.priceCategories : ["—"]).order("category").order("name");
  return (
    <div>
      <PageHeader title="Price list" subtitle={<>The things you sell — machines, parts, cleaners, service items. They&apos;re one tap onto a job, a quick sale or any invoice. Everything else is in <Link href="/settings/pricing" className="underline">Settings → Pricing</Link>.</>} />
      <MachinePriceList items={(data ?? []) as ListItem[]} categories={s.priceCategories} />
    </div>
  );
}
