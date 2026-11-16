import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LiveLoanFile } from "@/components/loans/live-file";
import { money } from "@/lib/format";
import { liveFile } from "../actions";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // the AI analysis runs from this page

export default async function LoanFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await liveFile(id);
  if (!r.ok) notFound();
  const f = r.data.file;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.eventureos.com.au";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = process.env.APP_URL?.trim() || `${proto}://${host}`;
  return (
    <div>
      <Link href="/loans" className="mb-2 inline-flex items-center gap-1 text-[0.8125rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Loan files</Link>
      <PageHeader title={f.title} subtitle={[f.contact_name, f.contact_email, f.contact_phone, f.loan_type, f.amount ? money(f.amount) : null, f.applicants > 1 ? `${f.applicants} applicants` : null].filter(Boolean).join(" · ")} />
      <LiveLoanFile initial={r.data} link={`${base}/apply/${f.token}`} />
    </div>
  );
}
