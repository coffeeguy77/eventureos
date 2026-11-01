import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Square (point of sale) — today's takings, for wage cost as a % of sales.
 * Connected with a personal access token from the Square Developer dashboard (Settings → Integrations → Square);
 * stored in the integrations table like Twilio. Read-only: GET /v2/locations, GET /v2/payments.
 */
const API = "https://connect.squareup.com/v2";
const VERSION = "2024-10-17";
export interface SquareConfig { token: string; locationId: string | null }

export async function loadSquare(db: SupabaseClient, orgId: string): Promise<SquareConfig | null> {
  const { data: integ } = await db.from("integrations").select("id, status, settings").eq("organisation_id", orgId).eq("provider", "square").maybeSingle();
  if (!integ || integ.status !== "connected") return null;
  const { data: tok } = await db.rpc("service_get_integration_tokens", { p_integration_id: integ.id });
  const row = (Array.isArray(tok) ? tok[0] : tok) as { access_token: string | null } | undefined;
  if (!row?.access_token) return null;
  const loc = ((integ.settings ?? {}) as { location_id?: string }).location_id ?? null;
  return { token: row.access_token, locationId: loc };
}

async function sq<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}`, "square-version": VERSION, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const j = (await res.json().catch(() => ({}))) as T & { errors?: { detail?: string; code?: string }[] };
  if (!res.ok) throw new Error(`Square: ${j.errors?.[0]?.detail ?? j.errors?.[0]?.code ?? res.status}`);
  return j;
}

export async function squareLocations(token: string) {
  const r = await sq<{ locations?: { id: string; name: string; status: string; currency?: string }[] }>(token, "/locations");
  return (r.locations ?? []).filter((l) => l.status === "ACTIVE").map((l) => ({ id: l.id, name: l.name }));
}

const cache = new Map<string, { at: number; v: number }>();
/** Completed card + cash payments between two instants (dollars, after refunds). Cached 5 minutes. */
export async function squareSales(cfg: SquareConfig, fromIso: string, toIso: string): Promise<number> {
  const key = `${cfg.locationId}|${fromIso}|${toIso.slice(0, 15)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 300_000) return hit.v;
  let cents = 0, cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const qs = new URLSearchParams({ begin_time: fromIso, end_time: toIso, limit: "100" });
    if (cfg.locationId) qs.set("location_id", cfg.locationId);
    if (cursor) qs.set("cursor", cursor);
    const r = await sq<{ payments?: { status: string; total_money?: { amount: number }; refunded_money?: { amount: number } }[]; cursor?: string }>(cfg.token, `/payments?${qs}`);
    for (const p of r.payments ?? []) if (p.status === "COMPLETED") cents += (p.total_money?.amount ?? 0) - (p.refunded_money?.amount ?? 0);
    cursor = r.cursor;
    if (!cursor) break;
  }
  const v = Math.round(cents) / 100;
  cache.set(key, { at: Date.now(), v });
  return v;
}

/** Completed payments by local date (YYYY-MM-DD) between two instants, in one pass. Cached 15 minutes. */
const dayCache = new Map<string, { at: number; v: Record<string, number> }>();
export async function squareSalesByDay(cfg: SquareConfig, fromIso: string, toIso: string, tz: string): Promise<Record<string, number>> {
  const key = `${cfg.locationId}|${fromIso}|${toIso.slice(0, 13)}|${tz}`;
  const hit = dayCache.get(key);
  if (hit && Date.now() - hit.at < 900_000) return hit.v;
  const out: Record<string, number> = {};
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  let cursor: string | undefined;
  for (let i = 0; i < 400; i++) {
    const qs = new URLSearchParams({ begin_time: fromIso, end_time: toIso, limit: "100" });
    if (cfg.locationId) qs.set("location_id", cfg.locationId);
    if (cursor) qs.set("cursor", cursor);
    const r = await sq<{ payments?: { status: string; created_at: string; total_money?: { amount: number }; refunded_money?: { amount: number } }[]; cursor?: string }>(cfg.token, `/payments?${qs}`);
    for (const p of r.payments ?? []) if (p.status === "COMPLETED") { const d = day.format(new Date(p.created_at)); out[d] = (out[d] ?? 0) + ((p.total_money?.amount ?? 0) - (p.refunded_money?.amount ?? 0)) / 100; }
    cursor = r.cursor;
    if (!cursor) break;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 100) / 100;
  dayCache.set(key, { at: Date.now(), v: out });
  return out;
}
