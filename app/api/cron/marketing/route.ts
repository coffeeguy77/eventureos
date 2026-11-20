import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient, serviceRoleConfigured } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Marketing daily run (Supabase pg_cron 'marketing-daily', migration 0114, Vault secret sync_trigger_secret).
 * For every business with the Google (Marketing) connection: each active client is synced and reviewed by the AI once
 * a day (local date); in the first days of a month, last month's report is drafted for any client that hasn't got one.
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
  const started = Date.now();
  const db = createServiceClient();
  const { todayISO } = await import("@/lib/format");
  const { buildContext } = await import("@/lib/integrations/sync-runner");
  const { MK_ACCOUNT_COLUMNS, syncAccount } = await import("@/lib/marketing/sync");
  const { runAccount } = await import("@/lib/marketing/optimiser");
  const { makeReport, monthRange } = await import("@/lib/marketing/report");
  const log: string[] = [];
  const { data: conns } = await db.from("integrations").select("organisation_id").eq("provider", "google_marketing").in("status", ["connected", "error", "syncing"]);
  for (const c of (conns ?? []) as { organisation_id: string }[]) {
    if (Date.now() - started > 240_000) { log.push("Out of time — the rest run at the next call."); break; }
    try {
      const ctx = await buildContext(db, "service", c.organisation_id, "google_marketing", null);
      const today = todayISO(ctx.org.timezone);
      const { data: accts } = await db.from("mk_accounts").select(MK_ACCOUNT_COLUMNS).eq("organisation_id", c.organisation_id).eq("active", true).order("name");
      for (const a of (accts ?? []) as import("@/lib/marketing/sync").MkAccount[]) {
        if (Date.now() - started > 240_000) break;
        const doneToday = a.last_run_at && todayISO(ctx.org.timezone, new Date(a.last_run_at)) === today;
        if (!doneToday) {
          log.push(await syncAccount(ctx, a));
          // the starting-point audit, once, before the AI's first changes (so it records the account as we found it)
          if (a.ads_customer_id) {
            const { data: au } = await db.from("mk_reports").select("id").eq("account_id", a.id).eq("data->>kind", "audit").limit(1).maybeSingle();
            if (!au) {
              try { const { runAudit } = await import("@/lib/marketing/audit"); await runAudit(ctx, a); log.push(`${a.name}: starting-point audit written`); }
              catch (e) { log.push(`${a.name}: audit failed — ${e instanceof Error ? e.message : String(e)}`); continue; } // no AI changes until there's a starting point
            }
          }
          log.push(await runAccount(ctx, { ...a, last_synced_at: new Date().toISOString() }));
          if (a.mode === "off" || !a.ads_customer_id) await db.from("mk_accounts").update({ last_run_at: new Date().toISOString() }).eq("id", a.id);
        }
        // last month's report, from the 2nd (so Search Console's figures have settled)
        const [y, m, d] = today.split("-").map(Number);
        if (d >= 2 && d <= 7) {
          const { start, end } = monthRange(y, m - 2);
          const { data: has } = await db.from("mk_reports").select("id").eq("account_id", a.id).eq("period_start", start).maybeSingle();
          if (!has) { await makeReport(db, ctx, a, ctx.org.name, start, end); log.push(`${a.name}: report for ${start} drafted`); }
        }
      }
    } catch (e) { log.push(`${c.organisation_id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return NextResponse.json({ ok: true, log });
}

export const GET = handle;
export const POST = handle;
