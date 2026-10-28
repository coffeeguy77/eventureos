import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { verifySvix } from "@/lib/email/svix";

export const dynamic = "force-dynamic";

/**
 * Resend events. email.received → a business's forwarding address (lib/email/inbound.ts). Delivery events → email_send_recipients (delivered, bounced, complained, failed, delayed; opened/clicked if
 * tracking is on for the domain). Set up in Resend → Webhooks with this URL; put the signing secret in
 * Vercel as RESEND_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET isn't set" }, { status: 503 });
  const body = await req.text();
  const ok = verifySvix(secret, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, body);
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let evt: { type?: string; created_at?: string; data?: { email_id?: string; to?: string[]; received_for?: string[] } };
  try { evt = JSON.parse(body); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const id = evt.data?.email_id;
  if (!evt.type || !id) return NextResponse.json({ ignored: true });
  // Mail sent to a business's forwarding address → read it like Gmail (enquiries, client emails, tickets)
  if (evt.type === "email.received") {
    try {
      const { handleReceived } = await import("@/lib/email/inbound");
      const r = await handleReceived(createServiceClient(), id, [...(evt.data?.received_for ?? []), ...(evt.data?.to ?? [])]);
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      console.error("resend webhook: inbound failed", e instanceof Error ? e.message : e);
      // 500 → Resend retries later
      return NextResponse.json({ error: "Inbound processing failed" }, { status: 500 });
    }
  }
  const at = evt.created_at && !Number.isNaN(Date.parse(evt.created_at)) ? evt.created_at : new Date().toISOString();
  const { error } = await createServiceClient().rpc("email_recipient_event", { p_resend_id: id, p_type: evt.type, p_at: at });
  if (error) {
    console.error("resend webhook: update failed", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
