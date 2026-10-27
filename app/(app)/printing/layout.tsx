import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Printing" };

export default async function PrintingLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (!canManage(role)) redirect("/dashboard");
  const { error } = await supabase.from("print_jobs").select("id", { head: true, count: "exact" }).limit(1);
  if (error && /print_jobs/.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Printing needs its database update first: run <span className="font-mono">supabase/migrations/0073_printing.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return <>{children}</>;
}
