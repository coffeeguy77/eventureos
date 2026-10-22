/**
 * SEO Saver — matching a business's old website addresses to its new pages, and checking the move before launch. Pure.
 */
import { closest, matchRule, normPath, routeFor, type Found, type Rule, type SiteSettings } from "./site";
import type { NewPage } from "./pages";

export interface Suggestion { from: string; to: string; why: string; sure: boolean }

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/**
 * A sensible new page for each old address that has no rule yet.
 * Shop products keep their name (/product/x → /shop/p/x) when the new shop has it; WordPress plumbing goes home.
 */
export function suggest(site: SiteSettings, found: Found[], pages: NewPage[], extra: { products?: string[]; courses?: string[] } = {}): Suggestion[] {
  const products = new Set(extra.products ?? []);
  const has = (p: string) => pages.some((x) => x.path === p);
  const out: Suggestion[] = [];
  for (const f of found) {
    const p = normPath(f.path);
    if (p === "/" || matchRule(site.rules, p)) continue;
    const segs = p.split("/").filter(Boolean);
    const own = routeFor({ ...site, rules: [], fallback: false }, "x", p);
    if (own.kind === "rewrite" || own.kind === "pass") continue; // already a new page at the same address
    let to = "", why = "", sure = false;
    if (segs[0] === "product" && segs[1]) {
      if (products.has(segs[1])) { to = `/shop/p/${segs[1]}`; why = "Same coffee in the new shop"; sure = true; }
      else if (/gift/.test(segs[1]) && /barista|lesson|class|course/.test(segs[1]) && has("/book/gift")) { to = "/book/gift"; why = "Class gift certificates"; sure = true; }
      else if (/gift/.test(segs[1]) && has("/shop/gift-card")) { to = "/shop/gift-card"; why = "Coffee gift card"; sure = true; }
      else if (/barista|course|lesson/.test(segs[1]) && has("/classes")) { to = "/classes"; why = "Barista classes"; sure = true; }
      else if (has("/shop")) { to = "/shop"; why = "Not in the new shop yet — goes to the shop"; }
    } else if (/^(product-category|product-tag|shop|shop-coffee)$/.test(segs[0] ?? "") && has("/shop")) { to = "/shop"; why = "Shop"; sure = true; }
    else if (/^(cart|checkout|my-account|basket)$/.test(segs[0] ?? "") && has("/shop")) { to = segs[0] === "my-account" ? "/shop/account" : "/shop/cart"; why = "Shop cart / account"; sure = true; }
    else if (/^(wp-admin|wp-login\.php|feed|comments|xmlrpc\.php|author|tag|category|portfolio-item|portfolio-category|elementor-hf|robo_gallery_table)$/.test(segs[0] ?? "")) { to = "/"; why = "Old website plumbing — home page"; sure = true; }
    else {
      const guess = closest(site, `${p} ${f.title}`, pages);
      const shared = [...words(`${p} ${f.title}`)].filter((w) => words(guess + " " + (pages.find((x) => x.path === guess)?.title ?? "")).has(w));
      to = guess; sure = guess !== "/" && shared.length >= 2;
      why = guess === "/" ? "No close match — home page" : `Matches “${shared.join(", ")}”`;
    }
    if (to) out.push({ from: p, to, why, sure });
  }
  return out;
}

export interface Check { from: string; lands: string; ok: boolean; note: string }

/** Where every old address ends up, in one hop, and anything that needs a look. */
export function launchCheck(site: SiteSettings, found: Found[], pages: NewPage[]): { checks: Check[]; problems: number } {
  const known = (p: string) => pages.some((x) => x.path === p) || /^\/(shop\/p|book|hire|cafe|academy|jobs|shop)\//.test(p) || /^https:\/\//.test(p);
  const checks: Check[] = [];
  for (const f of found) {
    const p = normPath(f.path);
    const r = routeFor(site, "x", p, pages);
    if (r.kind === "rewrite" || r.kind === "pass") { checks.push({ from: p, lands: p, ok: true, note: "Same address on the new site" }); continue; }
    if (r.kind === "gone") { checks.push({ from: p, lands: "—", ok: true, note: "Marked as removed (410)" }); continue; }
    if (r.kind === "notfound") { checks.push({ from: p, lands: "—", ok: false, note: "Not found — add a rule" }); continue; }
    const to = r.to.split("?")[0];
    const again = /^\//.test(to) ? matchRule(site.rules, to) : null;
    const rule = matchRule(site.rules, p);
    if (again && normPath(to) !== "/") checks.push({ from: p, lands: to, ok: false, note: `Two hops — ${to} is redirected again` });
    else if (!known(normPath(to))) checks.push({ from: p, lands: to, ok: false, note: "The page it goes to doesn't exist" });
    else checks.push({ from: p, lands: to, ok: true, note: rule ? "Rule" : to === "/" ? "No rule — falls back to the home page" : "No rule — closest page" });
  }
  return { checks, problems: checks.filter((c) => !c.ok).length };
}

/** Rules in, duplicates and loops out. */
export function cleanRules(rules: Rule[]): Rule[] {
  const seen = new Set<string>();
  return rules.filter((r) => {
    if (seen.has(r.from)) return false;
    seen.add(r.from);
    return !(r.status === 301 && normPath(r.to) === r.from);
  });
}
