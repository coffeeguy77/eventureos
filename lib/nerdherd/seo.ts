import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callConnector } from "./connector";
import { costOf, type Usage } from "./ai-agent";
import { readAiSettings } from "./ai-runner";
import { ANTHROPIC_URL, anthropicHeaders } from "@/lib/ai/claude";
import { orgAiKey } from "@/lib/ai/key";

/**
 * Nerd Herd SEO + AI search — the engine behind Nerd Herd → SEO, run from the page (step by step) and weekly by
 * /api/cron/seo. Works through the Web Culture Connector 1.5.0+ (GET /seo/audit, /seo/page, /seo/site,
 * POST /seo/apply, /seo/settings) and the organisation's Google (Marketing) connection for Search Console.
 *
 * Steps, in order, each one short enough for a serverless call:
 *   audit  — loads every public page as visitors see it; scores pages and the site (resumes where it stopped)
 *   gsc    — Search Console clicks, impressions, top searches and top pages (last 28 days vs the 28 before)
 *   pack   — AI search pack: business schema from the site's own words, FAQ schema, llms.txt, AI crawlers welcome,
 *            page-builder templates hidden from search
 *   fix    — Claude writes missing/weak titles, descriptions and image alt text (it looks at the images), a few pages
 *            per step; database backup on the site first; every change logged on the site with an undo copy
 * Fully automatic on sites set to automatic; the AI never invents facts — only what's on the site.
 */

type Db = SupabaseClient;
export type Phase = "audit" | "gsc" | "pack" | "fix" | "done";
export const MIN_VERSION = "1.5.0";

const vNum = (v: string) => v.split(".").map((x) => Number(x) || 0).reduce((a, b, i) => a + b / 1000 ** i, 0);

// ------------------------------------------------------------------------------------------------
// Types from the connector
// ------------------------------------------------------------------------------------------------

export type Img = { src: string; alt: string | null; chrome: boolean; id: number | null; lib_alt: string | null };
type Fields = { plugin: string; title: string; description: string; focus_keyword: string; noindex: boolean; writable: boolean };
type PageRead = {
  title: string; description: string; robots: string; canonical: string; og_image: boolean; h1: string[]; h2: number; words: number;
  images: Img[]; schema: string[]; links_in: number; lang: string; viewport: boolean; headings: string[]; text?: string; h2_first?: string; h2_first_cls?: string;
};
type AuditItem = { id: number; type: string; url: string; name: string; front: boolean; modified: string; fields: Fields; fetched: boolean; http: number; error: string | null; page: PageRead | null };
export type SiteChecks = {
  name: string; tagline: string; home: string; https: boolean; search_visible: boolean; permalinks: boolean; seo_plugin: string;
  sitemap: { url: string; ok: boolean; http: number; error: string | null };
  robots: { ok: boolean; file: boolean; blocked: string[]; text: string };
  llms: { source: "none" | "yoast" | "file" | "connector"; ok: boolean; text: string };
  verify: { google: boolean; bing: boolean };
  schema_types: string[]; home_fetched: boolean; home_error: string | null; home_lang: string; home_viewport: boolean | null;
  post_types: { name: string; label: string; published: number; hidden: boolean; builder: boolean }[];
  settings: SeoSettings; connector: string;
};
export type Business = {
  type: string; name: string; description: string; phone: string; email: string; street: string; locality: string; region: string; postcode: string; country: string;
  founded: string; logo: string; image: string; price_range: string; area: (string | { name: string })[]; services: { name: string; url?: string; description?: string }[]; same_as: string[];
};
export type SeoSettings = {
  business: Business; schema: boolean; faq_schema: boolean; llms: boolean; llms_intro: string; llms_pages: number[];
  ai_crawlers: "default" | "allow" | "block"; noindex_types: string[]; verify_google: string; verify_bing: string; h1_class: string; alt_fill: boolean; updated: number;
};

export type Issue = { code: string; label: string; severity: "high" | "med" | "low"; fix: "ai" | "pack" | "manual" };
export type GscSummary = {
  site: string; from: string; to: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  prev: { clicks: number; impressions: number; ctr: number; position: number };
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  pages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[];
};

// ------------------------------------------------------------------------------------------------
// Connection + state
// ------------------------------------------------------------------------------------------------

export async function seoConnection(db: Db, websiteId: string) {
  const [{ data: conn }, { data: k }, { data: w }] = await Promise.all([
    db.from("website_connectors").select("site_url, connector_version, organisation_id").eq("website_id", websiteId).maybeSingle(),
    db.from("website_connector_keys").select("key").eq("website_id", websiteId).maybeSingle(),
    db.from("websites").select("id, domain, customer_id, organisation_id").eq("id", websiteId).maybeSingle(),
  ]);
  if (!w) throw new Error("That website no longer exists.");
  if (!conn || !k?.key) throw new Error("Connect this site to the Web Culture Connector first (Websites → the site → WordPress command ops).");
  const version = (conn.connector_version as string | null) ?? "0";
  return { url: conn.site_url as string, key: k.key as string, version, outdated: vNum(version) < vNum(MIN_VERSION), domain: w.domain as string, customerId: (w.customer_id as string | null) ?? null, orgId: w.organisation_id as string, websiteId };
}
export type Conn = Awaited<ReturnType<typeof seoConnection>>;

async function siteRow(db: Db, c: Conn) {
  const { data } = await db.from("nh_seo_sites").select("*").eq("website_id", c.websiteId).maybeSingle();
  if (data) return data as SeoSiteRow;
  const row = { website_id: c.websiteId, organisation_id: c.orgId };
  const { data: made, error } = await db.from("nh_seo_sites").upsert(row, { onConflict: "website_id" }).select("*").single();
  if (error) throw new Error(/does not exist|could not find/i.test(error.message) ? "SEO needs the 0123 database update first." : error.message);
  return made as SeoSiteRow;
}
export type SeoSiteRow = {
  website_id: string; organisation_id: string; auto: boolean; gsc_site: string | null; score: number | null; pages: number; issues: number;
  checks: (SiteChecks & { site_issues?: Issue[]; chrome_images?: Img[] }) | null; gsc: GscSummary | null; status: string; audit_offset: number | null;
  last_audit_at: string | null; last_fix_at: string | null; last_pack_at: string | null; last_gsc_at: string | null; last_error: string | null;
};

async function patchSite(db: Db, websiteId: string, patch: Record<string, unknown>) {
  await db.from("nh_seo_sites").update({ ...patch, updated_at: new Date().toISOString() }).eq("website_id", websiteId);
}

