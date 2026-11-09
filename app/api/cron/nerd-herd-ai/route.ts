import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runAiJobs } from "@/lib/nerdherd/ai-runner";
import { serviceRoleConfigured } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Nerd Herd AI maintenance runner. Woken by Supabase pg_cron every minute while jobs are waiting (migration 0104,
 * Vault secret sync_trigger_secret = SYNC_TRIGGER_SECRET here) and straight away when a job is started.
 * Each run advances jobs for up to ~4 minutes, then saves where they got to.
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
  const job = req.nextUrl.searchParams.get("job");
  try {
    const log = await runAiJobs({ jobId: job && /^[0-9a-f-]{36}$/i.test(job) ? job : undefined, budgetMs: 250_000 });
    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
