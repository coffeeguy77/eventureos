import { createServiceClient } from "@/lib/integrations/runtime";
import { pdfResponse, receiptPdf } from "@/lib/payments/receipt";

/** A payment receipt from the private pay link (no sign-in needed — the link is the key, like the invoice itself). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Receipt not found", { status: 404 });
  const db = createServiceClient();
  const { data: inv } = await db.from("invoices").select("id").eq("pay_token", token).maybeSingle();
  if (!inv) return new Response("Receipt not found", { status: 404 });
  const { data: p } = await db.from("payments").select("id").eq("id", id).eq("invoice_id", inv.id).maybeSingle();
  if (!p) return new Response("Receipt not found", { status: 404 });
  const r = await receiptPdf(id);
  if (!r) return new Response("Receipt not found", { status: 404 });
  return pdfResponse(r, new URL(req.url).searchParams.has("download"));
}
