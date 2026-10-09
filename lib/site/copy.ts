/**
 * Edit-in-place for the public website.
 *
 * Text and photos on the public pages carry a data attribute naming where their value lives:
 *   data-edit="copy:events.how.title"   → organisations.settings.site.copy["events.how.title"] (words written in the page code by default)
 *   data-edit="events.intro"            → a field the business already has in its settings (validated by that section's reader)
 *   data-edit-img="events.images.hero"  → a photo in settings
 * A signed-in owner / admin / manager sees "Edit this page", clicks any outlined text or photo, changes it and saves.
 */

export type Copy = (key: string, fallback: string) => string;

/** The words for one page section: the saved override, or the built-in text. */
export function copyOf(orgSettings: unknown, page: string): Copy {
  const site = (orgSettings && typeof orgSettings === "object" ? (orgSettings as Record<string, unknown>).site : null) as Record<string, unknown> | null;
  const all = (site && typeof site.copy === "object" && site.copy ? site.copy : {}) as Record<string, unknown>;
  return (key, fallback) => {
    const v = all[`${page}.${key}`];
    return typeof v === "string" && v.trim() ? v : fallback;
  };
}

/** Spread onto an element holding editable words. `raw` is the stored value when the element shows it formatted (e.g. *pink* words). */
export const ed = (path: string, raw?: string) => ({ "data-edit": path, ...(raw !== undefined ? { "data-edit-raw": raw } : {}) });
/** Spread onto an <img> (or an element with a background photo) that can be swapped. */
export const edImg = (path: string) => ({ "data-edit-img": path });

/** Settings fields (outside site.copy) the page editor may change — anything else is refused. */
const FIELD_PATHS: RegExp[] = [
  /^events\.(heading|intro|city)$/,
  /^events\.(blurbs|labels)\.(cart|van|diy)$/,
  /^events\.images\.(hero|cart|van|diy|drinks|branding|catering|band|contact)$/,
  /^cafe\.(heroTitle|heroText|coffeeTitle|coffeeText|kitchenTitle|kitchenText|clubTitle|clubIntro|wholesaleTitle|wholesaleIntro)$/,
  /^cafe\.(heroImage|coffeeImage|kitchenImage|clubImage|wholesaleImage)$/,
  /^shop\.(title|tagline|heroImage|subsHero|subsImage|roastNote|giftTagline)$/,
  /^booking\.landing\.(headline|eyebrow|heroImage|giftImage|locationImage)$/,
  /^booking\.landing\.copy\.[a-zA-Z]{2,40}$/,
  /^booking\.intro$/,
  /^jobs\.(heroImage|employerImage)$/,
];
export const COPY_KEY = /^copy:[a-z0-9-]{1,30}\.[a-z0-9_.-]{1,80}$/;

export function editablePath(path: string) {
  return COPY_KEY.test(path) || FIELD_PATHS.some((r) => r.test(path));
}
export const isImagePath = (path: string) => /(images\.|Image$|subsHero$|heroImage$)/.test(path);

/** A photo address the website may show: https, or a file on this site. */
export const okImage = (v: string) => /^https:\/\/[^\s"'<>]{4,500}$/.test(v) || /^\/media\/[\w./-]{1,200}$/.test(v);

/** Apply edits to a copy of the settings object (pure — used by the save action and tests). */
export function applyEdits(settings: Record<string, unknown>, edits: { path: string; value: string }[]) {
  const out: Record<string, unknown> = structuredClone(settings ?? {});
  for (const e of edits) {
    if (!editablePath(e.path)) throw new Error(`That part of the page can't be edited here (${e.path}).`);
    const value = String(e.value ?? "").replace(/\r\n/g, "\n").slice(0, isImagePath(e.path) ? 500 : 4000);
    if (isImagePath(e.path) && value && !okImage(value.trim())) throw new Error("Photos must be uploaded, or be a link starting with https://");
    if (e.path.startsWith("copy:")) {
      const site = (out.site && typeof out.site === "object" ? out.site : (out.site = {})) as Record<string, unknown>;
      const copy = (site.copy && typeof site.copy === "object" ? site.copy : (site.copy = {})) as Record<string, unknown>;
      const key = e.path.slice(5);
      if (value.trim()) copy[key] = value.trim(); else delete copy[key];
      continue;
    }
    const parts = e.path.split(".");
    let node = out as Record<string, unknown>;
    for (const p of parts.slice(0, -1)) {
      if (!node[p] || typeof node[p] !== "object") node[p] = {};
      node = node[p] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (value.trim()) node[last] = value.trim(); else delete node[last];
  }
  return out;
}
