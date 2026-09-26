import { canManage, requireOrg } from "@/lib/context";
import { PricingEditor } from "./editor";
import type { PackageRules } from "@/lib/pricing/engine";

export const metadata = { title: "Services & pricing" };

export default async function PricingPage() {
  const { supabase, org, role } = await requireOrg();
  const [svcRes, pkgRes] = await Promise.all([
    supabase.from("services").select("id, code, name, description, category, unit, unit_price, tax_rate, xero_account_code, active, position")
      .eq("organisation_id", org.id).order("position").order("name"),
    supabase.from("service_packages").select("id, name, summary, rules, active, position").eq("organisation_id", org.id).order("position").order("name"),
  ]);
  if (svcRes.error) throw new Error(`Could not load services: ${svcRes.error.message}`);
  if (pkgRes.error) throw new Error(`Could not load packages: ${pkgRes.error.message}`);
  const services = (svcRes.data ?? []).map((s) => ({ ...s, unit_price: Number(s.unit_price), tax_rate: Number(s.tax_rate) }));
  const packages = (pkgRes.data ?? []).map((p) => ({ ...p, rules: (p.rules ?? {}) as PackageRules }));
  return <PricingEditor services={services} packages={packages} canEdit={canManage(role)} currency={org.currency} />;
}
