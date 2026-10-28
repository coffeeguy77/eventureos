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

const PROVIDERS: LiveProviderId[] = ["gmail", "gmail2", "google_calendar", "xero"];

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
  // the second Gmail account's rules run with the frequent Gmail sync
  const providers: LiveProviderId[] = only.length ? (only.includes("gmail") && !only.includes("gmail2") ? [...only, "gmail2"] : only) : PROVIDERS;

  let db;
  try { db = createServiceClient(); } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/sync] service client:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  // Email: forwarding addresses (Resend receiving + webhook) and businesses' own sending domains waiting for DNS
  let emailSetup: unknown = null;
  try {
    const { ensureInboundSetup } = await import("@/lib/email/inbound");
    const { checkPendingDomains } = await import("@/lib/email/domains");
    emailSetup = { inbound: await ensureInboundSetup(db), domains: await checkPendingDomains(db) };
  } catch (e) { emailSetup = { error: e instanceof Error ? e.message : String(e) }; }
  if (req.nextUrl.searchParams.get("providers") === "email_setup") return NextResponse.json({ ok: true, emailSetup });
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

  // Pricing: new supplier invoices from Gmail (businesses with suppliers set up; quietly nothing before the 0070 update)
  let pricingJobs: unknown = null;
  if (!only.length) try {
    const { data: ps, error: psErr } = await db.from("price_suppliers").select("organisation_id").eq("active", true);
    if (!psErr) {
      const { syncSupplierInvoices } = await import("@/lib/pricing/sync");
      const { orgAiKey } = await import("@/lib/ai/key");
      const out: Record<string, unknown> = {};
      for (const orgId of new Set(((ps ?? []) as { organisation_id: string }[]).map((r) => r.organisation_id))) {
        for (const mailbox of ["gmail", "gmail2"] as const) {
          try {
            const ctx = await buildContext(db, "service", orgId, mailbox, null);
            const r = await syncSupplierInvoices(ctx, { aiKey: await orgAiKey(orgId) });
            out[`${orgId}:${mailbox}`] = { imported: r.imported, failed: r.failed, more: r.more };
          } catch (e) { out[`${orgId}:${mailbox}`] = { error: e instanceof Error ? e.message : String(e) }; }
        }
      }
      pricingJobs = out;
    }
  } catch (e) { pricingJobs = { error: e instanceof Error ? e.message : String(e) }; }

  // Online course (Learn): end passes that have run out, renew monthly plans (only while the business has it switched on)
  let learn: unknown = null;
  try {
    const { runLearnJobs } = await import("@/lib/learn/server");
    learn = await runLearnJobs(db);
  } catch (e) { learn = { error: e instanceof Error ? e.message : String(e) }; }

  // Website "come back and finish" reminders — only for businesses that switched them on (off by default)
  let reminders: unknown = null;
  if (!only.length) try {
    const { runReminders } = await import("@/lib/reminders/server");
    reminders = await runReminders(db);
  } catch (e) { reminders = { error: e instanceof Error ? e.message : String(e) }; }

  // Payment reminders (before the event / overdue) — only businesses that switched them on; sends 9am–5pm their time
  let paymentReminders: unknown = null;
  try {
    const { runPaymentReminders } = await import("@/lib/invoices/reminders-run");
    paymentReminders = await runPaymentReminders(db);
  } catch (e) { paymentReminders = { error: e instanceof Error ? e.message : String(e) }; }

  // Accounts: on the day a customer promised to pay, email them the invoice with its pay link (8am–5pm their time)
  let promiseReminders: unknown = null;
  try {
    const { runPromiseReminders } = await import("@/lib/accounts/server");
    promiseReminders = await runPromiseReminders(db);
  } catch (e) { promiseReminders = { error: e instanceof Error ? e.message : String(e) }; }

  // Wholesale orders from another system's order emails (e.g. Ordermentum) — with the frequent Gmail sync; only businesses that switched it on
  let wholesale: unknown = null;
  if (providers.includes("gmail" as LiveProviderId)) try {
    const { runOrderEmailImports } = await import("@/lib/wholesale/email-import");
    wholesale = await runOrderEmailImports(db);
  } catch (e) { wholesale = { error: e instanceof Error ? e.message : String(e) }; }

  // Shop orders from WooCommerce's order emails (coffee orders and subscription renewals; bookings left out) — only businesses that switched it on
  let shopEmails: unknown = null;
  if (providers.includes("gmail" as LiveProviderId)) try {
    const { runShopEmailImports } = await import("@/lib/shop/email-import");
    shopEmails = await runShopEmailImports(db);
  } catch (e) { shopEmails = { error: e instanceof Error ? e.message : String(e) }; }

  // ClassBento bookings from its "New booking" emails — only businesses that switched it on
  let classbento: unknown = null;
  if (providers.includes("gmail" as LiveProviderId)) try {
    const { runClassBentoImports } = await import("@/lib/bookings/classbento-email");
    classbento = await runClassBentoImports(db);
  } catch (e) { classbento = { error: e instanceof Error ? e.message : String(e) }; }

  // Kitchen staff: email them confirmed catering jobs that are new, changed or cancelled (only businesses with someone ticked "Kitchen")
  let kitchen: unknown = null;
  try {
    const { runKitchenNotices } = await import("@/lib/kitchen/notify");
    kitchen = await runKitchenNotices(db);
  } catch (e) { kitchen = { error: e instanceof Error ? e.message : String(e) }; }

  // Recurring invoices due today — raised before the Xero sync so they're pushed to Xero in this same run
  let recurring: unknown = null;
  if (!only.length) try {
    const { raiseDue } = await import("@/lib/recurring/server");
    recurring = await raiseDue(db);
  } catch (e) { recurring = { error: e instanceof Error ? e.message : String(e) }; }

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

  // Hosting (after Xero, so payments are fresh): sync WHM servers, recheck billing, automatic actions (dry run by default)
  let hosting: unknown = null;
  if (!only.length) try {
    const { data: hs, error: hsErr } = await db.from("hosting_servers").select("organisation_id").eq("active", true);
    if (!hsErr) {
      const { runHosting } = await import("@/lib/hosting/server");
      const out: Record<string, unknown> = {};
      for (const orgId of new Set(((hs ?? []) as { organisation_id: string }[]).map((r) => r.organisation_id))) {
        try { const r = await runHosting(db, orgId); out[orgId] = { servers: r.notes, checked: r.billing.accounts, changed: r.billing.changed, auto: r.auto }; }
        catch (e) { out[orgId] = { error: e instanceof Error ? e.message : String(e) }; }
      }
      hosting = out;
    }
  } catch (e) { hosting = { error: e instanceof Error ? e.message : String(e) }; }
  return NextResponse.json({ ok: true, ran: results.length, results, emailSetup, recurring, hosting, bookings: bookingJobs, jobBoard, shop: shopJobs, pricing: pricingJobs, reminders, paymentReminders, promiseReminders, wholesale, kitchen, shopEmails, classbento, learn });
}