async function logRun(db: Db, c: Conn, r: { kind: "audit" | "fix" | "pack" | "gsc" | "settings"; ok: boolean; summary: string; changes?: unknown[]; cost?: number; actor?: string | null }) {
  await db.from("nh_seo_runs").insert({ organisation_id: c.orgId, website_id: c.websiteId, kind: r.kind, ok: r.ok, summary: r.summary.slice(0, 2000), changes: r.changes ?? [], cost_usd: Math.round((r.cost ?? 0) * 10000) / 10000, actor: r.actor ?? null });
}

/** A line in the client's maintenance history (what they see in their portal). */
async function clientHistory(db: Db, c: Conn, summary: string, detail: unknown, actor: string | null) {
  await db.from("website_maintenance_runs").insert({ organisation_id: c.orgId, website_id: c.websiteId, action: "seo", scope: null, ok: true, summary: summary.slice(0, 2000), detail, actor, public: true }).then(() => null, () => null);
}

// ------------------------------------------------------------------------------------------------
// Scoring
// ------------------------------------------------------------------------------------------------

const W = { high: 18, med: 7, low: 2 } as const;
const BAD_ALT = /^(image|img|photo|picture|logo|banner|untitled|dsc[\w-]*|img[_-]?\d+.*|[\w-]+\.(jpe?g|png|webp|gif))$/i;
export const badAlt = (alt: string | null | undefined) => alt == null || alt.trim() === "" || BAD_ALT.test(alt.trim());
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const letters = (s: string) => s.toLowerCase().replace(/&amp;|&/g, "and").replace(/[^a-z0-9]+/g, "");
/** The heading text is the page's own name (the theme's title band). */
export const titleMatch = (heading: string, name: string) => { const h = letters(heading), n = letters(name); return !!h && !!n && (h === n || (n.length > 4 && h.startsWith(n)) || (h.length > 4 && n.startsWith(h))); };

/** The class on the theme's page-title heading, when pages print their title as an H2 instead of an H1. */
export function titleH2Class(items: AuditItem[]): string | null {
  const cand = items.filter((i) => i.page && i.page.h1.length === 0 && i.page.h2_first && i.page.h2_first_cls && titleMatch(i.page.h2_first, i.name));
  const noH1 = items.filter((i) => i.page && i.page.h1.length === 0).length;
  if (cand.length < 2 || cand.length < noH1 * 0.6) return null;
  const counts = new Map<string, number>();
  for (const i of cand) for (const t of new Set(i.page!.h2_first_cls!.split(/\s+/).filter((x) => /^[A-Za-z][A-Za-z0-9_-]{1,60}$/.test(x)))) counts.set(t, (counts.get(t) ?? 0) + 1);
  const all = [...counts].filter(([, n]) => n === cand.length).map(([t]) => t);
  // the most specific class: page/breadcrumb/title words first, never a generic builder class
  const generic = /^(elementor-|wp-block|has-|is-|e-|t-|text-|title$|heading$)/;
  const pick = all.filter((t) => !generic.test(t)).sort((a, b) => Number(/title|breadcrumb|page/i.test(b)) - Number(/title|breadcrumb|page/i.test(a)))[0];
  return pick ?? null;
}

export function pageIssues(it: AuditItem, ctx: { dupTitles: Set<string>; dupDescs: Set<string>; chrome: Set<string> }): Issue[] {
  const out: Issue[] = [];
  const p = it.page;
  if (!it.fetched || !p) {
    out.push({ code: "fetch", label: `Couldn't load the page to check it (${it.error ?? "no answer"})`, severity: "med", fix: "manual" });
    if (!it.fields.title && !it.fields.description) out.push({ code: "meta_missing", label: "No SEO title or description set", severity: "high", fix: "ai" });
    return out;
  }
  if (/noindex/i.test(p.robots) && !it.fields.noindex) out.push({ code: "noindex", label: "Search engines are told not to index this page", severity: "high", fix: "manual" });
  const t = p.title.trim();
  if (!t) out.push({ code: "title_missing", label: "No page title", severity: "high", fix: "ai" });
  else {
    if (t.length < 30) out.push({ code: "title_short", label: `Title is short (${t.length} characters) — room for what the page is about and where`, severity: "med", fix: "ai" });
    if (t.length > 65) out.push({ code: "title_long", label: `Title is long (${t.length} characters) — Google will cut it off`, severity: "low", fix: "ai" });
    if (ctx.dupTitles.has(norm(t))) out.push({ code: "title_dup", label: "Same title as another page", severity: "med", fix: "ai" });
  }
  const d = p.description.trim();
  if (!d) out.push({ code: "desc_missing", label: "No meta description — Google and AI tools make one up", severity: "high", fix: "ai" });
  else {
    if (d.length < 70) out.push({ code: "desc_short", label: `Description is short (${d.length} characters)`, severity: "low", fix: "ai" });
    if (d.length > 170) out.push({ code: "desc_long", label: `Description is long (${d.length} characters) — it will be cut off`, severity: "low", fix: "ai" });
    if (ctx.dupDescs.has(norm(d))) out.push({ code: "desc_dup", label: "Same description as another page", severity: "med", fix: "ai" });
  }
  if (p.h1.length === 0) out.push({ code: "h1_missing", label: p.h2_first && titleMatch(p.h2_first, it.name) ? "No main heading (H1) — the page title is an H2" : "No main heading (H1)", severity: "med", fix: p.h2_first && titleMatch(p.h2_first, it.name) ? "pack" : "manual" });
  else if (p.h1.length > 1) out.push({ code: "h1_many", label: `${p.h1.length} main headings (H1) — one is best`, severity: "low", fix: "manual" });
  if (p.words < 150) out.push({ code: "thin", label: `Very little text (${p.words} words) — search and AI tools have little to go on`, severity: it.front ? "low" : "med", fix: "manual" });
  const own = p.images.filter((i) => !i.chrome && !ctx.chrome.has(i.src));
  const noAlt = own.filter((i) => badAlt(i.alt));
  const fixable = noAlt.filter((i) => i.id && badAlt(i.lib_alt));
  const themeIgnores = noAlt.filter((i) => i.id && !badAlt(i.lib_alt));
  if (fixable.length) out.push({ code: "alt_missing", label: `${fixable.length} image${fixable.length === 1 ? "" : "s"} without a description (alt text)`, severity: fixable.length > 2 ? "med" : "low", fix: "ai" });
  const notLib = noAlt.filter((i) => !i.id);
  if (notLib.length) out.push({ code: "alt_unmanaged", label: `${notLib.length} image${notLib.length === 1 ? "" : "s"} without alt text that aren't in the media library (set in the page builder)`, severity: "low", fix: "manual" });
  if (themeIgnores.length) out.push({ code: "alt_theme", label: `${themeIgnores.length} image${themeIgnores.length === 1 ? " has" : "s have"} alt text in the library but the theme or widget doesn't use it`, severity: "low", fix: "pack" });
  if (!p.og_image) out.push({ code: "og_image", label: "No share image (og:image) for social and AI previews", severity: "low", fix: "manual" });
  if (it.fields.writable === false) out.push({ code: "aioseo", label: "Titles live in All in One SEO — change them in WordPress", severity: "low", fix: "manual" });
  return out;
}

