import { requireOrg } from "@/lib/context";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { money } from "@/lib/pricing/analysis";
import { InvoiceLink } from "@/components/pricing/invoice-link";
import { DeleteInvoice, UploadInvoices } from "@/components/pricing/invoice-tools";

export const dynamic = "force-dynamic";

/** Supplier invoices read so far, anything that couldn't be read, and uploading PDFs by hand. */
export default async function PricingInvoicesPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const sid = sp.s && /^[0-9a-f-]{36}$/i.test(sp.s) ? sp.s : null;
  let q = supabase.from("price_invoices").select("id, supplier_id, invoice_number, invoice_date, subtotal, line_count, read_by, source, notes").eq("organisation_id", org.id).order("invoice_date", { ascending: false, nullsFirst: false }).limit(300);
  if (sid) q = q.eq("supplier_id", sid);
  const [{ data: invs }, { data: sups }, { data: problems }] = await Promise.all([
    q,
    supabase.from("price_suppliers").select("id, name").eq("organisation_id", org.id).order("name"),
    supabase.from("price_email_imports").select("id, supplier_id, attachment_name, subject, received_at, status, message").eq("organisation_id", org.id).in("status", ["failed", "skipped"]).order("created_at", { ascending: false }).limit(40),
  ]);
  const supList = (sups ?? []) as { id: string; name: string }[];
  const name = (id: string | null) => supList.find((s) => s.id === id)?.name ?? "—";
  type Inv = { id: string; supplier_id: string; invoice_number: string | null; invoice_date: string | null; subtotal: number | null; line_count: number; read_by: string | null; source: string; notes: string | null };
  const list = (invs ?? []) as Inv[];
  const bad = ((problems ?? []) as { id: string; supplier_id: string | null; attachment_name: string; subject: string | null; received_at: string | null; status: string; message: string | null }[]).filter((p) => p.attachment_name !== "(none)");
  return (
    <>
      <PageHeader eyebrow="Pricing" title="Supplier invoices" subtitle="Every invoice read so far. Open the PDF to check a price, or remove an invoice that was read wrongly." />
      <Card className="mb-5 p-5"><p className="mb-2 text-[0.8125rem] font-medium text-ink">Invoices that don&apos;t come by email</p><UploadInvoices orgId={org.id} suppliers={supList} /></Card>
      <Card>
        <CardHeader title={sid ? name(sid) : "All invoices"} subtitle={`${list.length}${list.length === 300 ? "+" : ""} invoice${list.length === 1 ? "" : "s"}`} />
        {!list.length ? <EmptyState title="No invoices yet">Set up suppliers, then read their invoices from Gmail or upload PDFs.</EmptyState> : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[720px] text-[0.8125rem]">
              <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted"><th className="px-4 py-2 font-medium">Date</th><th className="px-2 py-2 font-medium">Supplier</th><th className="px-2 py-2 font-medium">Invoice</th><th className="px-2 py-2 text-right font-medium">Lines</th><th className="px-2 py-2 text-right font-medium">Subtotal (ex GST)</th><th className="px-2 py-2 font-medium">Read by</th><th className="px-2 py-2" /></tr></thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-2"><InvoiceLink id={i.id} label={i.invoice_date ? fmtDate(i.invoice_date) : "No date"} /></td>
                    <td className="px-2 py-2">{name(i.supplier_id)}</td>
                    <td className="px-2 py-2">{i.invoice_number ?? "—"}{i.notes && <span className="block max-w-[260px] text-[0.7188rem] text-amber-700">{i.notes}</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{i.line_count}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(i.subtotal == null ? null : Number(i.subtotal))}</td>
                    <td className="px-2 py-2 text-ink-muted">{i.read_by === "ai" ? "AI" : i.read_by ? "Layout" : "—"}{i.source === "upload" ? " · uploaded" : ""}</td>
                    <td className="px-2 py-2 text-right"><DeleteInvoice id={i.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {bad.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Couldn't be read or skipped" subtitle="Failed ones are tried again on the next read." />
          <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
            {bad.map((p) => <li key={p.id} className="px-5 py-2.5"><span className="font-medium text-ink">{name(p.supplier_id)} · {p.attachment_name}</span><span className="block text-[0.75rem] text-ink-muted">{p.status === "failed" ? "Couldn't read: " : "Skipped: "}{p.message}{p.received_at ? ` · ${fmtDate(p.received_at.slice(0, 10), "short")}` : ""}</span></li>)}
          </ul>
        </Card>
      )}
    </>
  );
}
