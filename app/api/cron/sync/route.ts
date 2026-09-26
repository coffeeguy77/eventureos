import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { buildContext, runProviderSync, type SyncOutcome } from "@/lib/integrations/sync-runner";
import { createServiceClient, serviceRoleConfigured } from "@/lib/integrations/runtime";
import type { LiveProviderId } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Background sync for Gmail, Google Calendar and Xero — Vercel Cron (vercel.json — daily at 17:00 UTC on the Hobby plan; more often on Pro).
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set on the project.
 * Database-only automations (quote follow-ups, overdue invoices, expiry) already run in pg_cron — not here.
 */
function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not set — background sync is disabled." }, { status: 503 });
  }
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  if (!serviceRoleConfigured()) {
    return NextResponse.json({
      ok: true, ran: 0,
      note: "Background sync needs SUPABASE_SERVICE_ROLE_KEY. Until it is set, managers can use “Sync now” in Settings → Integrations.",
    });
  }

  const db = createServiceClient();
  const { data, error } = await db.from("integrations").select("organisation_id, provider, status, organisation:organisations!inner(status)")
    .in("provider", ["gmail", "google_calendar", "xero"]).in("status", ["connected", "error"])
    .eq("organisation.status", "active"); // suspended organisations are skipped
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const started = Date.now();
  const results: (SyncOutcome & { organisation_id: string })[] = [];
  for (const row of data ?? []) {
    if (Date.now() - started > 240_000) { results.push({ organisation_id: row.organisation_id, provider: row.provider as LiveProviderId, ok: false, message: "Skipped — out of time this run" }); continue; }
    try {
      const ctx = await buildContext(db, "service", row.organisation_id, row.provider as LiveProviderId, null);
      results.push({ organisation_id: row.organisation_id, ...(await runProviderSync(ctx)) });
    } catch (e) {
      results.push({ organisation_id: row.organisation_id, provider: row.provider as LiveProviderId, ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: true, ran: results.length, results });
}
