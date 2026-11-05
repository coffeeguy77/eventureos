import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { RoasteryNav } from "@/components/roastery/nav";

export const metadata = { title: "Roastery" };

export default async function RoasteryLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (!canManage(role)) redirect("/dashboard");
  const { error } = await supabase.from("roastery_coffees").select("id", { head: true, count: "exact" }).limit(1);
  if (error && /roastery_coffees/.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Roastery needs its database update first: run <span className="font-mono text-ink">supabase/migrations/0098_roastery.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return <><RoasteryNav />{children}</>;
}
