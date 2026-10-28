import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { NerdNav } from "@/components/nerdherd/nav";

export const metadata = { title: "Nerd Herd" };

export default async function NerdHerdLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (role === "staff" || role === "customer") redirect("/dashboard");
  const { error } = await supabase.from("support_tickets").select("id", { head: true, count: "exact" }).limit(1);
  if (error && /support_tickets/.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Nerd Herd needs its database update first: run <span className="font-mono">supabase/migrations/0076_nerd_herd.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return (
    <div>
      <PageHeader title="Nerd Herd" subtitle="Support tickets, maintenance, websites and plans for every client." />
      <NerdNav canManage={canManage(role)} />
      {children}
    </div>
  );
}
