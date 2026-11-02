"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { logActivity } from "@/lib/activity";
import { callConnector, KEY_PATTERN, normaliseSiteUrl, sameSite, storeStatus, type ConnectorStatus, type UpdateResult } from "@/lib/nerdherd/connector";

/**
 * WordPress command ops for a website (Nerd Herd → Websites → a site): connect the Web Culture Connector plugin,
 * check for updates, run updates, purge caches. Owners, admins and managers only. The key is stored server-side
 * and never sent back to the browser.
 */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const err = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /website_connector|website_maintenance_runs/.test(m) && /does not exist|could not find/i.test(m) ? "Command ops needs the 0093 database update first." : m;
};

async function ctx(websiteId: string) {
  const c = await requireOrg();
  if (!canManage(c.role)) throw new Error("Only owners, admins and managers can run maintenance.");
  if (!UUID.test(websiteId)) throw new Error("Refresh and try again.");
  const { data: site } = await c.supabase.from("websites").select("id, domain, customer_id").eq("id", websiteId).eq("organisation_id", c.org.id).maybeSingle();
  if (!site) throw new Error("That website no longer exists.");
  return { ...c, db: createServiceClient(), site: site as { id: string; domain: string; customer_id: string | null } };
}

async function connection(db: ReturnType<typeof createServiceClient>, orgId: string, websiteId: string) {
  const [{ data: conn }, { data: k }] = await Promise.all([
    db.from("website_connectors").select("site_url").eq("website_id", websiteId).eq("organisation_id", orgId).maybeSingle(),
    db.from("website_connector_keys").select("key").eq("website_id", websiteId).maybeSingle(),
  ]);
  if (!conn || !k?.key) throw new Error("This site isn't connected yet.");
  return { url: conn.site_url as string, key: k.key as string };
}

async function record(db: ReturnType<typeof createServiceClient>, r: { orgId: string; websiteId: string; action: string; scope?: string | null; ok: boolean; summary: string; detail?: unknown; actor: string }) {
  await db.from("website_maintenance_runs").insert({
    organisation_id: r.orgId, website_id: r.websiteId, action: r.action, scope: r.scope ?? null, ok: r.ok,
    summary: r.summary.slice(0, 2000), detail: r.detail ?? null, actor: r.actor,
  });
}

const done = (id: string) => { revalidatePath(`/nerd-herd/websites/${id}`); revalidatePath("/nerd-herd/websites"); revalidatePath("/nerd-herd/maintenance"); };

/** Connect (or re-key) a site: checks the key works before saving it, then pulls the status. */
export async function connectSite(websiteId: string, siteUrlInput: string, keyInput: string): Promise<R<string>> {
  try {
    const { db, org, user, supabase, site } = await ctx(websiteId);
    const url = normaliseSiteUrl(siteUrlInput || site.domain);
    if (!sameSite(url, site.domain)) throw new Error(`The address must be on ${site.domain}.`);
    const key = (keyInput ?? "").trim();
    if (!KEY_PATTERN.test(key)) throw new Error("That isn't a connection key. Copy it from Tools → Web Culture on the site (it starts with wcc_).");

    await callConnector<{ ok: boolean }>(url, key, "GET", "/ping");
    const now = new Date().toISOString();
    const { error: e1 } = await db.from("website_connectors").upsert({ website_id: site.id, organisation_id: org.id, site_url: url, last_error: null, updated_at: now }, { onConflict: "website_id" });
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await db.from("website_connector_keys").upsert({ website_id: site.id, key, updated_at: now });
    if (e2) throw new Error(e2.message);

    const status = await callConnector<ConnectorStatus>(url, key, "POST", "/check", undefined, 120_000);
    await storeStatus(db, site.id, status);
    const total = status.updates.core + status.updates.plugins + status.updates.themes;
    const summary = `Connected ${url} — WordPress ${status.environment.wp}, ${total} update${total === 1 ? "" : "s"} waiting`;
    await record(db, { orgId: org.id, websiteId: site.id, action: "connect", ok: true, summary, actor: user.id });
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "website.connector_connected", entityType: "website", entityId: site.id, customerId: site.customer_id, summary: `Connected ${site.domain} to command ops` });
    done(site.id);
    return { ok: true, data: summary };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Ask the site to check WordPress.org for updates and report back. */
