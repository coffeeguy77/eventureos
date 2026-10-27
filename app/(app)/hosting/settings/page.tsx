import { requireOrg } from "@/lib/context";
import { readHosting } from "@/lib/hosting/core";
import { HostingSettingsForm } from "@/components/hosting/settings-form";

export default async function HostingSettingsPage() {
  const { org } = await requireOrg();
  return <HostingSettingsForm initial={readHosting(org.settings)} orgName={org.name} />;
}
