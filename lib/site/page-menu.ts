/**
 * The two menus at the top of every public page:
 *  - the site menu (logo + every section) — light or dark, one setting for the whole site, overridable per page
 *  - the section menu under it (Shop: Coffee · Subscriptions…, Café: Order · Reserve…) — a bar, a floating card
 *    over the page photo (pages that support it), or hidden.
 * Site default: settings.site.menuTone. Per page: settings.site.pageMenu["<page key>"] = { tone, section }.
 * The page key is the same one the footer uses (footerPageKey).
 */
export type MenuTone = "light" | "dark";
export type SectionStyle = "bar" | "float" | "hidden";

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function siteMenuTone(settings: unknown): MenuTone {
  return obj(obj(settings).site).menuTone === "dark" ? "dark" : "light";
}

export function pageMenuFor(settings: unknown, key: string): { tone: MenuTone; section: SectionStyle | null } {
  const p = obj(obj(obj(obj(settings).site).pageMenu)[key]);
  const tone = p.tone === "dark" || p.tone === "light" ? p.tone : siteMenuTone(settings);
  const section = p.section === "bar" || p.section === "float" || p.section === "hidden" ? p.section : null;
  return { tone, section };
}
