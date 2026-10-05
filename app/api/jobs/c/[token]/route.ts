import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/** Welcome-letter button: record the click (counts as opened too), then go to the join page. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  if (!/^[0-9a-f]{40}$/.test(token)) return NextResponse.redirect(`${appBaseUrl()}/`);
  const db = createServiceClient();
  const { data: inv } = await db.from("job_invites").select("id, opened_at, clicked_at, org:organisations!inner(slug)").eq("token", token).maybeSingle();
  if (!inv) return NextResponse.redirect(`${appBaseUrl()}/`);
  const now = new Date().toISOString();
  if (!inv.clicked_at || !inv.opened_at) await db.from("job_invites").update({ clicked_at: inv.clicked_at ?? now, opened_at: inv.opened_at ?? now }).eq("id", inv.id);
  const slug = (inv.org as unknown as { slug: string }).slug;
  return NextResponse.redirect(`${appBaseUrl()}/jobs/${slug}/join?i=${token}`);
}
