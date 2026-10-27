import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { cleanExtras, cleanItems, readPrinting } from "@/lib/printing/core";
import { PRINT_STATUS } from "@/lib/printing/status";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { JobEditor } from "@/components/printing/job-editor";
import type { JobStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function PrintJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: job } = await supabase.from("print_jobs").select("*").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!job) notFound();
  const [{ data: files }, { data: inv }] = await Promise.all([
    supabase.from("print_files").select("id, name, path, size, uploaded_by, created_at").eq("job_id", job.id).order("created_at"),
    job.invoice_id ? supabase.from("invoices").select("id, number").eq("id", job.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  type F = { id: string; name: string; path: string; size: number | null; uploaded_by: string; created_at: string };
  const F = (files ?? []) as F[];
  // download links last an hour; made with the service key after the job was checked against this business
  const signed = F.length ? (await createServiceClient().storage.from("print-artwork").createSignedUrls(F.map((f) => f.path), 3600, { download: true })).data ?? [] : [];
  const st = PRINT_STATUS[job.status as string] ?? PRINT_STATUS.new;
  return (
    <div>
      <PageHeader eyebrow={<Link href="/printing" className="hover:underline">Printing</Link>} title={<span className="flex flex-wrap items-center gap-2">{job.number} · {job.title}<Badge tone={st.tone}>{st.label}</Badge></span>}
        subtitle={job.source === "online" ? `Sent from the website ${new Date(job.created_at as string).toLocaleDateString("en-AU", { dateStyle: "medium" })}` : undefined} />
      <JobEditor id={job.id as string} orgId={org.id} rates={readPrinting(org.settings)} quoteSentAt={(job.quote_sent_at as string) ?? null}
        invoice={inv ? { id: inv.id as string, number: inv.number as string } : null} customerHref={job.customer_id ? `/clients/${job.customer_id}` : null}
        files={F.map((f, k) => ({ id: f.id, name: f.name, size: f.size == null ? null : Number(f.size), uploaded_by: f.uploaded_by, created_at: f.created_at, url: signed[k]?.signedUrl ?? null }))}
        initial={{
          title: job.title, details: job.details, status: job.status as JobStatus, contact_name: job.contact_name, contact_email: job.contact_email, contact_phone: job.contact_phone,
          company: job.company, customer_id: job.customer_id, items: cleanItems(job.items), setup: job.setup, cut: job.cut, extras: cleanExtras(job.extras), needed_by: job.needed_by, internal_notes: job.internal_notes,
        }} />
    </div>
  );
}
