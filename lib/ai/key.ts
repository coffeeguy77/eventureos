import "server-only";
import { createServiceClient } from "@/lib/integrations/runtime";
import { ANTHROPIC_VERSION } from "./claude";

/**
 * Which Claude API key a business's AI features use: the business's own key (Settings → Integrations → AI) when it
 * has added one, otherwise the platform key (ANTHROPIC_API_KEY in Vercel). The key is kept in integration_credentials,
 * which no browser can read; only the server fetches it, with the service role.
 */
export const AI_PROVIDER = "anthropic";
const cache = new Map<string, { key: string | null; at: number }>();

export async function orgAiKey(orgId: string): Promise<string | null> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < 60_000) return hit.key ?? process.env.ANTHROPIC_API_KEY?.trim() ?? null;
  let own: string | null = null;
  try {
    const db = createServiceClient();
    const { data: row } = await db.from("integrations").select("id, status").eq("organisation_id", orgId).eq("provider", AI_PROVIDER).maybeSingle();
    if (row && row.status === "connected") {
      const { data } = await db.rpc("service_get_integration_tokens", { p_integration_id: row.id });
      const t = (Array.isArray(data) ? data[0] : data) as { access_token?: string | null } | undefined;
      own = t?.access_token?.trim() || null;
    }
  } catch { own = null; }
  cache.set(orgId, { key: own, at: Date.now() });
  return own ?? (process.env.ANTHROPIC_API_KEY?.trim() || null);
}

export function forgetOrgAiKey(orgId: string) { cache.delete(orgId); }

/** Check a key works before saving it (lists models — costs nothing). */
export async function testAiKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ws = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION, ...(ws ? { "anthropic-workspace-id": ws } : {}) }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Anthropic didn't accept that key — copy it again from console.anthropic.com → API keys." };
    if (!res.ok) return { ok: false, error: `Anthropic said ${res.status} — try again in a minute.` };
    return { ok: true };
  } catch { return { ok: false, error: "Couldn't reach Anthropic to check the key — try again." }; }
}
