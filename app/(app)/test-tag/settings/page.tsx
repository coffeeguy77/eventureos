import { requireOrg } from "@/lib/context";
import { readTagSettings } from "@/lib/testtag/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TagNav } from "@/components/testtag/nav";
import { TagSettingsForm } from "@/components/testtag/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test & Tag settings" };

export default async function TagSettingsPage() {
  const { org } = await requireOrg();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Test & Tag" title="Settings" subtitle="Tag codes, what's printed on labels, and the printer" />
      <TagNav active="/test-tag/settings" />
      <Card><TagSettingsForm initial={readTagSettings(org.settings)} /></Card>
    </div>
  );
}
