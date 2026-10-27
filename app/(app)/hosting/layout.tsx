import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { readHosting } from "@/lib/hosting/core";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HostingNav } from "@/components/hosting/nav";

export const metadata = { title: "Hosting" };

export default async function HostingLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role, org } = await requireOrg();
  if (!canManage(role)) redirect("/dashboard");
  const { error } = await supabase.from("hosting_accounts").select("id", { head: true, count: "exact" }).limit(1);
  if (error && /hosting_accounts/.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Hosting needs its database update first: run <span className="font-mono">supabase/migrations/0074_hosting.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  const s = readHosting(org.settings);
  return (
    <div>
      <PageHeader title={s.menuLabel === "Hosting" ? "Hosting" : `${s.menuLabel} · Hosting`} subtitle={s.dryRun ? <span className="font-medium text-amber-700">Dry run is on — nothing is suspended, unsuspended or emailed; it's logged as what would happen.</span> : "Live — suspensions and notices really happen."} />
      <HostingNav />
      {children}
    </div>
  );
}
