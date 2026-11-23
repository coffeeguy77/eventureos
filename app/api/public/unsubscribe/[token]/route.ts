import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** One-click unsubscribe (List-Unsubscribe-Post) from mail clients; a GET goes to the page with a button. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) return NextResponse.json({ ok: false }, { status: 404 });
  const db = createServiceClient();
  const { data } = await db.from("nh_mailout_sends").select("customer_id").eq("token", token).maybeSingle();
  if (data?.customer_id) await db.from("customers").update({ unsubscribed_at: new Date().toISOString() }).eq("id", data.customer_id).is("unsubscribed_at", null);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/unsubscribe/${encodeURIComponent(token)}`, req.url));
}
