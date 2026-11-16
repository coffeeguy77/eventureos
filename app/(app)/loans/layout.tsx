import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Loan files" };

export default async function LoansLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (role === "staff" || role === "customer") redirect("/dashboard");
  const { error } = await supabase.from("loan_files").select("id", { head: true, count: "exact" }).limit(1);
  if (error && /loan_files/.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Loan files need a database update first: run <span className="font-mono">supabase/migrations/0106_loans.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return <>{children}</>;
}
