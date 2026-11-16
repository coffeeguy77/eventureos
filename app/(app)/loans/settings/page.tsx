import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { defaultPrivacy } from "@/lib/loans/docs";
import { LoanSettingsForm } from "@/components/loans/settings-form";

export const dynamic = "force-dynamic";

export default async function LoanSettingsPage() {
  const { org, role } = await requireOrg();
  const ls = ((org.settings ?? {}) as { loans?: { privacy?: string; credit_guide?: { path?: string; name?: string; at?: string } | null } }).loans ?? {};
  return (
    <div className="max-w-3xl">
      <Link href="/loans" className="mb-2 inline-flex items-center gap-1 text-[0.8125rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Loan files</Link>
      <PageHeader title="Loan file settings" subtitle="What every client sees and ticks before they send their application." />
      <LoanSettingsForm canEdit={role === "owner" || role === "admin"} privacy={ls.privacy?.trim() || ""} placeholder={defaultPrivacy(org.name)} guide={ls.credit_guide?.path ? { name: ls.credit_guide.name ?? "Credit Guide.pdf", at: ls.credit_guide.at ?? null } : null} />
    </div>
  );
}
