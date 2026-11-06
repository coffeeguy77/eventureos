import { requireOrg } from "@/lib/context";
import { actorName } from "@/lib/activity";
import { todayISO } from "@/lib/format";
import { readTagSettings } from "@/lib/testtag/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TagNav } from "@/components/testtag/nav";
import { TestForm } from "@/components/testtag/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test an item" };

export default async function TestNow({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const { org, profile } = await requireOrg();
  const s = readTagSettings(org.settings);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Test & Tag" title="Test an item" subtitle="Scan or type the tag, record the result, print the label" />
      <TagNav active="/test-tag/test" />
      <Card><TestForm asset={null} today={todayISO(org.timezone)} defaultInterval={s.defaultInterval} ownName={org.name} me={actorName(profile)} initialCode={typeof code === "string" ? code.slice(0, 40) : undefined} /></Card>
    </div>
  );
}
