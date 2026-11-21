import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { MarketingNav } from "@/components/marketing/nav";

export const metadata = { title: "Marketing" };

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (role === "staff" || role === "customer") redirect("/dashboard");

  // Honest state if the database update hasn't been run yet.
  const { error } = await supabase.from("marketing_connections").select("id", { head: true, count: "exact" }).limit(1);
  if (error && /marketing_connections/.test(error.message) && /does not exist/i.test(error.message)) {
    return (
      <div>
        <PageHeader title="Marketing" subtitle="Client reporting from Google Analytics." />
        <Card className="p-6 text-[0.875rem] text-ink-muted">
          Marketing needs its database update first: run <span className="font-mono">supabase/migrations/0103_marketing.sql</span> in Supabase (SQL editor), then refresh.
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Marketing" subtitle="Each client's Google Analytics in one place — sales, revenue and where they come from." />
      <MarketingNav canManage={canManage(role)} />
      {children}
    </div>
  );
}
