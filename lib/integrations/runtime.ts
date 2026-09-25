import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { expiresAt, refreshAccessToken } from "@/lib/integrations/oauth";
import type { LiveProviderId } from "@/lib/integrations/registry";

/**
 * Shared runtime for integration adapters.
 *
 * A sync runs in one of two modes:
 *  - "user":    a signed-in manager pressed "Sync now" (or sent a reply). Database access is the user's own
 *               Supabase client, so RLS applies; tokens come from get_integration_tokens / update_integration_access_token.
 *  - "service": the Vercel cron (only when SUPABASE_SERVICE_ROLE_KEY is set). Tokens come from the service-only
 *               RPCs service_get_integration_tokens / service_update_integration_access_token.
 */

export interface IntegrationRow {
  id: string;
  organisation_id: string;
  provider: LiveProviderId;
  status: string;
  account_label: string | null;
  external_account_id: string | null;
  scopes: string[];
  settings: Record<string, unknown>;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_error: string | null;
}

export interface OrgInfo {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  contact_email: string | null;
  settings: Record<string, unknown>;
}

export interface SyncContext {
  db: SupabaseClient;
  mode: "user" | "service";
  actorId: string | null;
  integration: IntegrationRow;
  org: OrgInfo;
}

export const INTEGRATION_COLUMNS = "id, organisation_id, provider, status, account_label, external_account_id, scopes, settings, last_sync_at, last_sync_status, last_error";

export function serviceRoleConfigured() {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Service-role client — ONLY for the cron route. Never used while handling a user's request. */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Background sync needs SUPABASE_SERVICE_ROLE_KEY.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadOrg(db: SupabaseClient, orgId: string): Promise<OrgInfo> {
  const { data, error } = await db.from("organisations").select("id, name, timezone, currency, contact_email, settings").eq("id", orgId).single();
  if (error) throw new Error(`Could not load organisation: ${error.message}`);
  return data as OrgInfo;
}

export async function loadIntegration(db: SupabaseClient, orgId: string, provider: LiveProviderId): Promise<IntegrationRow | null> {
  const { data, error } = await db.from("integrations").select(INTEGRATION_COLUMNS).eq("organisation_id", orgId).eq("provider", provider).maybeSingle();
  if (error) throw new Error(`Could not load ${provider} connection: ${error.message}`);
  return (data as IntegrationRow | null) ?? null;
}

// ------------------------------------------------------------------------------------------------
// Tokens
// ------------------------------------------------------------------------------------------------

export class ReconnectRequired extends Error {}

/**
 * Proves to the database that a token request comes from this server (not a browser).
 * Managers can read tokens without it; staff (e.g. replying to an email) need it.
 */
function serverKey(): string | null {
  return process.env.INTEGRATION_SERVER_KEY?.trim() || null;
}