const BUSINESS_TYPES = /(LocalBusiness|Organization|Contractor|Business|Store|Restaurant|Cafe|Service|Agency|Plumber|Electrician|Roofing|Dentist|Physician|Attorney|Hotel|Bakery|Corporation)$/;

export function siteIssues(s: SiteChecks): Issue[] {
  const out: Issue[] = [];
  if (!s.search_visible) out.push({ code: "hidden", label: "WordPress is set to discourage search engines (Settings → Reading)", severity: "high", fix: "manual" });
  if (!s.https) out.push({ code: "https", label: "The site address isn't https", severity: "high", fix: "manual" });
  if (!s.sitemap.ok) out.push({ code: "sitemap", label: `Sitemap isn't working (${s.sitemap.url}${s.sitemap.error ? `: ${s.sitemap.error}` : ""})`, severity: "high", fix: "manual" });
  if (!s.home_fetched && s.home_error && /bot check/i.test(s.home_error)) out.push({ code: "botcheck", label: "The host's bot protection answers instead of the site at times — it may turn away search and AI crawlers", severity: "med", fix: "manual" });
  const aiBlocked = s.robots.blocked.filter((b) => b !== "all crawlers");
  if (s.robots.blocked.includes("all crawlers")) out.push({ code: "robots_all", label: "robots.txt blocks every crawler", severity: "high", fix: "manual" });
  if (aiBlocked.length) out.push({ code: "robots_ai", label: `robots.txt blocks AI tools: ${aiBlocked.join(", ")}`, severity: "med", fix: s.robots.file ? "manual" : "pack" });
  if (s.settings.ai_crawlers !== "allow" && !aiBlocked.length) out.push({ code: "ai_welcome", label: "AI search crawlers (ChatGPT, Claude, Perplexity, Gemini) aren't explicitly welcomed in robots.txt", severity: "low", fix: "pack" });
  if (s.llms.source === "none") out.push({ code: "llms", label: "No llms.txt (the guide AI tools read)", severity: "med", fix: "pack" });
  const hasBiz = s.schema_types.some((t) => BUSINESS_TYPES.test(t) && t !== "WebSite");
  const hasLocal = s.schema_types.some((t) => BUSINESS_TYPES.test(t) && !/^Organization$/.test(t));
  if (!hasBiz && !s.settings.schema) out.push({ code: "schema_business", label: "No business details for Google and AI tools (schema: name, phone, area served, services)", severity: "med", fix: "pack" });
  else if (!hasLocal && !s.settings.schema) out.push({ code: "schema_local", label: "Only a basic Organization schema — no local business details (phone, area served, services)", severity: "low", fix: "pack" });
  const junk = s.post_types.filter((t) => t.builder && !t.hidden && t.published > 0);
  if (junk.length) out.push({ code: "junk_types", label: `Page-builder templates visible to Google: ${junk.map((t) => `${t.label} (${t.published})`).join(", ")}`, severity: "med", fix: "pack" });
  if (!s.verify.google) out.push({ code: "verify_google", label: "No Google Search Console verification on the site", severity: "low", fix: "manual" });
  if (s.home_viewport === false) out.push({ code: "viewport", label: "Homepage has no mobile viewport tag", severity: "med", fix: "manual" });
  return out;
}

export const scoreTone = (s: number | null) => (s == null ? "neutral" : s >= 85 ? "green" : s >= 65 ? "amber" : "red") as "neutral" | "green" | "amber" | "red";
export const scoreOf = (issues: Issue[]) => Math.max(0, 100 - issues.reduce((s, i) => s + W[i.severity], 0));

// ------------------------------------------------------------------------------------------------
// Step: audit
// ------------------------------------------------------------------------------------------------

/** Audit from where the last call stopped. Returns true when the whole site is done. */
export async function stepAudit(db: Db, c: Conn, until: number): Promise<{ done: boolean; note: string }> {
  const row = await siteRow(db, c);
  let offset = row.status === "auditing" && row.audit_offset != null ? row.audit_offset : 0;
  if (offset === 0) await patchSite(db, c.websiteId, { status: "auditing", audit_offset: 0, last_error: null });
  let checks: SiteChecks | null = offset === 0 ? null : (row.checks as SiteChecks | null);
  const seen: number[] = [];
  while (Date.now() < until - 35_000) {
    const r = await callConnector<{ total: number; next_offset: number | null; items: AuditItem[]; site: SiteChecks | null }>(c.url, c.key, "GET", `/seo/audit?offset=${offset}&limit=8&budget=22`, undefined, 90_000);
    if (r.site) checks = r.site;
    const now = new Date().toISOString();
    if (r.items.length) {
      const rows = r.items.map((it) => ({ website_id: c.websiteId, organisation_id: c.orgId, post_id: it.id, url: it.url, name: it.name, type: it.type, front: it.front, data: it, audited_at: now }));
      const { error } = await db.from("nh_seo_pages").upsert(rows, { onConflict: "website_id,post_id" });
      if (error) throw new Error(error.message);
      seen.push(...r.items.map((x) => x.id));
    }
    if (r.next_offset == null) {
      await finishAudit(db, c, checks);
      return { done: true, note: `Checked ${r.total} page${r.total === 1 ? "" : "s"}` };
    }
    if (r.next_offset === offset) break; // nothing moved (a slow page) — carry on next call
    offset = r.next_offset;
    await patchSite(db, c.websiteId, { audit_offset: offset, ...(checks ? { checks } : {}) });
  }
  return { done: false, note: `Checked ${offset} pages so far` };
}

