import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import manifest from "@/public/downloads/webculture-connector.json";
import { callConnector, storeStatus, type ConnectorStatus, type UpdateResult } from "./connector";

/**
 * Keeps every site's Web Culture Connector on the newest version without anyone doing it by hand.
 * Woken every 15 minutes by Supabase pg_cron (migration 0105). For each connected site still behind the version in
 * public/downloads/webculture-connector.json: ask the site to look for updates (fresh), update just the Connector,
 * then read its status back. A site that fails is tried again 12 hours later. Sites on 1.4.1+ also update themselves
 * through WordPress's background updater, so this mostly catches older sites and ones whose cron doesn't run.
 */
export const LATEST = manifest.version;
const RETRY_HOURS = 12;
const CONCURRENCY = 5;
const DEFAULT_FILE = "webculture-connector/webculture-connector.php";

export const versionBehind = (v: string | null | undefined, latest = LATEST) => {
  const a = (v ?? "0").split(".").map((x) => Number(x) || 0), b = latest.split(".").map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d < 0; }
  return false;
};

type Row = { website_id: string; organisation_id: string; site_url: string; connector_version: string | null; plugins: { file: string; name?: string }[] | null; auto_update_at: string | null };

/** New sites are only started in the first minute, so even a slow site (≈ 4 min worst case) finishes inside the 5-minute limit. */
export async function runConnectorUpdates(db: SupabaseClient, budgetMs = 230_000) {
  const started = Date.now();
  const out = { latest: LATEST, behind: 0, tried: 0, updated: 0, failed: [] as { site: string; error: string }[] };
  const { data, error } = await db.from("website_connectors").select("website_id, organisation_id, site_url, connector_version, plugins, auto_update_at").limit(5000);
  if (error) throw new Error(error.message);
  const cutoff = Date.now() - RETRY_HOURS * 3_600_000;
  const due = ((data ?? []) as Row[]).filter((r) => versionBehind(r.connector_version));
  out.behind = due.length;
  const queue = due.filter((r) => !r.auto_update_at || Date.parse(r.auto_update_at) < cutoff)
    .sort((a, b) => (a.auto_update_at ?? "") < (b.auto_update_at ?? "") ? -1 : 1);
  if (!queue.length) return out;
  const { data: keys } = await db.from("website_connector_keys").select("website_id, key").in("website_id", queue.map((r) => r.website_id));
  const keyOf = new Map(((keys ?? []) as { website_id: string; key: string }[]).map((k) => [k.website_id, k.key]));

  const one = async (r: Row) => {
    const key = keyOf.get(r.website_id);
    const now = new Date().toISOString();
    if (!key) { await db.from("website_connectors").update({ auto_update_at: now, auto_update_error: "No connection key saved." }).eq("website_id", r.website_id); return; }
    out.tried++;
    const file = (r.plugins ?? []).find((p) => /web ?culture connector/i.test(p.name ?? "") || /webculture-connector\.php$/.test(p.file))?.file ?? DEFAULT_FILE;
    let err: string | null = null;
    try {
      await callConnector<ConnectorStatus>(r.site_url, key, "POST", "/check", {}, 45_000).catch(() => null);
      const res = await callConnector<UpdateResult>(r.site_url, key, "POST", "/update", { type: "plugins", items: [file] }, 150_000);
      const p = (res.plugins ?? []).find((x) => x.file === file);
      if (p && !p.ok) err = p.error ?? "WordPress couldn't install the update.";
      // read the new version back (the update may have reloaded the plugin)
      const st = await callConnector<ConnectorStatus>(r.site_url, key, "GET", "/status", undefined, 30_000);
      await storeStatus(db, r.website_id, st);
      if (versionBehind(st.connector)) err = err ?? (p ? `Still on ${st.connector} after updating.` : `The site isn't offering ${LATEST} yet (it may have the update list cached) — will try again.`);
      else out.updated++;
    } catch (e) { err = e instanceof Error ? e.message.slice(0, 300) : String(e); }
    if (err) out.failed.push({ site: r.site_url, error: err });
    await db.from("website_connectors").update({ auto_update_at: new Date().toISOString(), auto_update_error: err }).eq("website_id", r.website_id);
    if (!err) {
      await db.from("activity_logs").insert({ organisation_id: r.organisation_id, actor_type: "system", actor_label: "Connector auto-update", action: "connector.updated", entity_type: "website", entity_id: r.website_id,
        summary: `Web Culture Connector updated ${r.connector_version ?? "?"} → ${LATEST} on ${r.site_url.replace(/^https?:\/\//, "")}` }).then(() => null, () => null);
    }
  };

  // a few sites at a time, until the time is used (the rest go on the next run)
  let i = 0;
  const worker = async () => {
    while (i < queue.length && Date.now() - started < Math.min(60_000, budgetMs)) await one(queue[i++]);
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}
