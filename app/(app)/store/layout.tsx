import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { StoreNav } from "@/components/store/nav";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Shop" };

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, role } = await requireOrg();
  if (role === "staff") redirect("/my-jobs");
  const { count, error } = await supabase.from("shop_orders").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "paid").neq("source", "woocommerce");
  if (error && /shop_orders|does not exist|Could not find/i.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">The shop needs its database update first: run <span className="font-mono">supabase/migrations/0055_shop.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  return (
    <div>
      <StoreNav slug={org.slug} toRoast={count ?? 0} />
      {children}
    </div>
  );
}