/** Scores every page against the whole site (duplicates, images in the header/footer) and the site checks. */
async function finishAudit(db: Db, c: Conn, checks: SiteChecks | null) {
  const { data: all } = await db.from("nh_seo_pages").select("post_id, data, audited_at, gsc").eq("website_id", c.websiteId);
  const cutoff = Date.now() - 6 * 3600_000;
  const rows = (all ?? []) as { post_id: number; data: AuditItem; audited_at: string; gsc: unknown }[];
  const stale = rows.filter((r) => Date.parse(r.audited_at) < cutoff).map((r) => r.post_id);
  if (stale.length) await db.from("nh_seo_pages").delete().eq("website_id", c.websiteId).in("post_id", stale); // pages gone or now hidden
  const live = rows.filter((r) => !stale.includes(r.post_id));
  const count = (vals: string[]) => vals.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>());
  const titles = count(live.map((r) => norm(r.data.page?.title ?? "")).filter(Boolean));
  const descs = count(live.map((r) => norm(r.data.page?.description ?? "")).filter(Boolean));
  // images on most pages are part of the header/footer/slider — reported once for the site, not on every page
  const imgPages = count(live.flatMap((r) => [...new Set((r.data.page?.images ?? []).map((i) => i.src))]));
  const chrome = new Set([...imgPages].filter(([, n]) => live.length >= 4 && n >= Math.max(3, live.length * 0.5)).map(([src]) => src));
  const ctx = { dupTitles: new Set([...titles].filter(([, n]) => n > 1).map(([t]) => t)), dupDescs: new Set([...descs].filter(([, n]) => n > 1).map(([t]) => t)), chrome };
  let total = 0, issues = 0;
  for (const r of live) {
    const iss = pageIssues(r.data, ctx);
    const sc = scoreOf(iss);
    total += sc; issues += iss.length;
    await db.from("nh_seo_pages").update({ issues: iss, score: sc }).eq("website_id", c.websiteId).eq("post_id", r.post_id);
  }
  const chromeImgs: Img[] = [];
  for (const r of live) for (const i of r.data.page?.images ?? []) if (chrome.has(i.src) && !chromeImgs.some((x) => x.src === i.src)) chromeImgs.push(i);
  const sIss = checks ? siteIssues(checks) : [];
  const chromeBad = chromeImgs.filter((i) => badAlt(i.alt) && i.id && badAlt(i.lib_alt));
  if (chromeBad.length) sIss.push({ code: "alt_chrome", label: `${chromeBad.length} image${chromeBad.length === 1 ? "" : "s"} shown on every page (header, footer, logos) without alt text`, severity: "low", fix: "ai" });
  const pageAvg = live.length ? total / live.length : 0;
  const score = Math.round(pageAvg * 0.7 + scoreOf(sIss) * 0.3);
  await patchSite(db, c.websiteId, {
    status: "idle", audit_offset: null, score, pages: live.length, issues: issues + sIss.length, last_audit_at: new Date().toISOString(), last_error: null,
    checks: checks ? { ...checks, site_issues: sIss, chrome_images: chromeImgs.slice(0, 30) } : null,
  });
  await logRun(db, c, { kind: "audit", ok: true, summary: `SEO check: score ${score}/100 across ${live.length} page${live.length === 1 ? "" : "s"}, ${issues + sIss.length} thing${issues + sIss.length === 1 ? "" : "s"} to improve` });
}

// ------------------------------------------------------------------------------------------------
// Step: Search Console
// ------------------------------------------------------------------------------------------------

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function gscContext(db: Db, orgId: string) {
  const { buildContext } = await import("@/lib/integrations/sync-runner");
  try { return await buildContext(db, "service", orgId, "google_marketing", null); } catch { return null; }
}

/** The Search Console property for a domain: domain property first, then the https address the site uses. */
export function matchGscSite(sites: { site: string }[], domain: string, siteUrl: string) {
  const bare = domain.toLowerCase().replace(/^www\./, "");
  const want = [`sc-domain:${bare}`, `${siteUrl.replace(/\/+$/, "")}/`, `https://${bare}/`, `https://www.${bare}/`, `http://${bare}/`, `http://www.${bare}/`];
  for (const w of want) { const hit = sites.find((s) => s.site.toLowerCase() === w.toLowerCase()); if (hit) return hit.site; }
  return null;
}

export async function stepGsc(db: Db, c: Conn): Promise<string> {
  const ctx = await gscContext(db, c.orgId);
  if (!ctx) return "Search Console skipped — connect Google (Settings → Integrations → Google Ads, Analytics & Search Console)";
  const { listGscSites, gscQuery } = await import("@/lib/marketing/google");
  const row = await siteRow(db, c);
  let site = row.gsc_site;
  if (!site) {
    site = matchGscSite(await listGscSites(ctx), c.domain, c.url);
    if (!site) { await patchSite(db, c.websiteId, { last_gsc_at: new Date().toISOString() }); return `Search Console: ${c.domain} isn't in the connected Google account yet`; }
    await patchSite(db, c.websiteId, { gsc_site: site });
  }
  const end = new Date(Date.now() - 2 * 86400_000), start = new Date(end.getTime() - 27 * 86400_000);
  const pEnd = new Date(start.getTime() - 86400_000), pStart = new Date(pEnd.getTime() - 27 * 86400_000);
  const tot = (rows: { clicks: number; impressions: number; position: number }[]) => {
    const clicks = rows.reduce((s, r) => s + r.clicks, 0), impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const position = impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : 0;
    return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: Math.round(position * 10) / 10 };
  };
  const [now, prev, queries, pages] = await Promise.all([
    gscQuery(ctx, site, { startDate: ymd(start), endDate: ymd(end), dimensions: ["date"], rowLimit: 100 }),
    gscQuery(ctx, site, { startDate: ymd(pStart), endDate: ymd(pEnd), dimensions: ["date"], rowLimit: 100 }),
    gscQuery(ctx, site, { startDate: ymd(start), endDate: ymd(end), dimensions: ["query"], rowLimit: 50 }),
    gscQuery(ctx, site, { startDate: ymd(start), endDate: ymd(end), dimensions: ["page"], rowLimit: 200 }),
  ]);
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  const summary: GscSummary = {
    site, from: ymd(start), to: ymd(end), totals: tot(now), prev: tot(prev),
    queries: queries.map((q) => ({ query: q.keys[0] ?? "", clicks: q.clicks, impressions: q.impressions, ctr: r4(q.ctr), position: Math.round(q.position * 10) / 10 })),
    pages: pages.map((q) => ({ page: q.keys[0] ?? "", clicks: q.clicks, impressions: q.impressions, ctr: r4(q.ctr), position: Math.round(q.position * 10) / 10 })),
  };
  await patchSite(db, c.websiteId, { gsc: summary, last_gsc_at: new Date().toISOString() });
  // each page's own figures, matched on its address (ignoring http/www and trailing slashes)
  const key = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const byUrl = new Map(summary.pages.map((p) => [key(p.page), p]));
  const { data: pg } = await db.from("nh_seo_pages").select("post_id, url").eq("website_id", c.websiteId);
  for (const p of (pg ?? []) as { post_id: number; url: string }[]) {
    const g = byUrl.get(key(p.url));
    await db.from("nh_seo_pages").update({ gsc: g ? { clicks: g.clicks, impressions: g.impressions, ctr: g.ctr, position: g.position } : null }).eq("website_id", c.websiteId).eq("post_id", p.post_id);
  }
  await logRun(db, c, { kind: "gsc", ok: true, summary: `Search Console (${site}): ${summary.totals.clicks} clicks, ${summary.totals.impressions} impressions in the last 28 days` });
  return `Search Console: ${summary.totals.clicks} clicks, ${summary.totals.impressions} impressions (28 days)`;
}

