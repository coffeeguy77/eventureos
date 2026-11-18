import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Business Sales" };

export default async function BusinessSaleLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (!canManage(role)) redirect("/dashboard");
  const { error } = await supabase.from("sale_units").select("id", { head: true, count: "exact" }).limit(1);
  if (error && /sale_units/.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Business Sales needs a database update first: run <span className="font-mono">supabase/migrations/0110_business_sales.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return <>{children}</>;
}
