import { createServiceClient } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";

// 1×1 transparent GIF
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Welcome-letter open tracking (the image in the email). Some mail apps load images automatically, so "opened" is a good guide, not proof. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.gif$/, "");
  if (/^[0-9a-f]{40}$/.test(token)) {
    try { await createServiceClient().from("job_invites").update({ opened_at: new Date().toISOString() }).eq("token", token).is("opened_at", null); } catch { /* never break the image */ }
  }
  return new Response(new Uint8Array(GIF), { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, private" } });
}