async function readTokens(ctx: SyncContext) {
  const fn = ctx.mode === "service" ? "service_get_integration_tokens" : "get_integration_tokens";
  const args: Record<string, unknown> = { p_integration_id: ctx.integration.id };
  if (ctx.mode === "user") args.p_server_key = serverKey();
  const { data, error } = await ctx.db.rpc(fn, args);
  if (error) throw new Error(`Could not read ${ctx.integration.provider} credentials: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { access_token: string | null; refresh_token: string | null; expires_at: string | null } | undefined;
  if (!row?.access_token && !row?.refresh_token) throw new ReconnectRequired("No stored credentials — reconnect the integration.");
  return row;
}

async function storeToken(ctx: SyncContext, access: string, exp: string, refresh?: string) {
  const fn = ctx.mode === "service" ? "service_update_integration_access_token" : "update_integration_access_token";
  const args: Record<string, unknown> = { p_integration_id: ctx.integration.id, p_access_token: access, p_expires_at: exp, p_refresh_token: refresh ?? null };
  if (ctx.mode === "user") args.p_server_key = serverKey();
  const { error } = await ctx.db.rpc(fn, args);
  if (error) throw new Error(`Could not save refreshed token: ${error.message}`);
}

const tokenCache = new WeakMap<SyncContext, { token: string; exp: number }>();

/** A valid access token, refreshing (and persisting) it when it is about to expire. */
export async function getAccessToken(ctx: SyncContext, force = false): Promise<string> {
  const cached = tokenCache.get(ctx);
  if (!force && cached && cached.exp > Date.now() + 60_000) return cached.token;
  const t = await readTokens(ctx);
  const exp = t.expires_at ? Date.parse(t.expires_at) : 0;
  if (!force && t.access_token && exp > Date.now() + 60_000) {
    tokenCache.set(ctx, { token: t.access_token, exp });
    return t.access_token;
  }
  if (!t.refresh_token) throw new ReconnectRequired("The connection has expired and has no refresh token — reconnect it.");
  try {
    const fresh = await refreshAccessToken(ctx.integration.provider, t.refresh_token);
    const e = expiresAt(fresh);
    // Xero rotates refresh tokens on every refresh; Google usually doesn't return a new one.
    await storeToken(ctx, fresh.access_token, e, fresh.refresh_token);
    tokenCache.set(ctx, { token: fresh.access_token, exp: Date.parse(e) });
    return fresh.access_token;
  } catch (err) {
    const code = (err as Error & { oauthError?: string }).oauthError;
    if (code === "invalid_grant" || code === "unauthorized_client") {
      throw new ReconnectRequired("Access was revoked or expired at the provider — reconnect the integration.");
    }
    throw err;
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: string) { super(message); }
}

/** fetch() with the integration's bearer token; refreshes once on 401. */
export async function apiFetch(ctx: SyncContext, url: string, init: RequestInit & { headers?: Record<string, string> } = {}, label = "API"): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(ctx, attempt > 0);
    const res = await fetch(url, { ...init, cache: "no-store", headers: { accept: "application/json", ...(init.headers ?? {}), authorization: `Bearer ${token}` } });
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 429) {
      const wait = Math.min(10, Number(res.headers.get("retry-after") ?? 2));
      if (attempt === 0) { await new Promise((r) => setTimeout(r, wait * 1000)); continue; }
    }
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(`${label} ${res.status}: ${body.slice(0, 300)}`, res.status, body);
    }
    return res;
  }
  throw new ApiError(`${label}: unauthorised after refreshing the token`, 401, "");
}

export async function apiJSON<T>(ctx: SyncContext, url: string, init: RequestInit & { headers?: Record<string, string> } = {}, label = "API"): Promise<T> {
  const res = await apiFetch(ctx, url, init, label);
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

// ------------------------------------------------------------------------------------------------
// Sync bookkeeping: integration_sync_logs, integrations.last_sync_*, integration activity
// ------------------------------------------------------------------------------------------------

export async function startSyncLog(ctx: SyncContext, entity: string, direction: "inbound" | "outbound" = "inbound") {
  const { data, error } = await ctx.db.from("integration_sync_logs").insert({
    organisation_id: ctx.org.id, integration_id: ctx.integration.id, direction, entity, status: "running",
  }).select("id").single();
  if (error) throw new Error(`Could not start sync log: ${error.message}`);
  await ctx.db.from("integrations").update({ status: "syncing" }).eq("id", ctx.integration.id);
  return data.id as string;
}

export async function finishSyncLog(ctx: SyncContext, logId: string, status: "success" | "partial" | "error", processed: number, message: string) {
  await ctx.db.from("integration_sync_logs").update({ status, records_processed: processed, message: message.slice(0, 2000), finished_at: new Date().toISOString() }).eq("id", logId);
  const patch: Record<string, unknown> = {
    status: status === "error" ? "error" : "connected",
    last_sync_at: new Date().toISOString(),
    last_sync_status: status,
    last_error: status === "success" ? null : message.slice(0, 1000),
  };
  const { error } = await ctx.db.from("integrations").update(patch).eq("id", ctx.integration.id);
  if (error) throw new Error(`Could not update sync status: ${error.message}`);
}

export async function saveIntegrationSettings(ctx: SyncContext, patch: Record<string, unknown>) {
  const settings = { ...ctx.integration.settings, ...patch };
  const { error } = await ctx.db.from("integrations").update({ settings }).eq("id", ctx.integration.id);
  if (error) throw new Error(`Could not save sync position: ${error.message}`);
  ctx.integration.settings = settings;
}

export async function logIntegration(ctx: SyncContext, a: {
  action: string; entityType: string; entityId?: string | null; summary: string;
  customerId?: string | null; eventId?: string | null; enquiryId?: string | null; metadata?: Record<string, unknown>;
}) {
  const { error } = await ctx.db.rpc("log_integration_activity", {
    p_org: ctx.org.id, p_provider: ctx.integration.provider, p_action: a.action, p_entity_type: a.entityType,
    p_entity_id: a.entityId ?? null, p_summary: a.summary, p_customer: a.customerId ?? null, p_event: a.eventId ?? null,
    p_enquiry: a.enquiryId ?? null, p_metadata: a.metadata ?? null,
  });
  if (error) throw new Error(`Could not write the audit log: ${error.message}`);
}

/** Escape LIKE wildcards for exact case-insensitive matching with ilike. */
export const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export function errMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