// ------------------------------------------------------------------------------------------------
// Claude
// ------------------------------------------------------------------------------------------------

type Content = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };

async function claudeJSON(key: string, model: string, system: string, content: Content[], maxTokens = 1500): Promise<{ json: Record<string, unknown>; usage: Usage }> {
  const send = async (blocks: Content[]) => fetch(ANTHROPIC_URL, {
    method: "POST", headers: anthropicHeaders(key), signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: "user", content: blocks }] }),
  });
  let res = await send(content);
  // an image Claude can't fetch fails the whole request — try once more without images
  if (res.status === 400 && content.some((b) => b.type === "image")) res = await send(content.filter((b) => b.type === "text"));
  if (!res.ok) {
    const t = (await res.text()).slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new Error("Claude didn't accept the API key — check Settings → Integrations → AI.");
    throw new Error(`Claude API ${res.status}: ${t}`);
  }
  const j = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: Usage };
  const text = j.content?.find((b) => b.type === "text")?.text ?? "";
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("Claude's answer wasn't the expected JSON.");
  return { json: JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>, usage: j.usage ?? {} };
}

async function aiBudget(db: Db, orgId: string) {
  const { data: org } = await db.from("organisations").select("settings").eq("id", orgId).single();
  const ai = readAiSettings(org?.settings);
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const [{ data: a }, { data: b }] = await Promise.all([
    db.from("nh_ai_jobs").select("cost_usd").eq("organisation_id", orgId).gte("created_at", start.toISOString()),
    db.from("nh_seo_runs").select("cost_usd").eq("organisation_id", orgId).gte("created_at", start.toISOString()),
  ]);
  const spent = [...(a ?? []), ...(b ?? [])].reduce((s, r) => s + Number((r as { cost_usd: number }).cost_usd || 0), 0);
  const key = await orgAiKey(orgId);
  return { ai, spent, left: ai.monthlyCapUsd - spent, key };
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ------------------------------------------------------------------------------------------------
// Step: AI search pack
// ------------------------------------------------------------------------------------------------

const PACK_SYSTEM = `You set up a small business website for AI search (ChatGPT, Claude, Perplexity, Google AI Overviews) and local SEO.
From the website text you're given, fill in the business profile that becomes schema.org JSON-LD and llms.txt.
Rules:
- Use ONLY facts stated in the text. Never guess or invent a phone number, email, address, founding year, area or service. Leave a field "" (or []) when the text doesn't say it.
- "type": the most specific schema.org type that fits (e.g. GeneralContractor, RoofingContractor, Plumber, Electrician, HomeAndConstructionBusiness, CafeOrCoffeeShop, Restaurant, ProfessionalService, LocalBusiness).
- "description": 1–2 plain sentences, what they do and where, in their own terms (max 300 characters).
- "services": the business's main services, each {"name", "url" (only a page address from the list given), "description" (max 120 chars, from the text)} — at most 8.
- "area": towns/regions they serve, only if stated.
- "llms_intro": 2–4 sentences for AI assistants: who they are, what they do, who for, where (facts only).
Reply with ONLY this JSON:
{"business":{"type":"","name":"","description":"","phone":"","email":"","street":"","locality":"","region":"","postcode":"","country":"AU","founded":"","price_range":"","area":[],"services":[{"name":"","url":"","description":""}]},"llms_intro":""}`;

export async function stepPack(db: Db, c: Conn, actor: string | null): Promise<string> {
  const row = await siteRow(db, c);
  const checks = row.checks;
  if (!checks) return "Run the SEO check first";
  const b = await aiBudget(db, c.orgId);
  if (!b.key) return "AI search pack skipped — no Claude API key (Settings → Integrations → AI)";
  if (b.left <= 0.05) return `AI search pack skipped — this month's AI budget (US$${b.ai.monthlyCapUsd.toFixed(2)}) is used up`;
  const { data: pages } = await db.from("nh_seo_pages").select("post_id, url, name, type, front, data").eq("website_id", c.websiteId).order("front", { ascending: false }).limit(200);
  const list = (pages ?? []) as { post_id: number; url: string; name: string; type: string; front: boolean; data: AuditItem }[];
  // the homepage, then about/contact/services pages give the facts
  const want = (n: string) => /about|company|who we|contact|service|team|story/i.test(n);
  const picks = [...list.filter((p) => p.front), ...list.filter((p) => !p.front && p.type === "page" && want(`${p.name} ${p.url}`)), ...list.filter((p) => p.type !== "page" && /service/i.test(p.type))].slice(0, 6);
  const texts: string[] = [];
  for (const p of picks) {
    try {
      const r = await callConnector<{ page: PageRead | null; name: string; url: string }>(c.url, c.key, "GET", `/seo/page?id=${p.post_id}`, undefined, 60_000);
      texts.push(`### ${r.name} — ${r.url}\n${(r.page?.text ?? "").slice(0, 3500)}`);
    } catch { /* one page missing is fine */ }
  }
  const prompt = `SITE: ${checks.name} — ${checks.home}\nTAGLINE: ${checks.tagline}\nPAGES ON THE SITE:\n${list.slice(0, 80).map((p) => `- ${p.name}: ${p.url}`).join("\n")}\n\nPAGE TEXT:\n${texts.join("\n\n")}`;
  const { json, usage } = await claudeJSON(b.key, b.ai.model, PACK_SYSTEM, [{ type: "text", text: prompt }], 1800);
  const cost = costOf(b.ai.model, usage);
  const got = (json.business && typeof json.business === "object" ? json.business : {}) as Record<string, unknown>;
  const cur = checks.settings.business;
  const pick = (k: keyof Business, max = 160) => (str(cur[k] as unknown, max) || str(got[k], max));
  const pageUrls = new Set(list.map((p) => p.url));
  const services = (Array.isArray(got.services) ? got.services : []).slice(0, 8).map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const url = str(o.url, 300);
    return { name: str(o.name, 120), ...(url && pageUrls.has(url) ? { url } : {}), ...(str(o.description, 160) ? { description: str(o.description, 160) } : {}) };
  }).filter((s) => s.name);
  const area = (Array.isArray(got.area) ? got.area : []).map((a) => str(a, 80)).filter(Boolean).slice(0, 12);
  const business: Partial<Business> = {
    type: /^[A-Za-z]{3,40}$/.test(str(cur.type)) && cur.type !== "LocalBusiness" ? cur.type : (/^[A-Za-z]{3,40}$/.test(str(got.type)) ? str(got.type) : "LocalBusiness"),
    name: pick("name") || checks.name, description: pick("description", 300), phone: pick("phone"), email: pick("email"), street: pick("street"), locality: pick("locality"),
    region: pick("region"), postcode: pick("postcode"), country: pick("country") || "AU", founded: pick("founded"), price_range: pick("price_range"),
    area: cur.area?.length ? cur.area : area, services: cur.services?.length ? cur.services : services,
  };
  // don't print a second business schema when the site already has one (Yoast Local, a theme, a hand-made one)
  const hasBizAlready = checks.schema_types.some((t) => BUSINESS_TYPES.test(t) && !/^(Organization|WebSite)$/.test(t)) && !checks.settings.schema;
  const junk = checks.post_types.filter((t) => t.builder && t.published > 0).map((t) => t.name);
  const h1Class = checks.settings.h1_class || titleH2Class(list.map((p) => p.data)) || "";
  const settings = {
    h1_class: h1Class, alt_fill: true,
    business, schema: !hasBizAlready, faq_schema: true, llms: true, llms_intro: checks.settings.llms_intro || str(json.llms_intro, 1200),
    ai_crawlers: checks.robots.file ? checks.settings.ai_crawlers : "allow",
    noindex_types: [...new Set([...checks.settings.noindex_types, ...junk])],
  };
  const r = await callConnector<{ changed: boolean; change_id?: string; settings: SeoSettings }>(c.url, c.key, "POST", "/seo/settings", { settings, summary: "AI search pack: business details for Google and AI tools, FAQ schema, llms.txt, AI crawlers welcome, builder templates hidden from search" }, 60_000);
  const parts = [
    settings.schema ? `business schema (${business.type}${business.phone ? ", phone" : ""}${(business.area as unknown[])?.length ? ", area served" : ""}${(business.services as unknown[])?.length ? `, ${(business.services as unknown[]).length} services` : ""})` : "kept the existing business schema",
    "FAQ schema", checks.llms.source === "none" ? "llms.txt" : null, !checks.robots.file ? "AI crawlers welcomed in robots.txt" : null,
    junk.length ? `${junk.length} template type${junk.length === 1 ? "" : "s"} hidden from search` : null,
    h1Class && !checks.settings.h1_class ? "page titles served as the main heading (H1)" : null,
    !checks.settings.alt_fill ? "library alt text filled in where the theme leaves it out" : null,
  ].filter(Boolean);
  const summary = `AI search pack: ${parts.join(", ")}`;
  await patchSite(db, c.websiteId, { last_pack_at: new Date().toISOString(), checks: { ...checks, settings: r.settings } });
  await logRun(db, c, { kind: "pack", ok: true, summary, changes: r.change_id ? [{ change_id: r.change_id, summary }] : [], cost, actor });
  if (r.changed) await clientHistory(db, c, `SEO: set the site up for AI search — ${parts.join(", ")}`, { kind: "seo_pack" }, actor);
  return summary;
}

