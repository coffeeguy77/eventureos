import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { allPages } from "@/lib/supabase/all-pages";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AccountForm } from "@/components/marketing/account-form";

export const dynamic = "force-dynamic";

export default async function NewMarketingClient() {
  const { supabase, org } = await requireOrg();
  const { data: clients } = await allPages<{ id: string; name: string }>((a, b) => supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").order("id").range(a, b));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={<Link href="/marketing" className="hover:text-ink">Marketing</Link>} title="Add a client" subtitle="Choose what to bring in for them, and how much the AI may do." />
      <Card>
        <CardHeader title="Client" />
        <AccountForm id={null} clients={clients} currency={org.currency}
          initial={{ name: "", customer_id: null, ads_customer_id: null, ga4_property: null, gsc_site: null, mode: "auto", monthly_cap: null, target_cpa: null, goals: null, max_changes: 10, report_to: "", active: true }} />
      </Card>
    </div>
  );
}
