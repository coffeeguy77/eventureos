/**
 * A business's own website on EventureOS: home page, extra pages (About, Contact, …), its own domain and the
 * SEO Saver (old addresses → new pages, so a move from another website keeps its Google rankings).
 * Lives in organisations.settings.site. Pure — no database (used by middleware, pages, settings and tests).
 */

export type PageForm = "none" | "contact" | "franchise";
export interface InfoPage {
  /** position in settings.site.pages (for the page editor) */ index: number;
  slug: string; title: string; eyebrow: string; intro: string; body: string; heroImage: string | null;
  metaTitle: string; metaDescription: string; form: PageForm; footer: boolean;
  /** "franchise" = the designed franchise page (sections, steps, FAQ, enquiry form); otherwise a plain text page */
  layout: "standard" | "franchise";
  /** blocks under the page's text: photos with words, galleries, buttons */
  sections: PageSection[];
  /** shown in the top menu (pages made before this was added stay out of it) */
  menu: boolean;
}
export type PageSection =
  | { id: string; type: "text"; heading: string; body: string }
  | { id: string; type: "imageText"; image: string | null; heading: string; body: string; side: "left" | "right"; label: string; link: string }
  | { id: string; type: "image"; image: string | null; caption: string; wide: boolean }
  | { id: string; type: "gallery"; heading: string; images: string[] }
  | { id: string; type: "cta"; heading: string; body: string; label: string; link: string };
export const SECTION_TYPES = ["text", "imageText", "image", "gallery", "cta"] as const;
export interface Rule { id: string; from: string; to: string; status: 301 | 410; note: string }
export interface Found { path: string; title: string; source: string }
export interface SiteSettings {
  /** The home page (/site/<business>) is switched on */
  home: boolean;
  /** e.g. "www.beanculture.com.au" */
  domain: string | null;
  /** The domain points here and EventureOS answers for it */
  live: boolean;
  /** The old website, for finding its addresses before the move, e.g. "https://www.beanculture.com.au" */
  oldSite: string | null;
  pages: InfoPage[];
  rules: Rule[];
  /** Old addresses with no rule go to the closest page (else home) instead of "not found" */
  fallback: boolean;
  discovered: Found[];
  /** Home page photos: hero, about, and one per section card */
  images: Record<string, string | null>;
  /** logo size in the menu bar */
  logoSize: "md" | "lg" | "xl";
}
export const SITE_IMAGES = ["hero", "about", "classes", "hire", "hireshop", "academy", "cafe", "shop", "jobs"] as const;

