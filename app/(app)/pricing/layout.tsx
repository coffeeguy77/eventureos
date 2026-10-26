import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { PricingNav } from "@/components/pricing/nav";
import { pricingReady } from "@/lib/pricing/data";

export const metadata = { title: "Pricing" };

export default async function PricingLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (!canManage(role)) redirect("/dashboard");
  if (!(await pricingReady(supabase))) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Pricing needs its database update first: run <span className="font-mono">supabase/migrations/0070_pricing.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return <div><PricingNav />{children}</div>;
}
