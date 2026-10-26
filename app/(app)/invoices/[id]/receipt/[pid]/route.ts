import { requireOrg } from "@/lib/context";
import { pdfResponse, receiptPdf } from "@/lib/payments/receipt";

/** Staff: the same receipt the customer sees, to send or print. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  const { supabase, org } = await requireOrg();
  const { data: p } = await supabase.from("payments").select("id").eq("id", pid).eq("invoice_id", id).eq("organisation_id", org.id).maybeSingle();
  if (!p) return new Response("Receipt not found", { status: 404 });
  const r = await receiptPdf(pid);
  if (!r) return new Response("Receipt not found", { status: 404 });
  return pdfResponse(r, new URL(req.url).searchParams.has("download"));
}
