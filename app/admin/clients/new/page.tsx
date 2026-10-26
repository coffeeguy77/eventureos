import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { NewClientForm } from "@/components/admin/new-client-form";
import { planApps } from "@/lib/apps-plans";
import { BUSINESS_TYPES, TIMEZONES } from "@/app/(app)/settings/constants";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  const supabase = await createClient();
  const { plans, ready } = await planApps(supabase);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New client" subtitle="Set up a business on EventureOS, choose its apps and invite its owner. You can open it with a support session to set it up or import their data before they log in." />
      {!ready && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900">Run <span className="font-mono">supabase/migrations/0068_client_accounts.sql</span> in Supabase before creating clients.</p>}
      <NewClientForm plans={plans} businessTypes={BUSINESS_TYPES} timezones={TIMEZONES} />
    </div>
  );
}
