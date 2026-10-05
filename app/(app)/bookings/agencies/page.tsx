import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { money } from "@/lib/format";
import { AgencyEditor, ApproveInvoice } from "@/components/bookings/agency-tools";
import { CaseManagers, type CM } from "@/components/bookings/case-managers";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

type A = { id: string; name: string; code: string; customer_id: string | null; price: number | null; contact_label: string; po_label: string; site_label: string; po_required: boolean; notify_email: string | null; active: boolean; customer: { name: string } | null };
type D = { id: string; reference: string; contact_name: string; po_number: string | null; agency: { name: string } | null; invoice: { id: string; number: string; total: number; status: string; line_items: { description?: string }[] | null; customer: { name: string; xero_contact_id: string | null } | null } };

export default async function AgenciesPage() {
  const { supabase, org, role } = await requireOrg();
  const [{ data, error }, { data: drafts }] = await Promise.all([
    supabase.from("booking_agencies").select("id, name, code, customer_id, price, contact_label, po_label, site_label, po_required, notify_email, active, customer:customers(name)").eq("organisation_id", org.id).order("name"),
    supabase.from("bookings").select("id, reference, contact_name, po_number, agency:booking_agencies(name), invoice:invoices!inner(id, number, total, status, line_items, customer:customers(name, xero_contact_id))").eq("organisation_id", org.id).eq("invoice.status", "draft").order("created_at"),
  ]);
  if (error) return <Card className="p-6 text-[0.875rem] text-ink-muted">Run the 0049 database update (bookings) in Supabase first.</Card>;
  const agencies = (data ?? []) as unknown as A[];
  const list = (drafts ?? []) as unknown as D[];
  const canApprove = ["owner", "admin", "manager"].includes(role);
  // Case managers per agency (quietly none before the 0052 update), how many job seekers each has booked, and CRM contacts to import
  const { data: cms, error: cmErr } = await supabase.from("booking_case_managers").select("id, agency_id, name, email, phone, site, active, source, last_used_at").eq("organisation_id", org.id).order("active", { ascending: false }).order("name");
  const counts = new Map<string, number>();
  if (!cmErr && (cms ?? []).length) {
    const { data: bk } = await supabase.from("bookings").select("case_manager_id").eq("organisation_id", org.id).not("case_manager_id", "is", null).limit(10000);
    for (const r of (bk ?? []) as { case_manager_id: string }[]) counts.set(r.case_manager_id, (counts.get(r.case_manager_id) ?? 0) + 1);
  }
  const crm = new Map<string, number>();
  for (const a of agencies.filter((x) => x.customer_id)) {
    const { count } = await createServiceClient().from("contacts").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("customer_id", a.customer_id!).not("email", "is", null);
    crm.set(a.id, count ?? 0);
  }
  const portalUrl = `${appBaseUrl()}/book/${org.slug}/agency`;

  return (
    <>
      <PageHeader title="Agencies" subtitle="Employment services who book students with a code and purchase order. Each booking makes a draft invoice for you to check — nothing goes to Xero until you approve it." />
      <section className="mb-6">
        <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Draft invoices to check {list.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.75rem] text-amber-900">{list.length}</span>}</h2>
        {list.length === 0 ? <Card><EmptyState title="Nothing to check">When an agency books a student, the draft invoice shows up here.</EmptyState></Card> : (
          <Card className="divide-y divide-line overflow-hidden">
            {list.map((d) => (
              <div key={d.id} className="flex flex-wrap items-start gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.875rem] font-semibold text-ink">{d.invoice.number} · {d.invoice.customer?.name ?? d.agency?.name} · {money(d.invoice.total, org.currency, { cents: true })}</p>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-[0.78rem] leading-snug text-ink-muted">{(d.invoice.line_items ?? []).map((l) => l.description).filter(Boolean).join("\n\n")}</pre>
                  {!d.invoice.customer?.xero_contact_id && <p className="mt-1 text-[0.75rem] text-amber-800">This client isn&apos;t linked to a Xero contact yet, so it can&apos;t go to Xero.</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link href={`/invoices/${d.invoice.id}`} className="inline-flex h-8 items-center rounded-lg px-3 text-[0.78rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">Open</Link>
                  {canApprove && <ApproveInvoice id={d.invoice.id} />}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
      <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Agencies</h2>
      <div className="space-y-3">
        {agencies.map((a) => (
          <div key={a.id} className="space-y-2">
            <AgencyEditor agency={{ ...a, customer_name: a.customer?.name ?? null }} />
            {cmErr ? <p className="px-1 text-[0.75rem] text-ink-muted">Run the 0052 database update to add case managers.</p> : (
              <CaseManagers agencyId={a.id} agencyName={a.name} portalUrl={portalUrl} canManage={canApprove} crmContacts={crm.get(a.id) ?? 0}
                list={((cms ?? []) as (Omit<CM, "seekers"> & { agency_id: string })[]).filter((c) => c.agency_id === a.id).map((c) => ({ ...c, seekers: counts.get(c.id) ?? 0 }))} />
            )}
          </div>
        ))}
        <AgencyEditor agency={null} />
      </div>
    </>
  );
}
