import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { readPrinting } from "@/lib/printing/core";
import { PageHeader } from "@/components/ui/page-header";
import { JobEditor } from "@/components/printing/job-editor";

export const dynamic = "force-dynamic";

export default async function NewPrintJobPage() {
  const { org } = await requireOrg();
  return (
    <div>
      <PageHeader eyebrow={<Link href="/printing" className="hover:underline">Printing</Link>} title="New print job" />
      <JobEditor id={null} orgId={org.id} rates={readPrinting(org.settings)} initial={{ status: "new", setup: true, cut: false, items: [], extras: [] }} />
    </div>
  );
}
