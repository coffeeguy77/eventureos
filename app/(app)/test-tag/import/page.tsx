import { requireOrg } from "@/lib/context";
import { actorName } from "@/lib/activity";
import { readTagSettings } from "@/lib/testtag/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TagNav } from "@/components/testtag/nav";
import { ImportPanel } from "@/components/testtag/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import tests" };

export default async function TagImport() {
  const { org, profile } = await requireOrg();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Test & Tag" title="Import from your tester" subtitle="Metrel ES Manager / PATLink export, or any CSV or Excel file of tests" />
      <TagNav active="/test-tag/import" />
      <Card><ImportPanel ownName={org.name} defaultInterval={readTagSettings(org.settings).defaultInterval} me={actorName(profile)} /></Card>
    </div>
  );
}
