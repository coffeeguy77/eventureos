import "server-only";
import { RateLimited } from "@/lib/integrations/runtime";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncGmail } from "@/lib/integrations/gmail-sync";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar";
import { missingEnv, type LiveProviderId } from "@/lib/integrations/registry";
import { ReconnectRequired, errMessage, loadIntegration, loadOrg, type SyncContext } from "@/lib/integrations/runtime";
import { syncXero } from "@/lib/integrations/xero-sync";

export interface SyncOutcome { provider: LiveProviderId; ok: boolean; message: string }

export async function buildContext(db: SupabaseClient, mode: "user" | "service", orgId: string, provider: LiveProviderId, actorId: string | null): Promise<SyncContext> {
  const integration = await loadIntegration(db, orgId, provider);
  if (!integration || !["connected", "syncing", "error"].includes(integration.status)) {
    throw new Error(`${provider === "gmail" ? "Gmail" : provider === "xero" ? "Xero" : "Google Calendar"} isn't connected.`);
  }
  return { db, mode, actorId, integration, org: await loadOrg(db, orgId) };
}

/** Run one provider's sync. Never throws: failures are recorded on the integration and returned. */
export async function runProviderSync(ctx: SyncContext, opts: { full?: boolean } = {}): Promise<SyncOutcome> {
  const provider = ctx.integration.provider;
  const missing = missingEnv(provider).filter((m) => !m.startsWith("OAUTH_STATE_SECRET")); // state secret only matters for connecting
  if (missing.length) {
    return { provider, ok: false, message: `Can't sync until ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} set.` };
  }
  try {
    const r = provider === "gmail" ? await syncGmail(ctx)
      : provider === "google_calendar" ? await syncGoogleCalendar(ctx)
      : await syncXero(ctx, opts);
    return { provider, ok: true, message: r.message };
  } catch (e) {
    const message = errMessage(e);
    // Being asked to slow down isn't a failure: keep the connection healthy and carry on next time
    if (e instanceof RateLimited) return { provider, ok: true, message };
    await ctx.db.from("integrations").update({
      status: "error", last_error: e instanceof ReconnectRequired ? `Reconnect needed: ${message}` : message.slice(0, 1000),
      last_sync_status: "error", last_sync_at: new Date().toISOString(),
    }).eq("id", ctx.integration.id);
    return { provider, ok: false, message };
  }
}
