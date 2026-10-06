/**
 * The menu bar across a business's public pages (classes, job board, shop, gift certificates), so they read as one website.
 * Labels live in organisations.settings.site.nav; a section only shows when it's switched on.
 */
export type SiteSection = "events" | "lessons" | "jobs" | "shop" | "gifts";
export const SITE_LABELS: Record<SiteSection, string> = { events: "Events", lessons: "Classes", jobs: "Job board", shop: "Shop", gifts: "Gift certificates" };

export function readSiteNav(orgSettings: unknown): Record<SiteSection, string> {
  const site = (orgSettings && typeof orgSettings === "object" ? (orgSettings as Record<string, unknown>).site : null) as Record<string, unknown> | null;
  const nav = (site && typeof site.nav === "object" && site.nav ? site.nav : {}) as Record<string, unknown>;
  const out = { ...SITE_LABELS };
  for (const k of Object.keys(SITE_LABELS) as SiteSection[]) {
    const v = nav[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 40);
  }
  return out;
}
