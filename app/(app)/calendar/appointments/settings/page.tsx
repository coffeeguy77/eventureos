import { canManage, requireOrg } from "@/lib/context";
import { readApptSettings } from "@/lib/appointments/core";
import { appBaseUrl } from "@/lib/integrations/registry";
import { ApptSettingsForm } from "@/components/appointments/settings-form";

export const metadata = { title: "Booking settings" };

export default async function ApptSettingsPage() {
  const { org, role } = await requireOrg();
  return <ApptSettingsForm initial={readApptSettings(org.settings)} canEdit={canManage(role)} bookingUrl={`${appBaseUrl()}/meet/${org.slug}`} tz={org.timezone} />;
}
