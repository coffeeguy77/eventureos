import { requirePortal } from "../../portal-data";
import { pdfResponse, receiptPdf } from "@/lib/payments/receipt";

/** A payment receipt, for the signed-in customer whose invoice it was. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, customerIds } = await requirePortal(slug);
  const { data: p } = await supabase.from("payments").select("id, invoice_id").eq("id", id).maybeSingle();
  if (!p?.invoice_id) return new Response("Receipt not found", { status: 404 });
  const { data: inv } = await supabase.from("invoices").select("customer_id").eq("id", p.invoice_id).maybeSingle();
  if (!inv || !customerIds.includes(inv.customer_id as string)) return new Response("Receipt not found", { status: 404 });
  const r = await receiptPdf(id);
  if (!r) return new Response("Receipt not found", { status: 404 });
  return pdfResponse(r, new URL(req.url).searchParams.has("download"));
}
