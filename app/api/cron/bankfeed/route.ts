import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient, serviceRoleConfigured } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Bank feeds (Redbark) — Vercel Cron, daily at 18:00 UTC (4–5am in Canberra), an hour after the main sync so Xero's
 * invoices are fresh. Reads each business's settled bank transactions and sends what's certain to Xero.
 */
function authorised(req: NextRequest) {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  for (const secret of [process.env.CRON_SECRET?.trim(), process.env.SYNC_TRIGGER_SECRET?.trim()]) {
    if (!secret) continue;
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET?.trim() && !process.env.SYNC_TRIGGER_SECRET?.trim()) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set." }, { status: 503 });
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  if (!serviceRoleConfigured()) return NextResponse.json({ ok: false, error: "Service role isn't configured." }, { status: 503 });
  try {
    const { runBankFeeds } = await import("@/lib/bankfeed/auto");
    return NextResponse.json({ ok: true, feeds: await runBankFeeds(createServiceClient()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