// ------------------------------------------------------------------------------------------------
// Step: AI fixes
// ------------------------------------------------------------------------------------------------

const FIX_SYSTEM = `You are an SEO specialist improving one page of a small business website for Google and AI search tools.
You get the page's current title and description, its headings and text, the business it belongs to, and (when available) the searches it already shows up for in Google.
Write:
- "title": 50–60 characters. What the page is about + the place where it fits, then " | " + the business name (shorten the name if needed). Natural, not stuffed. Use the page's own words and the searches people actually use.
- "description": 140–158 characters. A specific, factual summary of the page that makes someone want to click. Only facts from the page text — never invent prices, years, awards, guarantees or claims.
- "focus_keyword": the 2–4 word phrase this page should rank for.
- "alts": for each image given, a short literal description of what the image shows (max 110 characters), using the page context for names of places/projects only when the page makes clear the image shows them. No "image of", no keyword stuffing. Use null for an image you can't see.
Keep a current title or description if it is already good (return null for it). Australian English.
Reply with ONLY JSON: {"title":string|null,"description":string|null,"focus_keyword":string|null,"alts":[{"id":number,"alt":string|null}],"note":"one short line on what you changed"}`;

const AI_CODES = new Set(["title_missing", "title_short", "title_long", "title_dup", "desc_missing", "desc_short", "desc_long", "desc_dup", "alt_missing", "meta_missing"]);

async function backupFirst(c: Conn, until: number): Promise<{ ok: boolean; note: string }> {
  try {
    let r = await callConnector<{ id: string; status: string; error: string | null }>(c.url, c.key, "POST", "/backup/start", { label: "Before AI SEO changes", scope: "database", budget: 20 }, 90_000);
    while (r.status !== "done" && Date.now() < until - 60_000) {
      if (r.status === "error") return { ok: false, note: `The backup failed: ${r.error ?? "no reason given"}` };
      r = { ...(await callConnector<{ status: string; error: string | null }>(c.url, c.key, "POST", "/backup/step", { id: r.id, budget: 20 }, 90_000)), id: r.id };
    }
    return r.status === "done" ? { ok: true, note: "Database backed up first" } : { ok: false, note: "The backup is still running — fixes carry on next time" };
  } catch (e) {
    return { ok: false, note: `Couldn't back up first: ${e instanceof Error ? e.message : e}` };
  }
}

