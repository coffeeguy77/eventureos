import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { PlanAppsForm } from "@/components/admin/plan-apps";
import { planApps } from "@/lib/apps-plans";

export const metadata = { title: "Plans & apps" };

export default async function PlansPage() {
  const supabase = await createClient();
  const { plans, ready, set } = await planApps(supabase);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Plans & apps" subtitle="Which apps each plan includes. New clients start with their plan's apps; anything you add on top shows as an add-on. Changing this doesn't change existing clients." />
      {!ready && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900">Run <span className="font-mono">supabase/migrations/0068_client_accounts.sql</span> in Supabase first.</p>}
      {ready && !set && <p className="mb-4 rounded-lg bg-zinc-50 px-4 py-3 text-[0.8125rem] text-ink-muted">Not set yet, so every plan includes every app.</p>}
      <PlanAppsForm initial={plans} />
    </div>
  );
}
