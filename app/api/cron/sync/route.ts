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
  // CRON_SECRET: Vercel Cron (daily). SYNC_TRIGGER_SECRET: Supabase pg_cron, every few minutes (see migration 0029).
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  for (const secret of [process.env.CRON_SECRET?.trim(), process.env.SYNC_TRIGGER_SECRET?.trim()]) {
    if (!secret) continue;
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

const PROVIDERS: LiveProviderId[] = ["gmail", "google_calendar", "xero"];

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET?.trim() && !process.env.SYNC_TRIGGER_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not set — background sync is disabled." }, { status: 503 });
  }
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  if (!serviceRoleConfigured()) {
    return NextResponse.json({
      ok: true, ran: 0,
      note: "Background sync needs SUPABASE_SERVICE_ROLE_KEY. Until it is set, managers can use “Sync now” in Settings → Integrations.",
    });
  }

  // ?providers=gmail,google_calendar limits a run (the frequent email sync); no parameter = everything
  const only = (req.nextUrl.searchParams.get("providers") ?? "").split(",").map((x) => x.trim()).filter((x): x is LiveProviderId => PROVIDERS.includes(x as LiveProviderId));
  const providers = only.length ? only : PROVIDERS;

  let db;
  try { db = createServiceClient(); } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/sync] service client:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  // Regular staff shifts: keep them filled 8 weeks ahead (and on the staff member's calendar)
  try {
    const { fillSeries } = await import("@/lib/crew/custom-shifts");
    const { data: ser } = await db.from("staff_shift_series").select("organisation_id, org:organisations(timezone)").eq("active", true);
    const orgs = new Map(((ser ?? []) as unknown as { organisation_id: string; org: { timezone: string } | null }[]).map((r) => [r.organisation_id, r.org?.timezone ?? "Australia/Sydney"]));
    for (const [orgId, tz] of orgs) await fillSeries(db, orgId, tz).catch((e) => console.error("[cron/sync] regular shifts:", e));
  } catch (e) { console.error("[cron/sync] regular shifts:", e); }

  // Course bookings: reminders, thank-yous, scheduled gift certificates, unpaid seat holds (quietly nothing before the 0049 update)
  let bookingJobs: unknown = null;
  try {
    const { runBookingJobs } = await import("@/lib/bookings/server");
    bookingJobs = await runBookingJobs(db);
  } catch (e) { bookingJobs = { error: e instanceof Error ? e.message : String(e) }; }

  // Barista job board: welcome letters (in small batches) and closing jobs whose dates have passed
  let jobBoard: unknown = null;
  try {
    const { runJobBoardJobs } = await import("@/lib/jobs/server");
    jobBoard = await runJobBoardJobs(db);
  } catch (e) { jobBoard = { error: e instanceof Error ? e.message : String(e) }; }

  // Coffee shop: subscription deliveries due (card charged / prepaid used), pauses ending, unfinished checkouts, scheduled gift cards.
  // Subscriptions still billed by WooCommerce are never charged here.
  let shopJobs: unknown = null;
  if (!only.length) try {
    const { runShopJobs } = await import("@/lib/shop/server");
    shopJobs = await runShopJobs(db);
  } catch (e) { shopJobs = { error: e instanceof Error ? e.message : String(e) }; }

  const { data, error } = await db.from("integrations").select("organisation_id, provider, status, organisation:organisations!inner(status)")
    .in("provider", providers).in("status", ["connected", "error"])
    .eq("organisation.status", "active"); // suspended organisations are skipped
  if (error) {
    console.error("[cron/sync] loading integrations:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

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
  for (const r of results) if (!r.ok) console.error(`[cron/sync] ${r.provider} for ${r.organisation_id}: ${r.message}`);
  return NextResponse.json({ ok: true, ran: results.length, results, bookings: bookingJobs, jobBoard, shop: shopJobs });
}
