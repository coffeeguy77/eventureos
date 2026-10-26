import { requireOrg } from "@/lib/context";
import { invoicePdf } from "@/lib/invoices/document";
import { pdfResponse } from "@/lib/payments/receipt";

/** Staff: the invoice PDF the customer sees. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const { data: inv } = await supabase.from("invoices").select("id").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  const r = inv ? await invoicePdf(id) : null;
  if (!r) return new Response("Invoice not found (drafts don't have a PDF yet)", { status: 404 });
  return pdfResponse(r, new URL(req.url).searchParams.has("download"));
}
