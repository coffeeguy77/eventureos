import { requireOrg } from "@/lib/context";
import { readMachines, type MachineJobKind } from "@/lib/machines/core";
import { loadCustomers, loadPriceList } from "@/lib/machines/load";
import { PageHeader } from "@/components/ui/page-header";
import { MachineJobEditor } from "@/components/machines/job-editor";

export const dynamic = "force-dynamic";

export default async function NewMachineJobPage({ searchParams }: { searchParams: Promise<{ kind?: string; customer?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const [customers, priceList] = await Promise.all([loadCustomers(supabase, org.id), loadPriceList(supabase, org.id)]);
  const kind: MachineJobKind = sp.kind === "service" || sp.kind === "install" || sp.kind === "sale" ? sp.kind : "repair";
  const c = sp.customer ? customers.find((x) => x.id === sp.customer) : undefined;
  return (
    <div>
      <PageHeader title="New coffee machine job" subtitle="Callouts charge the first hour, however short — then hourly." />
      <MachineJobEditor id={null} settings={readMachines(org.settings)} customers={customers} priceList={priceList}
        initial={{ kind, callout: kind !== "sale", status: "new", ...(c ? { customer_id: c.id, contact_name: c.name, contact_email: c.email, contact_phone: c.phone, company: c.company, site_address: c.address } : {}) }} />
    </div>
  );
}
