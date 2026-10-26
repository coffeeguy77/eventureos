import { createServiceClient } from "@/lib/integrations/runtime";
import { invoicePdf } from "@/lib/invoices/document";
import { pdfResponse } from "@/lib/payments/receipt";

/** The tax invoice PDF from the private pay link. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return new Response("Invoice not found", { status: 404 });
  const { data: inv } = await createServiceClient().from("invoices").select("id").eq("pay_token", token).maybeSingle();
  const r = inv ? await invoicePdf(inv.id as string) : null;
  if (!r) return new Response("Invoice not found", { status: 404 });
  return pdfResponse(r, new URL(req.url).searchParams.has("download"));
}
