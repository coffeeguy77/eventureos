/**
 * Website themes: how a business's public pages look (home, pages, classes, shop, café, events, gift cards).
 *
 * Saved in settings.site_theme = { preset, accent, heading, corners, nav }.
 * "classic" is the original warm look built for Bean Culture: it changes nothing, so those pages stay exactly as designed.
 * Every other theme recolours the public pages through one stylesheet (themeCss), so no page has to know about themes.
 * Businesses that joined before themes existed (no app list) default to classic; everyone else starts on "modern".
 *
 * No database or framework imports here, so it can be unit tested with node:test.
 */
import { THEME_CLASSES } from "./theme-classes";

export const THEME_KEYS = ["modern", "bold", "soft", "elegant", "classic"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export const HEADINGS = ["sans", "serif", "display", "elegant"] as const;
export type Heading = (typeof HEADINGS)[number];
export const CORNERS = ["sharp", "soft", "round"] as const;
export type Corners = (typeof CORNERS)[number];
export const NAVS = ["light", "dark", "brand"] as const;
export type NavStyle = (typeof NAVS)[number];

export interface SiteTheme {
  preset: ThemeKey;
  /** the main colour of the website; null = the brand colour from Settings → Branding */
  accent: string | null;
  heading: Heading;
  corners: Corners;
  nav: NavStyle;
}

interface Palette {
  /** page background */
  bg: string;
  /** soft panels (about band, image placeholders) */
  tint: string;
  tint2: string;
  /** neutrals: hue and saturation the warm greys are redrawn in (lightness is kept) */
  hue: number | "brand";
  sat: number;
  /** very dark sections: mixed with the brand colour by this much */
  darkMix: number;
  darkBase: string;
}

export const PRESETS: Record<ThemeKey, { name: string; blurb: string; defaults: Omit<SiteTheme, "preset" | "accent">; palette: Palette | null }> = {
  modern: {
    name: "Modern", blurb: "Clean and bright: white pages, crisp sans-serif headings, your colour on the buttons.",
    defaults: { heading: "sans", corners: "soft", nav: "light" },
    palette: { bg: "#FFFFFF", tint: "#F5F7FA", tint2: "#EEF1F6", hue: 220, sat: 12, darkMix: 18, darkBase: "#0F172A" },
  },
  bold: {
    name: "Bold", blurb: "Confident and high contrast: a dark menu and dark bands that make your colour pop.",
    defaults: { heading: "sans", corners: "sharp", nav: "dark" },
    palette: { bg: "#FAFAFA", tint: "#F1F1F3", tint2: "#E7E7EA", hue: 240, sat: 6, darkMix: 30, darkBase: "#09090B" },
  },
  soft: {
    name: "Soft", blurb: "Friendly and calm: pages lightly tinted with your colour, rounded everything.",
    defaults: { heading: "display", corners: "round", nav: "light" },
    palette: { bg: "brand-tint", tint: "brand-tint-2", tint2: "brand-tint-3", hue: "brand", sat: 18, darkMix: 45, darkBase: "#1C1917" },
  },
  elegant: {
    name: "Elegant", blurb: "Refined: classic serif headings, stone and ivory tones, square-edged buttons.",
    defaults: { heading: "elegant", corners: "sharp", nav: "light" },
    palette: { bg: "#FBFAF7", tint: "#F3F0EA", tint2: "#EAE5DC", hue: 40, sat: 10, darkMix: 12, darkBase: "#1C1A17" },
  },
  classic: {
    name: "Classic", blurb: "Warm cream pages with serif headings and handwritten touches — the original EventureOS look.",
    defaults: { heading: "serif", corners: "round", nav: "light" },
    palette: null,
  },
};

export const HEADING_NAMES: Record<Heading, string> = { sans: "Clean sans-serif", serif: "Book serif", display: "Soft display", elegant: "Elegant serif" };
export const CORNER_NAMES: Record<Corners, string> = { sharp: "Square", soft: "Slightly rounded", round: "Round" };
export const NAV_NAMES: Record<NavStyle, string> = { light: "Light", dark: "Dark", brand: "Your colour" };

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const pick = <T extends string>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);
export const isHex = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