/** Fix a few pages. Returns done=true when nothing fixable is left (or the AI budget is used up). */
export async function stepFix(db: Db, c: Conn, until: number, actor: string | null, opts: { backedUp: boolean; maxPages?: number }): Promise<{ done: boolean; note: string; backedUp: boolean }> {
  const row = await siteRow(db, c);
  const b = await aiBudget(db, c.orgId);
  if (!b.key) return { done: true, note: "AI fixes skipped — no Claude API key (Settings → Integrations → AI)", backedUp: opts.backedUp };
  if (b.left <= 0.05) return { done: true, note: `AI fixes stopped — this month's AI budget (US$${b.ai.monthlyCapUsd.toFixed(2)}) is used up`, backedUp: opts.backedUp };
  const { data } = await db.from("nh_seo_pages").select("post_id, url, name, type, front, issues, data, gsc, fixed_at").eq("website_id", c.websiteId);
  const recent = Date.now() - 20 * 86400_000;
  type Row = { post_id: number; url: string; name: string; type: string; front: boolean; issues: Issue[]; data: AuditItem; gsc: { impressions: number } | null; fixed_at: string | null };
  const todo = ((data ?? []) as Row[])
    .filter((p) => (p.issues ?? []).some((i) => AI_CODES.has(i.code)) && (!p.fixed_at || Date.parse(p.fixed_at) < recent) && p.data?.fields?.writable !== false)
    .sort((a, z) => Number(z.front) - Number(a.front) || (z.gsc?.impressions ?? 0) - (a.gsc?.impressions ?? 0) || (z.issues.length - a.issues.length));
  const chromeTodo = (row.checks?.chrome_images ?? []).filter((i) => i.id && badAlt(i.alt) && badAlt(i.lib_alt));
  if (!todo.length && !chromeTodo.length) return { done: true, note: "Nothing left for the AI to fix", backedUp: opts.backedUp };

  let backedUp = opts.backedUp;
  if (!backedUp) {
    const bk = await backupFirst(c, until);
    if (!bk.ok) return { done: true, note: bk.note, backedUp: false };
    backedUp = true;
  }
  await patchSite(db, c.websiteId, { status: "fixing" });
  const checks = row.checks;
  const biz = checks?.settings?.business;
  const bizLine = [biz?.name || checks?.name, biz?.description, biz?.locality && `Based in ${[biz.locality, biz.region].filter(Boolean).join(", ")}`, biz?.services?.length ? `Services: ${biz.services.map((s) => s.name).join(", ")}` : null].filter(Boolean).join(". ");
  const siteQueries = (row.gsc?.queries ?? []).slice(0, 15).map((q) => `${q.query} (${q.impressions} impressions, position ${q.position})`).join("; ");
  const changes: { change_id: string; summary: string; post_id?: number; media_id?: number }[] = [];
  let cost = 0, pagesDone = 0, alts = 0;

  // header/footer/logo images once, before the pages
  if (chromeTodo.length && Date.now() < until - 60_000) {
    const content: Content[] = [{ type: "text", text: `BUSINESS: ${bizLine}\nThese images appear on every page of the site (header, footer, logo strip). Describe each. Image ids in order: ${chromeTodo.slice(0, 10).map((i) => i.id).join(", ")}\nReturn title, description and focus_keyword as null.` }];
    for (const i of chromeTodo.slice(0, 10)) if (/^https:\/\/.+\.(jpe?g|png|webp|gif)(\?|$)/i.test(i.src)) content.push({ type: "image", source: { type: "url", url: i.src } });
    try {
      const { json, usage } = await claudeJSON(b.key, b.ai.model, FIX_SYSTEM, content, 1200);
      cost += costOf(b.ai.model, usage);
      const media = (Array.isArray(json.alts) ? json.alts : []).map((a) => a as { id?: number; alt?: string | null }).filter((a) => a.id && a.alt && chromeTodo.some((i) => i.id === a.id)).map((a) => ({ id: a.id!, alt: str(a.alt, 120), summary: `Alt text (site-wide image): “${str(a.alt, 120)}”` }));
      if (media.length) {
        const r = await callConnector<{ results: { change_id?: string; media_id?: number; error?: string }[] }>(c.url, c.key, "POST", "/seo/apply", { items: [], media, summary: "AI SEO: alt text" }, 60_000);
        for (const x of r.results) if (x.change_id) { changes.push({ change_id: x.change_id, summary: media.find((m) => m.id === x.media_id)?.summary ?? "Alt text", media_id: x.media_id }); alts++; }
      }
    } catch { /* site-wide images are a nice-to-have */ }
  }

  for (const p of todo.slice(0, opts.maxPages ?? 4)) {
    if (Date.now() > until - 45_000 || cost >= Math.min(3, b.left)) break;
    let page: { page: PageRead | null; fields: Fields; url: string; name: string } | null = null;
    try { page = await callConnector(c.url, c.key, "GET", `/seo/page?id=${p.post_id}`, undefined, 60_000); } catch { continue; }
    if (!page) continue;
    const imgs = (page.page?.images ?? []).filter((i) => !i.chrome && i.id && badAlt(i.alt) && badAlt(i.lib_alt) && /^https:\/\/.+\.(jpe?g|png|webp|gif)(\?|$)/i.test(i.src)).slice(0, 6);
    const pq = p.gsc ? `This page: ${p.gsc.impressions} impressions in Google in the last 28 days.` : "";
    const text = `BUSINESS: ${bizLine}
SEARCHES THE SITE SHOWS UP FOR (Google, last 28 days): ${siteQueries || "no data yet"}
${pq}
PAGE: ${page.name} — ${page.url} (${p.type}${p.front ? ", homepage" : ""})
CURRENT TITLE: ${page.page?.title || page.fields.title || "(none)"}
CURRENT DESCRIPTION: ${page.page?.description || page.fields.description || "(none)"}
ISSUES: ${p.issues.filter((i) => AI_CODES.has(i.code)).map((i) => i.label).join("; ")}
HEADINGS: ${(page.page?.headings ?? []).slice(0, 25).join(" | ")}
TEXT: ${(page.page?.text ?? "").slice(0, 3500)}
IMAGES TO DESCRIBE (ids in order): ${imgs.map((i) => i.id).join(", ") || "none"}`;
    const content: Content[] = [{ type: "text", text }, ...imgs.map((i) => ({ type: "image" as const, source: { type: "url" as const, url: i.src } }))];
    let json: Record<string, unknown>;
    try {
      const r = await claudeJSON(b.key, b.ai.model, FIX_SYSTEM, content, 1200);
      json = r.json; cost += costOf(b.ai.model, r.usage);
    } catch (e) {
      await logRun(db, c, { kind: "fix", ok: false, summary: `AI couldn't work on ${page.url}: ${e instanceof Error ? e.message : e}`, cost: 0, actor });
      continue;
    }
    const title = str(json.title, 70), desc = str(json.description, 170), kw = str(json.focus_keyword, 60);
    const item: Record<string, unknown> = { id: p.post_id };
    const bits: string[] = [];
    if (title && title !== page.page?.title) { item.title = title; bits.push(`title “${title}”`); }
    if (desc && desc !== page.page?.description) { item.description = desc; bits.push("description"); }
    if (kw && !page.fields.focus_keyword) item.focus_keyword = kw;
    const media = (Array.isArray(json.alts) ? json.alts : []).map((a) => a as { id?: number; alt?: string | null }).filter((a) => a.id && a.alt && imgs.some((i) => i.id === a.id)).map((a) => ({ id: a.id!, alt: str(a.alt, 120), summary: `Alt text on “${page!.name}”: “${str(a.alt, 120)}”` }));
    if (bits.length) item.summary = `SEO for “${page.name}”: ${bits.join(" and ")}`;
    const items = Object.keys(item).length > 1 ? [item] : [];
    if (items.length || media.length) {
      const r = await callConnector<{ results: { change_id?: string; post_id?: number; media_id?: number; error?: string }[] }>(c.url, c.key, "POST", "/seo/apply", { items, media, summary: "AI SEO" }, 60_000);
      for (const x of r.results) {
        if (!x.change_id) continue;
        if (x.media_id) { alts++; changes.push({ change_id: x.change_id, summary: media.find((m) => m.id === x.media_id)?.summary ?? "Alt text", media_id: x.media_id }); }
        else changes.push({ change_id: x.change_id, summary: String(item.summary ?? `SEO for “${page.name}”`), post_id: x.post_id });
      }
    }
    pagesDone++;
    await db.from("nh_seo_pages").update({ fixed_at: new Date().toISOString(), issues: p.issues.filter((i) => !AI_CODES.has(i.code)) }).eq("website_id", c.websiteId).eq("post_id", p.post_id);
  }
  await patchSite(db, c.websiteId, { status: "idle", last_fix_at: new Date().toISOString() });
  const titles = changes.filter((x) => x.post_id).length;
  const summary = `AI SEO: improved ${titles} page${titles === 1 ? "" : "s"} (titles and descriptions)${alts ? `, alt text on ${alts} image${alts === 1 ? "" : "s"}` : ""}`;
  if (changes.length || cost) await logRun(db, c, { kind: "fix", ok: true, summary, changes, cost, actor });
  if (changes.length) await clientHistory(db, c, summary.replace("AI SEO:", "SEO:"), { kind: "seo_fix", changes: changes.map((x) => x.summary) }, actor);
  const left = todo.length - pagesDone;
  return { done: left <= 0 || pagesDone === 0, note: changes.length ? `${summary}${left > 0 ? ` — ${left} more to go` : ""}` : "No changes needed on those pages", backedUp };
}

