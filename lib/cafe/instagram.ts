import "server-only";
import { createServiceClient, serviceRoleConfigured } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { stateSecret } from "@/lib/integrations/oauth";

/**
 * Instagram feed on the café page — "Instagram API with Instagram Login" (Meta), read-only (instagram_business_basic).
 * Needs a Meta app with Instagram login: env INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET, redirect URI <site>/api/instagram/callback.
 * The token is stored like every other integration (integrations + integration_credentials, provider "instagram");
 * long-lived tokens last 60 days and are refreshed automatically when the feed is read.
 * The latest posts are cached on the integration row for an hour.
 */

export const IG_PROVIDER = "instagram";
const GRAPH = "https://graph.instagram.com";

export const igMissingEnv = () => [
  ...["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"].filter((k) => !process.env[k]?.trim()),
  ...(stateSecret() ? [] : ["OAUTH_STATE_SECRET (or CRON_SECRET)"]),
];
export const igRedirectUri = (origin?: string) => `${appBaseUrl(origin)}/api/instagram/callback`;

export function igAuthorizeUrl(state: string, redirectUri: string) {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!.trim());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "instagram_business_basic");
  u.searchParams.set("state", state);
  return u.toString();
}

async function json<T>(res: Response, what: string): Promise<T> {
  const data = await res.json().catch(() => null) as (T & { error?: { message?: string } | string; error_message?: string }) | null;
  if (!res.ok || !data) {
    const msg = typeof data?.error === "object" ? data.error?.message : data?.error_message || (typeof data?.error === "string" ? data.error : "");
    throw new Error(`Instagram ${what} failed${msg ? `: ${msg}` : ` (${res.status})`}`);
  }
  return data;
}

/** Code → short-lived token → long-lived (60-day) token, plus the account's username. */
export async function igExchange(code: string, redirectUri: string) {
  const form = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID!.trim(), client_secret: process.env.INSTAGRAM_APP_SECRET!.trim(), grant_type: "authorization_code", redirect_uri: redirectUri, code });
  const short = await json<{ access_token: string; user_id?: number | string }>(await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form, signal: AbortSignal.timeout(15000) }), "sign-in");
  const long = await json<{ access_token: string; expires_in?: number }>(await fetch(`${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(process.env.INSTAGRAM_APP_SECRET!.trim())}&access_token=${encodeURIComponent(short.access_token)}`, { signal: AbortSignal.timeout(15000) }), "token exchange");
  const me = await json<{ user_id?: string; id?: string; username?: string }>(await fetch(`${GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(long.access_token)}`, { signal: AbortSignal.timeout(15000) }), "profile");
  return {
    token: long.access_token,
    expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86400) * 1000).toISOString(),
    username: me.username ?? "", userId: String(me.user_id ?? me.id ?? short.user_id ?? ""),
  };
}

export interface IgPost { id: string; image: string; permalink: string; caption: string; video: boolean; at: string }

async function fetchMedia(token: string): Promise<IgPost[]> {
  const r = await json<{ data?: { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string }[] }>(
    await fetch(`${GRAPH}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000), cache: "no-store" }), "feed");
  return (r.data ?? []).map((m) => ({
    id: String(m.id), image: (m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url) ?? "", permalink: m.permalink ?? "",
    caption: (m.caption ?? "").slice(0, 220), video: m.media_type === "VIDEO", at: m.timestamp ?? "",
  })).filter((p) => /^https:\/\//.test(p.image) && /^https:\/\/(www\.)?instagram\.com\//.test(p.permalink));
}

/** Connection status for the office. */
export async function igStatus(orgId: string) {
  if (!serviceRoleConfigured()) return null;
  const db = createServiceClient();
  const { data } = await db.from("integrations").select("status, account_label, last_error, settings").eq("organisation_id", orgId).eq("provider", IG_PROVIDER).maybeSingle();
  return data as { status: string; account_label: string | null; last_error: string | null; settings: Record<string, unknown> } | null;
}

/** The latest posts (cached for an hour). Never throws — an empty list shows the "Follow us" panel instead. */
export async function igFeed(orgId: string): Promise<{ posts: IgPost[]; username: string | null }> {
  if (!serviceRoleConfigured()) return { posts: [], username: null };
  try {
    const db = createServiceClient();
    const { data: row } = await db.from("integrations").select("id, status, account_label, settings").eq("organisation_id", orgId).eq("provider", IG_PROVIDER).maybeSingle();
    if (!row || row.status !== "connected") return { posts: [], username: null };
    const settings = (row.settings ?? {}) as { feed?: IgPost[]; feed_at?: string };
    const cached = Array.isArray(settings.feed) ? settings.feed : [];
    if (settings.feed_at && Date.now() - Date.parse(settings.feed_at) < 60 * 60e3) return { posts: cached, username: row.account_label };

    const { data: cred } = await db.rpc("service_get_integration_tokens", { p_integration_id: row.id });
    const c = (Array.isArray(cred) ? cred[0] : cred) as { access_token: string | null; expires_at: string | null } | undefined;
    if (!c?.access_token) return { posts: cached, username: row.account_label };
    let token = c.access_token;
    // Long-lived tokens refresh once they're at least a day old; do it when under 10 days remain.
    if (c.expires_at && Date.parse(c.expires_at) - Date.now() < 10 * 86400e3) {
      try {
        const fresh = await json<{ access_token: string; expires_in?: number }>(await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) }), "token refresh");
        token = fresh.access_token;
        await db.rpc("service_update_integration_access_token", { p_integration_id: row.id, p_access_token: token, p_expires_at: new Date(Date.now() + (fresh.expires_in ?? 60 * 86400) * 1000).toISOString(), p_refresh_token: null });
      } catch (e) { console.error("[instagram] refresh", e instanceof Error ? e.message : e); }
    }
    try {
      const posts = await fetchMedia(token);
      await db.from("integrations").update({ settings: { ...settings, feed: posts, feed_at: new Date().toISOString() }, last_sync_at: new Date().toISOString(), last_sync_status: "success", last_error: null }).eq("id", row.id);
      return { posts, username: row.account_label };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("integrations").update({ settings: { ...settings, feed_at: new Date().toISOString() }, last_sync_status: "error", last_error: msg.slice(0, 300) }).eq("id", row.id);
      return { posts: cached, username: row.account_label };
    }
  } catch (e) {
    console.error("[instagram] feed", e instanceof Error ? e.message : e);
    return { posts: [], username: null };
  }
}
