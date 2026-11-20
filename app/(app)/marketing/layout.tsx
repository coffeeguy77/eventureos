import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Marketing" };

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (!canManage(role)) redirect("/dashboard");
  const { error } = await supabase.from("mk_accounts").select("id", { head: true, count: "exact" }).limit(1);
  if (error && /mk_accounts/.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Marketing needs its database update first: run <span className="font-mono">supabase/migrations/0114_marketing.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return <div>{children}</div>;
}
