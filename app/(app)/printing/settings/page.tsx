import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { appBaseUrl } from "@/lib/integrations/registry";
import { readPrinting } from "@/lib/printing/core";
import { PageHeader } from "@/components/ui/page-header";
import { PrintSettingsForm } from "@/components/printing/settings-form";

export default async function PrintSettingsPage() {
  const { org } = await requireOrg();
  return (
    <div>
      <PageHeader eyebrow={<Link href="/printing" className="hover:underline">Printing</Link>} title="Printing settings" />
      <PrintSettingsForm initial={readPrinting(org.settings)} pageUrl={`${appBaseUrl()}/hire/${org.slug}/printing`} />
    </div>
  );
}
