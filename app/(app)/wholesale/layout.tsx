import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { WholesaleNav } from "@/components/wholesale/nav";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Wholesale" };

export default async function WholesaleLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, role } = await requireOrg();
  if (role === "staff") redirect("/my-jobs");
  const { count, error } = await supabase.from("wholesale_orders").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).not("needs_check", "is", null).neq("status", "cancelled");
  if (error && /wholesale_orders|does not exist|Could not find/i.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Wholesale needs its database update first: run <span className="font-mono">supabase/migrations/0060_wholesale.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return (
    <div>
      <WholesaleNav toCheck={count ?? 0} />
      {children}
    </div>
  );
}
