/**
 * The menu bar across a business's public pages (events, classes, job board, shop, café, gift certificates), so they read as one website.
 * Labels live in organisations.settings.site.nav; a section only shows when it's switched on.
 */
export type SiteSection = "events" | "lessons" | "jobs" | "shop" | "cafe" | "gifts";
export const SITE_LABELS: Record<SiteSection, string> = { events: "Events", lessons: "Classes", jobs: "Job board", shop: "Shop", cafe: "Café", gifts: "Gift certificates" };

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

/**
 * Extra classes listed under Barista lessons in the menu and footer (e.g. a roasting course), straight to that course's page.
 * Saved at settings.site.lessonLinks = [{ label, course: "<course slug>", note }].
 */
export interface LessonLink { label: string; href: string; note: string }
export function lessonLinks(raw: unknown, slug: string): LessonLink[] {
  const site = raw && typeof raw === "object" ? (raw as Record<string, unknown>).site : null;
  const list = site && typeof site === "object" ? (site as Record<string, unknown>).lessonLinks : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { label, course, note } = x as Record<string, unknown>;
    if (typeof label !== "string" || !label.trim() || typeof course !== "string" || !/^[a-z0-9-]{1,80}$/.test(course)) return [];
    return [{ label: label.trim().slice(0, 40), href: `/book/${slug}/${course}`, note: typeof note === "string" ? note.trim().slice(0, 60) : "" }];
  }).slice(0, 4);
}