/** The business's theme. `legacy` = joined before themes (no app list), who keep the classic look until they pick one. */
export function readTheme(settings: unknown, legacy: boolean): SiteTheme {
  const raw = obj(obj(settings).site_theme);
  const preset = pick(THEME_KEYS, raw.preset, legacy ? "classic" : "modern");
  const d = PRESETS[preset].defaults;
  return {
    preset,
    accent: isHex(raw.accent) ? raw.accent.toUpperCase() : null,
    heading: pick(HEADINGS, raw.heading, d.heading),
    corners: pick(CORNERS, raw.corners, d.corners),
    nav: pick(NAVS, raw.nav, d.nav),
  };
}

/** Clean a theme from the settings form (anything odd falls back to the preset's own choice). */
export function cleanTheme(input: unknown): SiteTheme {
  return readTheme({ site_theme: input }, false);
}

/* ------------------------------------------------------------------ colour helpers */

function hexToHsl(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, s * 100, l * 100];
}

/** What a hard-coded colour on the classic pages is: a warm neutral to redraw, the old pink accent, or a real colour to keep. */
export function colourRole(hex: string): "neutral" | "accent" | "keep" {
  const [h, s, l] = hexToHsl(hex);
  if (s >= 85 && l >= 50 && l <= 75 && h >= 320 && h <= 345) return "accent";
  if (s <= 45) return "neutral";
  // creams and near-whites with a warm cast, and warm near-blacks
  if (l >= 94 && h >= 15 && h <= 60) return "neutral";
  if (l <= 14 && (h <= 60 || h >= 200)) return "neutral";
  return "keep";
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The theme's version of a warm neutral: same lightness, the theme's hue. Dark ones lean towards the brand colour. */
export function remap(hex: string, p: Palette, brandHue: number): string {
  const [, , l] = hexToHsl(hex);
  const hue = p.hue === "brand" ? brandHue : p.hue;
  if (l <= 16) return `color-mix(in srgb, var(--b) ${p.darkMix}%, ${p.darkBase})`;
  // near-whites stay almost white; mid greys keep readable contrast
  const sat = l >= 94 ? Math.min(p.sat, 30) : l >= 70 ? p.sat * 0.8 : p.sat;
  return `hsl(${round(hue)} ${round(sat)}% ${round(l)}%)`;
}

const esc = (cls: string) => cls.replace(/([\[\]#/\.%(),:])/g, "\\$1");

function ruleFor(cls: string, value: string): string | null {
  const m = /^(bg|text|border(?:-[trblxy])?|ring|from|via|to|divide|decoration|fill|stroke|outline|placeholder)-\[#[0-9A-Fa-f]{3,8}\](?:\/(\d+))?$/.exec(cls);
  if (!m) return null;
  const [, kind, op] = m;
  const v = op ? `color-mix(in srgb, ${value} ${op}%, transparent)` : value;
  const sel = `body .${esc(cls)}`;
  switch (kind) {
    case "bg": return `${sel}{background-color:${v}}`;
    case "text": return `${sel}{color:${v}}`;
    case "ring": return `${sel}{--tw-ring-color:${v}}`;
    case "from": return `${sel}{--tw-gradient-from:${v} var(--tw-gradient-from-position);--tw-gradient-to:transparent var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to)}`;
    case "via": return `${sel}{--tw-gradient-to:transparent var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from),${v} var(--tw-gradient-via-position),var(--tw-gradient-to)}`;
    case "to": return `${sel}{--tw-gradient-to:${v} var(--tw-gradient-to-position)}`;
    case "divide": return `${sel}>:not([hidden])~:not([hidden]){border-color:${v}}`;
    case "decoration": return `${sel}{text-decoration-color:${v}}`;
    case "fill": return `${sel}{fill:${v}}`;
    case "stroke": return `${sel}{stroke:${v}}`;
    case "outline": return `${sel}{outline-color:${v}}`;
    case "placeholder": return `${sel}::placeholder{color:${v}}`;
    default: return `${sel}{border-color:${v}}`; // border, border-t, …
  }
}

const FONTS: Record<Heading, { family: string; weight: number; spacing: string } | null> = {
  serif: null,
  sans: { family: "var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif", weight: 650, spacing: "-0.035em" },
  display: { family: "'Fraunces Variable',Georgia,serif", weight: 600, spacing: "-0.02em" },
  elegant: { family: "'Playfair Display',Georgia,'Times New Roman',serif", weight: 700, spacing: "-0.01em" },
};
const RADII: Record<Corners, { btn: string; card: string; big: string }> = {
  sharp: { btn: "6px", card: "6px", big: "8px" },
  soft: { btn: "12px", card: "16px", big: "22px" },
  round: { btn: "9999px", card: "22px", big: "30px" },
};

/** The hue of the brand colour (for the "soft" theme's tinted greys). */
export const brandHue = (brand: string) => hexToHsl(isHex(brand) ? brand : "#6028EC")[0];

/**
 * The stylesheet for a theme, or "" for classic. It's printed on the business's own public pages only,
 * so its rules can be page-wide. `brand` is the colour the page will use (accent or brand colour).
 */
export function themeCss(t: SiteTheme, brand: string): string {
  const p = PRESETS[t.preset].palette;
  const out: string[] = [];
  const bh = brandHue(brand);
  const font = FONTS[t.heading];
  if (p) {
    const tint = (n: number) => `color-mix(in srgb, ${brand} ${n}%, #FFFFFF)`;
    const val = (v: string) => (v === "brand-tint" ? tint(4) : v === "brand-tint-2" ? tint(8) : v === "brand-tint-3" ? tint(13) : v);
    out.push(`:root{--t-bg:${val(p.bg)};--t-tint:${val(p.tint)};--t-tint2:${val(p.tint2)}}`);
    out.push(`html,body{background:${val(p.bg)}!important}`);
    // the old pink-mixed accent becomes the business's own colour
    out.push(`body [data-book-root],body .shop,body .lp{--pk:var(--b)}`);
    for (const cls of THEME_CLASSES) {
      const hex = /#([0-9A-Fa-f]{3,8})/.exec(cls)?.[1];
      if (!hex) continue;
      const role = colourRole(`#${hex.slice(0, 6)}`);
      const v = role === "accent" ? "var(--b)" : role === "neutral" ? remap(`#${hex.slice(0, 6)}`, p, bh) : null;
      const r = v && ruleFor(cls, v);
      if (r) out.push(r);
    }
    // the page backgrounds
    out.push(`body .bg-\\[\\#FCFAF7\\],body .bg-\\[\\#FAF7F3\\],body .bg-canvas{background-color:var(--t-bg)}`);
    // handwritten touches become small caps labels
    out.push(`body .shop-hand,body .lp-hand{font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif!important;font-weight:650!important;font-size:0.8125rem!important;line-height:1.4!important;letter-spacing:.16em;text-transform:uppercase}`);
  }
  if (font) {
    out.push(`body .shop-serif,body .lp-serif{font-family:${font.family}!important;font-weight:${font.weight}!important;letter-spacing:${font.spacing}!important;font-variation-settings:normal}`);
  }
  if (p || t.corners !== "round") {
    const r = RADII[t.corners];
    out.push(`body .shop-btn.rounded-full,body .lp-btn,body a.rounded-full.bg-\\[var\\(--pk\\)\\],body [data-master-nav] .shop-btn{border-radius:${r.btn}!important}`);
    out.push(`body .shop-card,body [data-book-root] .rounded-xl,body [data-book-root] .rounded-2xl{border-radius:${r.card}}`);
    out.push(`body [data-book-root] [class*="rounded-[2"],body [data-book-root] [class*="rounded-[3"],body [data-book-root] .rounded-3xl{border-radius:${r.big}}`);
  }
  return out.join("\n");
}

/** The colour the public pages use: the theme's own colour if one is picked, otherwise the brand colour. */
export const themeBrand = (t: SiteTheme, brandColour: string | null | undefined) => t.accent ?? (isHex(brandColour) ? brandColour : "#6028EC");
