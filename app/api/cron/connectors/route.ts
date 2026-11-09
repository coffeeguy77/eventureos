import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient, serviceRoleConfigured } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Web Culture Connector auto-update. Woken every 15 minutes by Supabase pg_cron (migration 0105, Vault secret
 * sync_trigger_secret = SYNC_TRIGGER_SECRET here). Returns at once when every site is on the newest version.
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
    const { runConnectorUpdates } = await import("@/lib/nerdherd/autoupdate");
    return NextResponse.json({ ok: true, ...(await runConnectorUpdates(createServiceClient())) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