// ------------------------------------------------------------------------------------------------
// The whole run, step by step
// ------------------------------------------------------------------------------------------------

export type StepResult = { next: Phase; note: string; backedUp: boolean };

/** Run one phase; returns which phase comes next. Used by the page (one call per step) and by the cron (in a loop). */
export async function runStep(db: Db, websiteId: string, phase: Phase, opts: { actor: string | null; until: number; backedUp?: boolean; fix?: boolean }): Promise<StepResult> {
  const c = await seoConnection(db, websiteId);
  if (c.outdated) throw new Error(`This site's connector is version ${c.version}; SEO needs ${MIN_VERSION}. It updates itself within the hour, or update it from WordPress command ops.`);
  const backedUp = !!opts.backedUp;
  try {
    if (phase === "audit") {
      const r = await stepAudit(db, c, opts.until);
      return { next: r.done ? "gsc" : "audit", note: r.note, backedUp };
    }
    if (phase === "gsc") {
      let note: string;
      try { note = await stepGsc(db, c); } catch (e) { note = `Search Console: ${e instanceof Error ? e.message : e}`; }
      return { next: opts.fix === false ? "done" : "pack", note, backedUp };
    }
    if (phase === "pack") {
      const row = await siteRow(db, c);
      const { count } = await db.from("nh_seo_pages").select("post_id", { count: "exact", head: true }).eq("website_id", websiteId).filter("issues", "cs", JSON.stringify([{ fix: "pack" }]));
      const due = !row.last_pack_at || (row.checks?.site_issues ?? []).some((i) => i.fix === "pack") || (count ?? 0) > 0;
      const note = due ? await stepPack(db, c, opts.actor) : "AI search pack already in place";
      return { next: "fix", note, backedUp };
    }
    if (phase === "fix") {
      const r = await stepFix(db, c, opts.until, opts.actor, { backedUp });
      if (r.done) await patchSite(db, websiteId, { status: "idle", last_fix_at: new Date().toISOString() });
      return { next: r.done ? "done" : "fix", note: r.note, backedUp: r.backedUp };
    }
    return { next: "done", note: "Done", backedUp };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await patchSite(db, websiteId, { status: "idle", last_error: m.slice(0, 500) });
    throw e;
  }
}

/** Weekly: every connected site on 1.5.0+ whose last check is over 6 days old; carries on across wakes. */
export async function runSeoCron(db: Db, budgetMs = 270_000) {
  const until = Date.now() + budgetMs;
  const { data: conns } = await db.from("website_connectors").select("website_id, organisation_id, connector_version");
  const ready = ((conns ?? []) as { website_id: string; organisation_id: string; connector_version: string | null }[]).filter((x) => vNum(x.connector_version ?? "0") >= vNum(MIN_VERSION));
  const { data: rows } = await db.from("nh_seo_sites").select("website_id, auto, status, last_audit_at, last_fix_at");
  const by = new Map(((rows ?? []) as { website_id: string; auto: boolean; status: string; last_audit_at: string | null; last_fix_at: string | null }[]).map((r) => [r.website_id, r]));
  const weekAgo = Date.now() - 6 * 86400_000;
  const due = ready.filter((x) => { const r = by.get(x.website_id); return !r || r.status !== "idle" || !r.last_audit_at || Date.parse(r.last_audit_at) < weekAgo || (r.auto && (!r.last_fix_at || Date.parse(r.last_fix_at) < weekAgo)); });
  const done: string[] = [];
  for (const s of due) {
    if (Date.now() > until - 60_000) break;
    const auto = by.get(s.website_id)?.auto ?? true;
    let phase: Phase = "audit"; let backedUp = false; let guard = 0;
    try {
      while (phase !== "done" && Date.now() < until - 45_000 && guard++ < 30) {
        const r = await runStep(db, s.website_id, phase, { actor: null, until, backedUp, fix: auto });
        phase = r.next; backedUp = r.backedUp;
      }
      if (phase === "done") done.push(s.website_id);
    } catch { /* recorded on the site row; next wake tries again */ }
  }
  return { due: due.length, finished: done.length };
}