export async function checkSite(websiteId: string): Promise<R<string>> {
  let c: Awaited<ReturnType<typeof ctx>> | null = null;
  try {
    c = await ctx(websiteId);
    const { url, key } = await connection(c.db, c.org.id, websiteId);
    const status = await callConnector<ConnectorStatus>(url, key, "POST", "/check", undefined, 120_000);
    await storeStatus(c.db, websiteId, status);
    const total = status.updates.core + status.updates.plugins + status.updates.themes;
    const summary = total ? `${total} update${total === 1 ? "" : "s"} waiting` : "Everything is up to date";
    await record(c.db, { orgId: c.org.id, websiteId, action: "check", ok: true, summary, actor: c.user.id });
    done(websiteId);
    return { ok: true, data: summary };
  } catch (e) {
    if (c) await c.db.from("website_connectors").update({ last_error: err(e), updated_at: new Date().toISOString() }).eq("website_id", websiteId).then(() => undefined, () => undefined);
    return { ok: false, error: err(e) };
  }
}

/** Run updates on the site. scope: all | plugins | themes | core | translations; items = plugin files / theme slugs. */
export async function updateSite(websiteId: string, scope: "all" | "plugins" | "themes" | "core" | "translations", items: string[] = []): Promise<R<string>> {
  let c: Awaited<ReturnType<typeof ctx>> | null = null;
  try {
    c = await ctx(websiteId);
    if (!["all", "plugins", "themes", "core", "translations"].includes(scope)) throw new Error("Pick what to update.");
    const clean = (items ?? []).filter((s) => typeof s === "string" && /^[A-Za-z0-9._\/-]{1,200}$/.test(s)).slice(0, 200);
    const { url, key } = await connection(c.db, c.org.id, websiteId);
    const r = await callConnector<UpdateResult>(url, key, "POST", "/update", { type: scope, items: clean }, 280_000);
    const failed = [...(r.plugins ?? []).filter((p) => !p.ok).map((p) => p.name), ...(r.themes ?? []).filter((t) => !t.ok).map((t) => t.slug), ...(r.core && !r.core.ok && r.core.error !== "Already up to date." ? ["WordPress"] : [])];
    const ok = !!r.health_after?.ok;
    const summary = `${r.summary}${failed.length ? ` Didn't update: ${failed.join(", ")}.` : ""}`;
    await record(c.db, { orgId: c.org.id, websiteId, action: "update", scope, ok, summary, detail: r, actor: c.user.id });
    await c.db.from("website_connectors").update({ last_run_at: new Date().toISOString(), last_run_summary: summary, last_run_ok: ok, updated_at: new Date().toISOString() }).eq("website_id", websiteId);
    try {
      const status = await callConnector<ConnectorStatus>(url, key, "GET", "/status", undefined, 60_000);
      await storeStatus(c.db, websiteId, status);
    } catch { /* status refresh is best effort after an update */ }
    await logActivity(c.supabase, { orgId: c.org.id, actorId: c.user.id, action: "website.updated", entityType: "website", entityId: websiteId, customerId: c.site.customer_id, summary: `Ran ${scope} updates on ${c.site.domain}: ${summary}` });
    done(websiteId);
    return ok ? { ok: true, data: summary } : { ok: false, error: `Updates ran but the homepage check failed (${r.health_after?.message ?? "unknown"}). Check the site now. ${summary}` };
  } catch (e) {
    if (c) await record(c.db, { orgId: c.org.id, websiteId, action: "update", scope, ok: false, summary: err(e), actor: c.user.id }).then(() => undefined, () => undefined);
    return { ok: false, error: err(e) };
  }
}

export async function purgeSite(websiteId: string): Promise<R<string>> {
  try {
    const c = await ctx(websiteId);
    const { url, key } = await connection(c.db, c.org.id, websiteId);
    const r = await callConnector<{ purged: string[] }>(url, key, "POST", "/cache/purge");
    const summary = `Caches purged: ${(r.purged ?? []).join(", ") || "none found"}`;
    await record(c.db, { orgId: c.org.id, websiteId, action: "purge", ok: true, summary, actor: c.user.id });
    done(websiteId);
    return { ok: true, data: summary };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function disconnectSite(websiteId: string): Promise<R<string>> {
  try {
    const c = await ctx(websiteId);
    await c.db.from("website_connectors").delete().eq("website_id", websiteId).eq("organisation_id", c.org.id);
    await record(c.db, { orgId: c.org.id, websiteId, action: "disconnect", ok: true, summary: "Disconnected from command ops", actor: c.user.id });
    await logActivity(c.supabase, { orgId: c.org.id, actorId: c.user.id, action: "website.connector_disconnected", entityType: "website", entityId: websiteId, customerId: c.site.customer_id, summary: `Disconnected ${c.site.domain} from command ops` });
    done(websiteId);
    return { ok: true, data: "Disconnected." };
  } catch (e) { return { ok: false, error: err(e) }; }
}
