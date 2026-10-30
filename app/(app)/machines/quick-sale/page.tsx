import { requireOrg } from "@/lib/context";
import { readMachines } from "@/lib/machines/core";
import { loadCustomers, loadPriceList } from "@/lib/machines/load";
import { PageHeader } from "@/components/ui/page-header";
import { QuickSale } from "@/components/machines/quick-sale";

export const dynamic = "force-dynamic";

export default async function QuickSalePage() {
  const { supabase, org } = await requireOrg();
  const [customers, priceList] = await Promise.all([loadCustomers(supabase, org.id), loadPriceList(supabase, org.id)]);
  return (
    <div>
      <PageHeader title="Quick sale" subtitle="Choose or add the client, tap what they're buying, and get a draft invoice." />
      <QuickSale customers={customers} priceList={priceList} settings={readMachines(org.settings)} />
    </div>
  );
}
