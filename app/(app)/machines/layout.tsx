import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { MachinesNav } from "@/components/machines/nav";

export const metadata = { title: "Coffee machines" };

export default async function MachinesLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (!canManage(role)) redirect("/dashboard");
  const { error } = await supabase.from("machine_jobs").select("id", { head: true, count: "exact" }).limit(1);
  if (error && /machine_jobs/.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Coffee machines needs its database update first: run <span className="font-mono">supabase/migrations/0082_machine_jobs.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return <><MachinesNav />{children}</>;
}
