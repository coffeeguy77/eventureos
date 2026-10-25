/**
 * Light or dark footer, chosen per page in the page editor. Saved at settings.site.footerTone["<page key>"].
 * The page key is the page's own address with the business name taken out: /cafe/<org>/roasting-club → "cafe-roasting-club".
 */
export type FooterTone = "dark" | "light";

export function footerPageKey(path: string, slug: string) {
  const parts = path.split(/[?#]/)[0].split("/").filter(Boolean).filter((p) => p !== slug);
  const key = parts.join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return key || "home";
}

export function footerToneFor(settings: unknown, key: string): FooterTone {
  const site = settings && typeof settings === "object" ? (settings as Record<string, unknown>).site : null;
  const tones = site && typeof site === "object" ? (site as Record<string, unknown>).footerTone : null;
  const v = tones && typeof tones === "object" ? (tones as Record<string, unknown>)[key] : null;
  return v === "dark" ? "dark" : "light";
}
