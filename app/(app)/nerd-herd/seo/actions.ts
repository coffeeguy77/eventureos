"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { callConnector } from "@/lib/nerdherd/connector";
import { gscContext, runStep, seoConnection, type Phase, type SeoSettings, type StepResult } from "@/lib/nerdherd/seo";

/**
 * Nerd Herd → SEO for one website. Owners, admins and managers only. Each "step" is one server call so the page can
 * show progress and nothing runs past the serverless time limit; the page keeps calling until the next phase is "done".
 */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const PHASES: Phase[] = ["audit", "gsc", "pack", "fix", "done"];
const msg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /nh_seo_/.test(m) && /does not exist|could not find/i.test(m) ? "SEO needs the 0123 database update first." : m;
};

async function ctx(websiteId: string) {
  const c = await requireOrg();
  if (!canManage(c.role)) throw new Error("Only owners, admins and managers can run SEO.");
  if (!UUID.test(websiteId)) throw new Error("Refresh and try again.");
  const { data: site } = await c.supabase.from("websites").select("id").eq("id", websiteId).eq("organisation_id", c.org.id).maybeSingle();
  if (!site) throw new Error("That website no longer exists.");
  return { ...c, db: createServiceClient() };
}
const done = (id: string) => { revalidatePath(`/nerd-herd/seo/${id}`); revalidatePath("/nerd-herd/seo"); revalidatePath(`/nerd-herd/websites/${id}`); };

/** One step of a run: audit → Search Console → AI search pack → AI fixes. fix=false stops after Search Console. */
export async function seoStep(websiteId: string, phase: Phase, backedUp: boolean, fix: boolean): Promise<R<StepResult>> {
  try {
    if (!PHASES.includes(phase)) throw new Error("Unknown step.");
    const { db, user } = await ctx(websiteId);
    const r = await runStep(db, websiteId, phase, { actor: user.id, until: Date.now() + 240_000, backedUp, fix });
    if (r.next === "done" || phase !== r.next) done(websiteId);
    return { ok: true, data: r };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function setSeoAuto(websiteId: string, auto: boolean): Promise<R> {
  try {
    const { db, org } = await ctx(websiteId);
    const { error } = await db.from("nh_seo_sites").upsert({ website_id: websiteId, organisation_id: org.id, auto, updated_at: new Date().toISOString() }, { onConflict: "website_id" });
    if (error) throw new Error(error.message);
    done(websiteId);
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** The Search Console properties the organisation's Google connection can see. */
export async function listGscProperties(websiteId: string): Promise<R<{ site: string; permission: string }[]>> {
  try {
    const { db, org } = await ctx(websiteId);
    const g = await gscContext(db, org.id);
    if (!g) throw new Error("Connect Google first: Settings → Integrations → Google Ads, Analytics & Search Console.");
    const { listGscSites } = await import("@/lib/marketing/google");
    return { ok: true, data: (await listGscSites(g)).sort((a, b) => a.site.localeCompare(b.site)) };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function setGscSite(websiteId: string, site: string | null): Promise<R> {
  try {
    const { db, org } = await ctx(websiteId);
    const v = site && /^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s]+\/)$/i.test(site) ? site : null;
    const { error } = await db.from("nh_seo_sites").upsert({ website_id: websiteId, organisation_id: org.id, gsc_site: v, gsc: null, updated_at: new Date().toISOString() }, { onConflict: "website_id" });
    if (error) throw new Error(error.message);
    done(websiteId);
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Change the AI search settings on the site (business details, schema, llms.txt, AI crawlers, verification). */
export async function saveSeoSettings(websiteId: string, settings: Partial<SeoSettings>): Promise<R<string>> {
  try {
    const { db, user } = await ctx(websiteId);
    const c = await seoConnection(db, websiteId);
    const r = await callConnector<{ changed: boolean; change_id?: string; settings: SeoSettings }>(c.url, c.key, "POST", "/seo/settings", { settings, summary: "SEO settings changed in Nerd Herd" }, 60_000);
    const { data: row } = await db.from("nh_seo_sites").select("checks").eq("website_id", websiteId).maybeSingle();
    if (row?.checks) await db.from("nh_seo_sites").update({ checks: { ...(row.checks as object), settings: r.settings }, updated_at: new Date().toISOString() }).eq("website_id", websiteId);
    if (r.changed) await db.from("nh_seo_runs").insert({ organisation_id: c.orgId, website_id: websiteId, kind: "settings", ok: true, summary: "SEO settings changed", changes: r.change_id ? [{ change_id: r.change_id, summary: "SEO settings changed" }] : [], actor: user.id });
    done(websiteId);
    return { ok: true, data: r.changed ? "Saved on the site." : "Nothing changed." };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Undo one change on the site (newest first per page, as WordPress keeps them). */
export async function undoSeoChange(websiteId: string, changeId: string): Promise<R<string>> {
  try {
    if (!/^c[a-z0-9]{6,40}$/.test(changeId)) throw new Error("That isn't a change id.");
    const { db } = await ctx(websiteId);
    const c = await seoConnection(db, websiteId);
    await callConnector(c.url, c.key, "POST", "/undo", { change_id: changeId }, 60_000);
    done(websiteId);
    return { ok: true, data: "Undone on the site." };
  } catch (e) { return { ok: false, error: msg(e) }; }
}
