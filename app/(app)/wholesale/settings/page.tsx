import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { WholesaleSettingsForm } from "@/components/wholesale/settings-form";
import { readWholesale } from "@/lib/wholesale/settings";

export const dynamic = "force-dynamic";

export default async function WholesaleSettingsPage() {
  const { supabase, org, role } = await requireOrg();
  const ws = readWholesale(org.settings);
  const { data: integ } = await supabase.from("integrations").select("provider, status").eq("organisation_id", org.id).in("provider", ["gmail", "stripe"]);
  const on = (p: string) => ((integ ?? []) as { provider: string; status: string }[]).some((i) => i.provider === p && ["connected", "syncing", "error"].includes(i.status));
  return (
    <Card className="max-w-3xl p-5 sm:p-6">
      <WholesaleSettingsForm canEdit={canManage(role)} gmail={on("gmail")} stripe={on("stripe")}
        initial={{ delivery_weekday: ws.deliveryWeekday, email_import: ws.emailImport.enabled, import_from: ws.emailImport.from, import_subject: ws.emailImport.subject, ordering: ws.ordering, freight: ws.freight, free_freight_over: ws.freeFreightOver }} />
    </Card>
  );
}
