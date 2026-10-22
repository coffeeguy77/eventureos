import "server-only";
import { normPath, type Found } from "./site";

/**
 * SEO Saver — find every address the old website has: its sitemap(s), plus pages the Wayback Machine has seen
 * (old pages Google may still know). Page titles are read for the first pages so matching can use them.
 */
const UA = "EventureOS-SEO-Saver/1.0 (+https://www.eventureos.com.au)";

async function get(url: string, ms = 9000): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xml,text/xml,*/*" }, signal: AbortSignal.timeout(ms), redirect: "follow", cache: "no-store" });
    if (!r.ok) return null;
    return (await r.text()).slice(0, 3_000_000);
  } catch { return null; }
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));

export async function discoverOld(oldSite: string): Promise<{ found: Found[]; notes: string[] }> {
  const site = new URL(oldSite);
  const host = site.host.replace(/^www\./, "");
  const notes: string[] = [];
  const out = new Map<string, Found>();
  const add = (u: string, source: string) => {
    try {
      const x = new URL(u, site);
      if (x.host.replace(/^www\./, "") !== host) return;
      if (/\/wp-content\/|\/wp-json\/|\/wp-includes\//.test(x.pathname)) return;
      const p = normPath(x.pathname);
      if (!out.has(p)) out.set(p, { path: p, title: "", source });
    } catch { /* skip */ }
  };

  // 1. Sitemaps (index → child sitemaps)
  let index: string | null = null;
  for (const name of ["/sitemap_index.xml", "/sitemap.xml", "/wp-sitemap.xml"]) { index = await get(`${site.origin}${name}`); if (index && /<loc>/i.test(index)) break; index = null; }
  if (index) {
    const first = locs(index);
    const children = first.filter((u) => /\.xml(\?|$)/i.test(u));
    if (!children.length) first.forEach((u) => add(u, "sitemap"));
    for (const c of children.slice(0, 30)) {
      const x = await get(c);
      if (x) locs(x).forEach((u) => add(u, "sitemap"));
    }
    notes.push(`Sitemap: ${out.size} addresses`);
  } else notes.push("No sitemap found on the old website");

  // 2. Wayback Machine — every HTML page it has archived for the domain
  const before = out.size;
  const wb = await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(host)}/*&output=json&fl=original&filter=statuscode:200&filter=mimetype:text/html&collapse=urlkey&limit=3000`, 20000);
  if (wb) {
    try { (JSON.parse(wb) as string[][]).slice(1).forEach((row) => add(row[0], "wayback")); } catch { /* not JSON */ }
    notes.push(`Wayback Machine: ${out.size - before} more`);
  } else notes.push("Wayback Machine didn't answer — try again later");

  // 3. Titles for the main pages (not products), a few at a time
  const pages = [...out.values()].filter((f) => !/^\/(product|product-category|portfolio)/.test(f.path)).slice(0, 60);
  for (let i = 0; i < pages.length; i += 6) {
    await Promise.all(pages.slice(i, i + 6).map(async (f) => {
      const h = await get(`${site.origin}${f.path === "/" ? "/" : f.path + "/"}`, 7000);
      const t = h?.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1];
      if (t) f.title = t.replace(/&#8211;|&ndash;/g, "–").replace(/&amp;/g, "&").replace(/\s*[|–-]\s*[^|–-]+$/, "").trim();
    }));
  }
  return { found: [...out.values()].sort((a, b) => a.path.localeCompare(b.path)), notes };
}
