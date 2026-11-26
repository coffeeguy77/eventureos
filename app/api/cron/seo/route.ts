import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient, serviceRoleConfigured } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Nerd Herd SEO — weekly. Woken every 20 minutes on Monday morning (Canberra) by Supabase pg_cron (migration 0123,
 * Vault secret sync_trigger_secret = SYNC_TRIGGER_SECRET here). Each wake checks the sites that are due, and on sites
 * set to automatic applies the AI search pack and AI fixes; it carries on where the previous wake stopped.
 */
function authorised(req: NextRequest) {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  for (const secret of [process.env.SYNC_TRIGGER_SECRET?.trim(), process.env.CRON_SECRET?.trim()]) {
    if (!secret) continue;
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

async function handle(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  if (!serviceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  try {
    const { runSeoCron } = await import("@/lib/nerdherd/seo");
    return NextResponse.json({ ok: true, ...(await runSeoCron(createServiceClient())) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
