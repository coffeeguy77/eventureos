import { requirePortal } from "../../portal-data";
import { invoicePdf } from "@/lib/invoices/document";
import { pdfResponse } from "@/lib/payments/receipt";

/** The tax invoice PDF (paid ones show the payments and a zero balance), for the signed-in customer it's for. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, org, customerIds } = await requirePortal(slug);
  const { data: inv } = await supabase.from("invoices").select("customer_id").eq("id", id).eq("organisation_id", org.id).neq("status", "draft").maybeSingle();
  if (!inv || !customerIds.includes(inv.customer_id as string)) return new Response("Invoice not found", { status: 404 });
  const r = await invoicePdf(id);
  if (!r) return new Response("Invoice not found", { status: 404 });
  return pdfResponse(r, new URL(req.url).searchParams.has("download"));
}
