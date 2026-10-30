import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { cleanJobItems, JOB_KINDS, JOB_STATUS, readMachines, type MachineJobKind, type MachineJobStatus } from "@/lib/machines/core";
import { loadCustomers, loadPriceList } from "@/lib/machines/load";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { MachineJobEditor } from "@/components/machines/job-editor";

export const dynamic = "force-dynamic";

export default async function MachineJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: job } = await supabase.from("machine_jobs").select("*").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!job) notFound();
  const [customers, priceList, inv] = await Promise.all([
    loadCustomers(supabase, org.id), loadPriceList(supabase, org.id),
    job.invoice_id ? supabase.from("invoices").select("id, number").eq("id", job.invoice_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  const st = JOB_STATUS[job.status as MachineJobStatus] ?? JOB_STATUS.new;
  return (
    <div>
      <PageHeader eyebrow={<Link href="/machines" className="hover:underline">Coffee machines</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{job.number} · {JOB_KINDS[job.kind as MachineJobKind]}<Badge tone={st.tone}>{st.label}</Badge></span>}
        subtitle={job.source === "online" ? `Sent from the website ${new Date(job.created_at as string).toLocaleString("en-AU", { timeZone: org.timezone, dateStyle: "medium", timeStyle: "short" })}` : undefined} />
      <MachineJobEditor id={job.id as string} number={job.number as string} settings={readMachines(org.settings)} customers={customers} priceList={priceList}
        invoice={inv ? { id: inv.id as string, number: inv.number as string } : null}
        initial={{
          kind: job.kind, status: job.status, customer_id: job.customer_id, contact_name: job.contact_name, contact_email: job.contact_email, contact_phone: job.contact_phone,
          company: job.company, site_address: job.site_address, brand: job.brand, model: job.model, serial: job.serial, issue: job.issue, preferred: job.preferred,
          booked_for: job.booked_for, callout: job.callout, hours: Number(job.hours), items: cleanJobItems(job.items), internal_notes: job.internal_notes,
        }} />
    </div>
  );
}
