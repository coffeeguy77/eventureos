import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { AccountsNav } from "@/components/accounts/nav";

export const metadata = { title: "Accounts" };

export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role } = await requireOrg();
  if (!canManage(role)) redirect("/dashboard");
  const { error } = await supabase.from("collection_notes").select("id").limit(1);
  if (error && /does not exist|could not find/i.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Accounts needs its database update first: run <span className="font-mono">supabase/migrations/0072_access_accounts.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return <div><AccountsNav />{children}</div>;
}