/** The public sections that live under /<section>/<business>/… */
export const SECTIONS = ["hire", "shop", "cafe", "jobs", "academy", "book", "site"] as const;
/** Page addresses a business can't use (they're EventureOS's own). */
const TAKEN = new Set<string>([...SECTIONS, "classes", "api", "auth", "media", "fonts", "brand", "p", "q", "pay", "order", "print", "login", "signup", "admin", "dashboard", "sitemap.xml", "robots.txt", "_next"]);

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, n: number, d = "") => (typeof v === "string" ? v.trim().slice(0, n) : d);
export const okImage = (v: unknown) => (typeof v === "string" && /^(https:\/\/|\/media\/)[^\s"'<>()]{1,400}$/.test(v.trim()) ? v.trim() : null);

export const pageSlug = (v: unknown) => {
  const s = str(v, 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return s && !TAKEN.has(s) ? s : "";
};
export function cleanHost(v: unknown): string | null {
  const h = str(v, 200).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h) && !/(^|\.)eventureos\.com\.au$|\.vercel\.app$/.test(h) ? h : null;
}

/** "/About-Us/" → "/about-us"; "/" stays "/". Query and hash dropped. */
export function normPath(p: string): string {
  let s = String(p || "/").split("#")[0].split("?")[0].trim();
  try { s = decodeURI(s); } catch { /* keep as is */ }
  s = ("/" + s.replace(/^\/+/, "")).replace(/\/{2,}/g, "/").toLowerCase();
  s = s.replace(/\/index\.(php|html?)$/, "/");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
}

function readRule(v: unknown, i: number): Rule | null {
  const r = obj(v);
  const from = str(r.from, 400);
  if (!from.startsWith("/")) return null;
  const status = Number(r.status) === 410 ? 410 : 301;
  const to = str(r.to, 400);
  if (status === 301 && !/^(\/|https:\/\/)/.test(to)) return null;
  return { id: str(r.id, 40) || `r${i}`, from: from.endsWith("*") ? normPath(from.slice(0, -1)).replace(/\/?$/, "/") + "*" : normPath(from), to, status, note: str(r.note, 200) };
}

/** A button link: a page on this site ("/contact", "/hire/…") or https. */
export const okLink = (v: unknown) => { const t = str(v, 400); return /^https:\/\/[^\s"'<>]{3,}$/.test(t) || /^\/[a-z0-9/_#?=&.-]*$/i.test(t) ? t : ""; };

export function readSections(v: unknown): PageSection[] {
  if (!Array.isArray(v)) return [];
  const out: PageSection[] = [];
  const ids = new Set<string>();
  for (const [i, raw] of v.slice(0, 30).entries()) {
    const o = obj(raw);
    let id = str(o.id, 24).replace(/[^a-z0-9]/gi, "") || `s${i}`;
    while (ids.has(id)) id += "x";
    ids.add(id);
    const heading = str(o.heading, 160), body = str(o.body, 8000);
    if (o.type === "text") { if (heading || body) out.push({ id, type: "text", heading, body }); }
    else if (o.type === "imageText") { const image = okImage(o.image); if (image || heading || body) out.push({ id, type: "imageText", image, heading, body, side: o.side === "right" ? "right" : "left", label: str(o.label, 60), link: okLink(o.link) }); }
    else if (o.type === "image") { const image = okImage(o.image); if (image) out.push({ id, type: "image", image, caption: str(o.caption, 200), wide: o.wide === true }); }
    else if (o.type === "gallery") { const images = (Array.isArray(o.images) ? o.images : []).map(okImage).filter((x): x is string => !!x).slice(0, 24); if (images.length) out.push({ id, type: "gallery", heading, images }); }
    else if (o.type === "cta") { const label = str(o.label, 60), link = okLink(o.link); if (heading || (label && link)) out.push({ id, type: "cta", heading, body: str(o.body, 600), label, link }); }
  }
  return out;
}

export function readPage(v: unknown, index = 0): InfoPage | null {
  const p = obj(v);
  const slug = pageSlug(p.slug);
  const title = str(p.title, 120);
  if (!slug || !title) return null;
  const form = p.form === "contact" || p.form === "franchise" ? p.form : "none";
  return {
    index, slug, title, eyebrow: str(p.eyebrow, 80), intro: str(p.intro, 600), body: str(p.body, 30000), heroImage: okImage(p.heroImage),
    metaTitle: str(p.metaTitle, 120), metaDescription: str(p.metaDescription, 300), form, footer: p.footer !== false,
    layout: p.layout === "franchise" ? "franchise" : "standard",
    sections: readSections(p.sections), menu: p.menu === true,
  };
}

export function readSite(settings: unknown): SiteSettings {
  const s = obj(obj(settings).site);
  const seen = new Set<string>();
  const pages = (Array.isArray(s.pages) ? s.pages : []).map((p, i) => readPage(p, i)).filter((p): p is InfoPage => !!p && !seen.has(p.slug) && !!seen.add(p.slug)).slice(0, 40);
  const rules = (Array.isArray(s.rules) ? s.rules : []).map(readRule).filter((r): r is Rule => !!r).slice(0, 2000);
  const discovered = (Array.isArray(s.discovered) ? s.discovered : []).map((x) => { const f = obj(x); return { path: normPath(str(f.path, 400)), title: str(f.title, 200), source: str(f.source, 40) }; })
    .filter((f) => f.path).slice(0, 3000);
  const old = str(s.oldSite, 200);
  return {
    home: s.home === true, domain: cleanHost(s.domain), live: s.live === true && !!cleanHost(s.domain),
    oldSite: /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}\/?$/i.test(old) ? old.replace(/\/$/, "") : null,
    pages, rules, fallback: s.fallback !== false, discovered,
    images: Object.fromEntries(SITE_IMAGES.map((k) => [k, okImage(obj(s.images)[k])])),
    logoSize: s.logoSize === "lg" || s.logoSize === "xl" ? s.logoSize : "md",
  };
}

/** The redirect for an old address, or null. Exact rules win over "starts with" rules (longest first). */
export function matchRule(rules: Rule[], rawPath: string): { to: string; status: 301 | 410; rule: Rule } | null {
  const p = normPath(rawPath);
  const exact = rules.find((r) => !r.from.endsWith("*") && r.from === p);
  if (exact) return { to: exact.to, status: exact.status, rule: exact };
  const prefixes = rules.filter((r) => r.from.endsWith("*")).sort((a, b) => b.from.length - a.from.length);
  for (const r of prefixes) {
    const base = r.from.slice(0, -1); // ends with "/"
    if ((p + "/").startsWith(base)) {
      const rest = (p + "/").slice(base.length).replace(/\/$/, "");
      return { to: r.to.endsWith("*") ? r.to.slice(0, -1) + rest : r.to, status: r.status, rule: r };
    }
  }
  return null;
}

/** Carry tracking tags (utm_*, gclid, fbclid) onto the redirect. */
export function withTracking(to: string, search: string) {
  const q = new URLSearchParams(search);
  const keep = [...q.entries()].filter(([k]) => /^(utm_[a-z]+|gclid|fbclid|msclkid)$/i.test(k));
  if (!keep.length || to.startsWith("http")) return to;
  return `${to}${to.includes("?") ? "&" : "?"}${new URLSearchParams(keep).toString()}`;
}

export type Route =
  | { kind: "pass" }
  | { kind: "rewrite"; to: string }
  | { kind: "redirect"; to: string; status: 301 | 302 }
  | { kind: "gone" }
  | { kind: "notfound"; log: boolean };

const FILE = /\.[a-z0-9]{2,5}$/i;

/**
 * What to do with a request on the business's own domain.
 * Clean addresses: "/" home · "/about-us" a page · "/hire/coffee-cart-hire" · "/shop/…" · "/classes" (the classes page).
 * EventureOS's own addresses with the business in them (/hire/<business>/…) still work, so links inside the pages keep working.
 */
export function routeFor(site: SiteSettings, slug: string, rawPath: string, extra: { path: string; title: string }[] = []): Route {
  const path = rawPath || "/";
  if (/^\/(_next|api|auth|media|fonts|brand|downloads)(\/|$)/.test(path) || path === "/favicon.ico" || path === "/manifest.webmanifest" || path === "/embed.js") return { kind: "pass" };
  if (path === "/sitemap.xml") return { kind: "rewrite", to: `/api/site/sitemap?org=${slug}` };
  if (path === "/robots.txt") return { kind: "rewrite", to: `/api/site/robots?org=${slug}` };
  const segs = path.split("/").filter(Boolean);
  const first = (segs[0] ?? "").toLowerCase();
  // Our own pages first (so an old rule can't hide a live page)
  if (!segs.length) return site.home ? { kind: "rewrite", to: `/site/${slug}` } : { kind: "rewrite", to: `/${slug}` };
  if ((SECTIONS as readonly string[]).includes(first)) {
    if (segs[1] === slug) return { kind: "pass" };
    return { kind: "rewrite", to: `/${first}/${slug}${segs.length > 1 ? "/" + segs.slice(1).join("/") : ""}` };
  }
  if (first === slug) return { kind: "pass" };
  if (first === "classes" && segs.length === 1) return { kind: "rewrite", to: `/${slug}` };
  if (segs.length === 1 && site.pages.some((p) => p.slug === first)) return { kind: "rewrite", to: `/site/${slug}/${first}` };
  if (/^\/(p|q|pay|order|print)(\/|$)/.test(path)) return { kind: "pass" };
  // Old addresses
  const m = matchRule(site.rules, path);
  if (m) return m.status === 410 ? { kind: "gone" } : { kind: "redirect", to: m.to, status: 301 };
  if (FILE.test(path) && !/\.(php|html?|aspx?)$/i.test(path)) return { kind: "notfound", log: true }; // images, PDFs never fall back
  if (site.fallback) return { kind: "redirect", to: closest(site, path, extra), status: 301 };
  return { kind: "notfound", log: true };
}

/** The best guess for an old address with no rule: a page whose address shares its words, else the home page. */
export function closest(site: SiteSettings, rawPath: string, extra: { path: string; title: string }[] = []) {
  const words = new Set(normPath(rawPath).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
  let best = { to: "/", score: 0 };
  for (const c of candidates(site, extra)) {
    const cw = c.words;
    const score = [...words].filter((w) => cw.has(w)).length;
    if (score > best.score) best = { to: c.path, score };
  }
  return best.to;
}

const STOP = new Set(["the", "and", "for", "canberra", "with", "our", "your", "page", "html", "php", "www"]);

/** The new site's pages (clean addresses) with their words, for matching old addresses. */
export function candidates(site: SiteSettings, extra: { path: string; title: string }[] = []) {
  const base: { path: string; title: string }[] = [
    { path: "/", title: "home" },
    ...site.pages.map((p) => ({ path: `/${p.slug}`, title: `${p.title} ${p.slug}` })),
    ...extra,
  ];
  return base.map((c) => ({ ...c, words: new Set(`${c.path} ${c.title}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w))) }));
}

/** EventureOS address → the clean address on the business's own domain (for canonical tags and the sitemap). */
export function cleanPath(slug: string, internal: string): string {
  const p = internal.split("?")[0];
  if (p === `/site/${slug}`) return "/";
  if (p.startsWith(`/site/${slug}/`)) return p.slice(`/site/${slug}`.length);
  if (p === `/${slug}` || p === `/book/${slug}`) return "/classes";
  for (const s of SECTIONS) {
    if (p === `/${s}/${slug}`) return `/${s}`;
    if (p.startsWith(`/${s}/${slug}/`)) return `/${s}${p.slice(`/${s}/${slug}`.length)}`;
  }
  return p;
}

/**
 * Small "markdown" for page bodies: blank-line paragraphs, "## " headings, "- " lists, **bold**, [text](link).
 * Returns blocks; the page renders them (no raw HTML is ever trusted).
 */
export type Block = { t: "h"; text: string } | { t: "p"; text: string } | { t: "ul"; items: string[] };
export function blocks(body: string): Block[] {
  const out: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    let list: string[] | null = null;
    const flush = () => { if (para.length) out.push({ t: "p", text: para.join(" ") }); para = []; };
    for (const l of lines) {
      if (/^#{2,3}\s+/.test(l)) { flush(); list = null; out.push({ t: "h", text: l.replace(/^#+\s+/, "") }); }
      else if (/^[-•–*]\s+/.test(l)) { flush(); if (!list) { list = []; out.push({ t: "ul", items: list }); } list.push(l.replace(/^[-•–*]\s+/, "")); }
      else { list = null; para.push(l); }
    }
    flush();
  }
  return out;
}
/** Inline bits of a line: plain text, **bold** and [label](https://… or /path). */
export type Inline = { t: "text"; v: string } | { t: "b"; v: string } | { t: "a"; v: string; href: string };
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(((?:https?:\/\/|\/|mailto:|tel:)[^\s)]+)\)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    out.push(m[1] ? { t: "b", v: m[1] } : { t: "a", v: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}
