import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient, serviceRoleConfigured } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Mail-outs: one batch per sending mail-out (Supabase pg_cron 'mailouts' every 5 minutes, migration 0116). */
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
  const { runMailouts } = await import("@/lib/nerdherd/mailout-server");
  const log = await runMailouts(createServiceClient());
  return NextResponse.json({ ok: true, log });
}

export const GET = handle;
export const POST = handle;
