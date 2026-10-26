import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { HireSettingsForm } from "@/components/rentals/settings-form";
import { HireSwitch } from "@/components/rentals/hire-switch";
import { Card } from "@/components/ui/card";
import { readHireSettings } from "@/lib/hire/core";
import { orgAppAccess } from "@/lib/apps-server";

export const metadata = { title: "Hire settings" };

export default async function HireSettingsPage() {
  const { org, role } = await requireOrg();
  if (!canManage(role)) redirect("/rentals");
  const s = readHireSettings(org.settings);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <HireSettingsForm initial={s} orgId={org.id} currency={org.currency} shopUrl={`/hire/${org.slug}/shop`} />
      {!(await orgAppAccess(org.id)) && <Card className="p-5"><HireSwitch on /></Card>}
    </div>
  );
}
