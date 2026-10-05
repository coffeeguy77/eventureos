/**
 * Course certificates — the design (saved per business) and one layout used by both the on-screen preview (SVG)
 * and the PDF, so what you design is exactly what people download. Pure: no server or browser imports.
 * A4 landscape in PDF points (842 × 595); origin top-left.
 */

export type CertStyle = "swoosh" | "classic" | "modern" | "minimal" | "latte" | "botanical" | "poster" | "elegant";
export const CERT_STYLES: CertStyle[] = ["swoosh", "classic", "modern", "minimal", "latte", "botanical", "poster", "elegant"];
export interface CertDesign {
  style: CertStyle;
  accent: string;          // borders, title, seal
  paper: string;           // background
  title: string;           // "Certificate of Completion"
  subtitle: string;        // "This certifies that"
  body: string;            // "has successfully completed the {course} on {date}."
  footer: string;          // small line at the bottom, e.g. the address
  signerName: string;
  signerTitle: string;
  signature: string | null; // PNG/JPEG data URL — drawn in the builder or uploaded
  background: string | null; // https link to your own full-page artwork (replaces the built-in artwork)
  showLogo: boolean;
  showQr: boolean;
  showNumber: boolean;
  showSeal: boolean;
  sealText: string;        // words on the seal
  /** What each course covers, printed on its certificates — course id → points (e.g. "Milk texturing") */
  skills: Record<string, string[]>;
  showSkills: boolean;
  /** Email each student their certificate automatically after the class */
  emailAuto: boolean;
  // Used by the newer styles (latte, botanical, poster, elegant)
  eyebrow: string;         // small line above the title, e.g. "Barista training"
  tagline: string;         // under the course, e.g. "{business} · Canberra"
  hoursLine: string;       // e.g. "{hours} practical training"
  photo: string | null;    // https photo for the side panel (latte, poster)
  panelTitle: string;      // poster: big words under the business name, e.g. "Barista training"
  panelWords: string;      // poster: small words, one per line
  sealTop: string;         // words around the top of the seal
  sealBottom: string;      // words around the bottom of the seal
  /** Finished artwork per style (https, A4 landscape): everything that's the same on every certificate is in the picture,
   *  and only the student's details are printed on top, in the places that style uses. */
  arts: Partial<Record<"latte" | "botanical" | "poster" | "elegant", string>>;
}

export const DEFAULT_DESIGN: CertDesign = {
  style: "swoosh", accent: "#E8508A", paper: "#EDEDEF",
  title: "Certificate of Achievement", subtitle: "This certificate is proudly presented to",
  body: "Has successfully completed the {course} at {business}.", footer: "",
  signerName: "", signerTitle: "", signature: null, background: null,
  showLogo: true, showQr: true, showNumber: true, showSeal: true, sealText: "Completed",
  skills: {}, showSkills: true, emailAuto: false,
  eyebrow: "", tagline: "{business}", hoursLine: "{hours}", photo: null, panelTitle: "", panelWords: "", sealTop: "{business}", sealBottom: "", arts: {},
};

const HEX = /^#[0-9a-f]{6}$/i;
const s = (v: unknown, d: string, max: number) => (typeof v === "string" ? v.slice(0, max) : d);
export function readDesign(raw: unknown): CertDesign {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sig = typeof o.signature === "string" && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(o.signature) && o.signature.length < 600_000 ? o.signature : null;
  const bg = typeof o.background === "string" && /^https:\/\/[^\s"'<>]+$/.test(o.background) && o.background.length < 600 ? o.background : null;
  return {
    style: CERT_STYLES.includes(o.style as CertStyle) ? (o.style as CertStyle) : "swoosh",
    accent: typeof o.accent === "string" && HEX.test(o.accent) ? o.accent : DEFAULT_DESIGN.accent,
    paper: typeof o.paper === "string" && HEX.test(o.paper) ? o.paper : DEFAULT_DESIGN.paper,
    title: s(o.title, DEFAULT_DESIGN.title, 80) || DEFAULT_DESIGN.title,
    subtitle: s(o.subtitle, DEFAULT_DESIGN.subtitle, 80),
    body: s(o.body, DEFAULT_DESIGN.body, 300),
    footer: s(o.footer, "", 160),
    signerName: s(o.signerName, "", 80), signerTitle: s(o.signerTitle, DEFAULT_DESIGN.signerTitle, 80),
    signature: sig, background: bg,
    showLogo: o.showLogo !== false, showQr: o.showQr !== false, showNumber: o.showNumber !== false, showSeal: o.showSeal !== false,
    sealText: s(o.sealText, DEFAULT_DESIGN.sealText, 24),
    skills: readSkills(o.skills), showSkills: o.showSkills !== false, emailAuto: o.emailAuto === true,
    eyebrow: s(o.eyebrow, "", 40), tagline: s(o.tagline, DEFAULT_DESIGN.tagline, 120), hoursLine: s(o.hoursLine, DEFAULT_DESIGN.hoursLine, 60),
    photo: typeof o.photo === "string" && /^https:\/\/[^\s"'<>]+$/.test(o.photo) && o.photo.length < 600 ? o.photo : null,
    panelTitle: s(o.panelTitle, "", 40), panelWords: s(o.panelWords, "", 160), sealTop: s(o.sealTop, DEFAULT_DESIGN.sealTop, 40), sealBottom: s(o.sealBottom, "", 30),
    arts: readArts(o.arts),
  };
}

function readArts(raw: unknown): CertDesign["arts"] {
  const out: CertDesign["arts"] = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of ["latte", "botanical", "poster", "elegant"] as const) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v) && v.length < 600) out[k] = v;
  }
  return out;
}
/** The artwork for the chosen style, if the business has one. */
export const artFor = (d: Pick<CertDesign, "style" | "arts">) => (d.style in d.arts ? d.arts[d.style as keyof CertDesign["arts"]] ?? null : null);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function readSkills(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 60)) {
    if (!UUID.test(k) || !Array.isArray(v)) continue;
    const pts = v.filter((x): x is string => typeof x === "string").map((x) => x.trim().replace(/\s+/g, " ").slice(0, 60)).filter(Boolean).slice(0, 10);
    if (pts.length) out[k] = pts;
  }
  return out;
}

export interface CertData { name: string; course: string; date: string; hours: string | null; number: string; business: string; verifyUrl: string; points?: string[] }

export function fill(text: string, d: CertData) {
  return text.replace(/\{(name|course|date|hours|business|number)\}/g, (_, k: "name" | "course" | "date" | "hours" | "business" | "number") => (k === "hours" ? d.hours ?? "" : d[k]) ?? "");
}

export type Font = "script" | "serif" | "serifItalic" | "sans" | "sansBold" | "light" | "body" | "display" | "condensed" | "serifRegular" | "medium" | "scriptCasual" | "scriptFormal";
export type Item =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; opacity?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: "text"; x: number; y: number; text: string; font: Font; size: number; color: string; align: "left" | "center" | "right"; spacing?: number; rotate?: number }
  | { t: "image"; x: number; y: number; w: number; h: number; src: "logo" | "signature" | "qr" | "background" | "photo" | "art"; fit?: "contain" | "cover" | "fill"; align?: "center" | "right"; opacity?: number }
  | { t: "path"; d: string; fill: string; opacity?: number };

export const W = 842, H = 595;
import { ART_STYLES, NEW_STYLES } from "./certificate-styles";
// Average glyph widths (share of the font size), measured from the actual font files, for lower-case and capitals.
// Used to wrap and shrink text identically in the preview and the PDF. A small safety margin is added.
const LOWER: Record<Font, number> = { script: 0.33, serif: 0.48, serifItalic: 0.44, sans: 0.45, sansBold: 0.46, light: 0.44, body: 0.44, display: 0.45, condensed: 0.38, serifRegular: 0.47, medium: 0.45, scriptCasual: 0.26, scriptFormal: 0.4 };
const UPPER: Record<Font, number> = { script: 0.86, serif: 0.62, serifItalic: 0.59, sans: 0.58, sansBold: 0.58, light: 0.54, body: 0.54, display: 0.54, condensed: 0.43, serifRegular: 0.59, medium: 0.55, scriptCasual: 0.62, scriptFormal: 0.71 };
export const approxWidth = (text: string, font: Font, size: number, spacing = 0) => {
  let em = 0;
  for (const ch of text) em += ch >= "A" && ch <= "Z" ? UPPER[font] : ch === " " ? 0.25 : /[0-9]/.test(ch) ? 0.52 : LOWER[font];
  return (em * size + text.length * spacing) * 1.04;
};

export function wrap(text: string, font: Font, size: number, maxWidth: number, maxLines = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (approxWidth(next, font, size) > maxWidth && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/** Wrap a list of short items with " · " between them, never splitting an item across lines. */
export function wrapItems(items: string[], font: Font, size: number, maxWidth: number, maxLines = 4) {
  const lines: string[] = [];
  let line = "";
  for (const it of items) {
    const next = line ? `${line}  ·  ${it}` : it;
    if (line && approxWidth(next, font, size) > maxWidth) { lines.push(line); line = it; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

export function fit(text: string, font: Font, size: number, maxWidth: number, min = size * 0.55, spacing = 0) {
  let z = size;
  while (z > min && approxWidth(text, font, z, spacing) > maxWidth) z -= 0.25;
  return z;
}

/** Lighter version of a hex colour (for the seal ring and frame). */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function layout(d: CertDesign, data: CertData, has: { logo: boolean; art?: boolean }): Item[] {
  const ink = "#1F1A17", muted = "#5B544E", items: Item[] = [];
  const A = d.accent;
  items.push({ t: "rect", x: 0, y: 0, w: W, h: H, fill: d.paper });
  if (d.style === "swoosh") return swoosh(d, data, has, items);
  if (d.style === "latte" || d.style === "botanical" || d.style === "poster" || d.style === "elegant") {
    if (has.art && artFor(d)) return ART_STYLES[d.style](d, data, items);
    return NEW_STYLES[d.style](d, data, has, items);
  }
  let cx = W / 2, textW = 600;

  if (d.style === "classic") {
    items.push({ t: "rect", x: 22, y: 22, w: W - 44, h: H - 44, stroke: A, sw: 3 });
    items.push({ t: "rect", x: 32, y: 32, w: W - 64, h: H - 64, stroke: tint(A, 0.35), sw: 1 });
    for (const [x, y] of [[32, 32], [W - 32, 32], [32, H - 32], [W - 32, H - 32]]) items.push({ t: "circle", cx: x, cy: y, r: 5, fill: A });
  } else if (d.style === "modern") {
    items.push({ t: "rect", x: 0, y: 0, w: 34, h: H, fill: A });
    items.push({ t: "rect", x: 34, y: 0, w: 8, h: H, fill: tint(A, 0.6) });
    items.push({ t: "line", x1: 90, y1: H - 40, x2: W - 50, y2: H - 40, stroke: tint(A, 0.5), sw: 1 });
    cx = (W + 42) / 2; textW = 580;
  } else {
    items.push({ t: "rect", x: 40, y: 40, w: W - 80, h: H - 80, stroke: tint(A, 0.2), sw: 0.75 });
  }

  let y = 74;
  if (d.showLogo && has.logo) { items.push({ t: "image", x: cx - 70, y: y - 16, w: 140, h: 52, src: "logo" }); y += 58; }
  else { items.push({ t: "text", x: cx, y: y + 10, text: data.business.toUpperCase(), font: "sansBold", size: 12, color: A, align: "center", spacing: 3 }); y += 34; }

  const titleFont: Font = d.style === "modern" ? "sansBold" : "serif";
  const title = d.style === "minimal" ? d.title : d.title.toUpperCase();
  const tSize = fit(title, titleFont, d.style === "minimal" ? 34 : 30, textW, 18);
  items.push({ t: "text", x: cx, y: y + 20, text: title, font: titleFont, size: tSize, color: d.style === "minimal" ? ink : A, align: "center", spacing: d.style === "minimal" ? 0 : 2.5 });
  y += 54;
  if (d.style !== "minimal") { items.push({ t: "line", x1: cx - 60, y1: y, x2: cx + 60, y2: y, stroke: A, sw: 1.2 }); }
  y += 44;
  if (d.subtitle) { items.push({ t: "text", x: cx, y, text: fill(d.subtitle, data), font: "serifItalic", size: 16, color: muted, align: "center" }); y += 26; }

  const nameFont: Font = d.style === "modern" ? "serif" : "script";
  const nSize = fit(data.name, nameFont, nameFont === "script" ? 60 : 40, textW, 26);
  items.push({ t: "text", x: cx, y: y + nSize * 0.85, text: data.name, font: nameFont, size: nSize, color: ink, align: "center" });
  y += nSize + 18;
  items.push({ t: "line", x1: cx - 200, y1: y, x2: cx + 200, y2: y, stroke: tint(A, 0.45), sw: 0.75 });
  y += 34;
  for (const line of wrap(fill(d.body, data), "sans", 15, textW - 60, 3)) { items.push({ t: "text", x: cx, y, text: line, font: "sans", size: 15, color: muted, align: "center" }); y += 22; }
  if (d.showSkills && data.points?.length) {
    // Skills covered: one or two lines, only where there's room above the signature row
    const lines = wrapItems(data.points, "sans", 10.5, textW - 40, 2);
    if (y + 6 + lines.length * 15 < H - 170) {
      y += 6;
      items.push({ t: "text", x: cx, y, text: `SKILLS COVERED${data.hours ? `  ·  ${data.hours.toUpperCase()}` : ""}`, font: "sansBold", size: 8, color: A, align: "center", spacing: 1.5 }); y += 15;
      for (const l of lines) { items.push({ t: "text", x: cx, y, text: l, font: "sans", size: 10.5, color: muted, align: "center" }); y += 15; }
    }
  }

  // Signature (left), seal (middle), date (right)
  const baseY = H - 112;
  const leftX = d.style === "modern" ? 130 : 110, rightX = W - (d.style === "modern" ? 110 : 110) - 170;
  if (d.signature) items.push({ t: "image", x: leftX + 10, y: baseY - 52, w: 150, h: 48, src: "signature" });
  items.push({ t: "line", x1: leftX, y1: baseY, x2: leftX + 170, y2: baseY, stroke: muted, sw: 0.75 });
  if (d.signerName) items.push({ t: "text", x: leftX + 85, y: baseY + 16, text: d.signerName, font: "sansBold", size: 11, color: ink, align: "center" });
  if (d.signerTitle) items.push({ t: "text", x: leftX + 85, y: baseY + (d.signerName ? 30 : 16), text: d.signerTitle, font: "sans", size: 10, color: muted, align: "center" });

  items.push({ t: "text", x: rightX + 85, y: baseY - 8, text: data.date, font: "serif", size: 14, color: ink, align: "center" });
  items.push({ t: "line", x1: rightX, y1: baseY, x2: rightX + 170, y2: baseY, stroke: muted, sw: 0.75 });
  items.push({ t: "text", x: rightX + 85, y: baseY + 16, text: "Date", font: "sans", size: 10, color: muted, align: "center" });

  if (d.showSeal) {
    const sy = baseY - 12;
    items.push({ t: "circle", cx, cy: sy, r: 40, fill: A });
    items.push({ t: "circle", cx, cy: sy, r: 34, stroke: tint(A, 0.55), sw: 1 });
    items.push({ t: "text", x: cx, y: sy + 4, text: d.sealText.toUpperCase(), font: "sansBold", size: fit(d.sealText.toUpperCase(), "sansBold", 9, 52, 5, 1.2), color: "#FFFFFF", align: "center", spacing: 1.2 });
    if (data.hours) items.push({ t: "text", x: cx, y: sy + 16, text: data.hours, font: "sans", size: 7.5, color: "#FFFFFF", align: "center" });
  }

  // Footer: number + verify QR
  const fy = H - 52;
  const qx = W - (d.style === "classic" ? 108 : 100);
  if (d.showQr) items.push({ t: "image", x: qx, y: fy - 50, w: 50, h: 50, src: "qr" });
  const foot = [d.showNumber ? `Certificate ${data.number}` : null, d.footer ? fill(d.footer, data) : null].filter(Boolean).join("  ·  ");
  if (foot) items.push({ t: "text", x: cx, y: fy + 12, text: foot, font: "sans", size: 8.5, color: muted, align: "center" });
  if (d.showQr) items.push({ t: "text", x: qx + 25, y: fy + 9, text: "Scan to verify", font: "sans", size: 6.5, color: muted, align: "center" });
  return items;
}

/** Scalloped rosette with two ribbon tails (the "award" badge), with its words fitted inside the centre. */
function rosette(cx: number, cy: number, r: number, color: string, words: string, sub: string | null, items: Item[]) {
  const dark = shade(color, 0.2);
  // Ribbons first (behind)
  items.push({ t: "path", d: `M${cx - r * 0.5},${cy + r * 0.35} L${cx - r * 0.85},${cy + r * 1.55} L${cx - r * 0.5},${cy + r * 1.35} L${cx - r * 0.28},${cy + r * 1.65} L${cx - r * 0.02},${cy + r * 0.6} Z`, fill: dark });
  items.push({ t: "path", d: `M${cx + r * 0.5},${cy + r * 0.35} L${cx + r * 0.85},${cy + r * 1.55} L${cx + r * 0.5},${cy + r * 1.35} L${cx + r * 0.28},${cy + r * 1.65} L${cx + r * 0.02},${cy + r * 0.6} Z`, fill: dark });
  const n = 24, pts: string[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2, rr = i % 2 ? r * 0.9 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  items.push({ t: "path", d: `M${pts.join(" L")} Z`, fill: color });
  items.push({ t: "circle", cx, cy, r: r * 0.76, stroke: "#FFFFFF", sw: 1 });
  items.push({ t: "circle", cx, cy, r: r * 0.7, fill: tint(color, 0.12) });
  // Words: one line if it fits at a readable size, otherwise two lines (split at a space)
  const inner = r * 0.7 * 2 * 0.8, up = words.toUpperCase().trim();
  if (!up) return;
  const sp = 0.6, one = fit(up, "display", r * 0.24, inner, 4, sp);
  const parts = up.split(/\s+/);
  if (one >= r * 0.2 || parts.length < 2) {
    items.push({ t: "text", x: cx, y: cy + one * 0.36 - (sub ? 3 : 0), text: up, font: "display", size: one, color: "#FFFFFF", align: "center", spacing: sp });
  } else {
    const mid = Math.ceil(parts.length / 2), l1 = parts.slice(0, mid).join(" "), l2 = parts.slice(mid).join(" ");
    const z = Math.min(fit(l1, "display", r * 0.24, inner, 4, sp), fit(l2, "display", r * 0.24, inner, 4, sp));
    items.push({ t: "text", x: cx, y: cy - z * 0.25, text: l1, font: "display", size: z, color: "#FFFFFF", align: "center", spacing: sp });
    items.push({ t: "text", x: cx, y: cy + z * 0.95, text: l2, font: "display", size: z, color: "#FFFFFF", align: "center", spacing: sp });
  }
  if (sub && (one >= r * 0.2 || parts.length < 2)) items.push({ t: "text", x: cx, y: cy + r * 0.4, text: sub, font: "body", size: fit(sub, "body", r * 0.17, inner, 4), color: "#FFFFFF", align: "center" });
}

/**
 * "Swoosh": flowing layered curves down the left in tints of the brand colour, logo top-right, right-aligned type,
 * then a bottom row of rosette · date · signature, each in its own space. The verify QR sits on a white card bottom-left.
 * Your own artwork (background) replaces the curves.
 */
function swoosh(d: CertDesign, data: CertData, has: { logo: boolean }, items: Item[]): Item[] {
  const A = d.accent, ink = "#1D1D1F", muted = "#55555C", faint = "#8E8E95";
  if (d.background) items.push({ t: "image", x: 0, y: 0, w: W, h: H, src: "background", fit: "cover" });
  else {
    const bands: [string, string, number?][] = [
      [`M0,0 L215,0 C140,135 72,300 52,${H} L0,${H} Z`, shade(A, 0.22)],
      [`M215,0 L268,0 C188,160 128,340 138,${H} L52,${H} C72,300 140,135 215,0 Z`, A],
      [`M268,0 L284,0 C206,168 148,350 160,${H} L138,${H} C128,340 188,160 268,0 Z`, "#D9D9DE"],
      [`M284,0 L338,0 C246,185 204,370 238,${H} L160,${H} C148,350 206,168 284,0 Z`, tint(A, 0.3)],
      [`M338,0 L362,0 C270,205 238,395 300,${H} L238,${H} C204,370 246,185 338,0 Z`, tint(A, 0.55)],
      [`M0,${H - 175} C110,${H - 125} 215,${H - 70} 300,${H} L0,${H} Z`, tint(A, 0.72), 0.85],
      [`M0,${H - 95} C95,${H - 70} 160,${H - 35} 205,${H} L0,${H} Z`, shade(A, 0.08), 0.9],
    ];
    for (const [path, fillc, op] of bands) items.push({ t: "path", d: path, fill: fillc, opacity: op });
    items.push({ t: "path", d: `M362,0 L372,0 C282,210 250,400 316,${H} L300,${H} C238,395 270,205 362,0 Z`, fill: "#FFFFFF", opacity: 0.85 });
  }
  // Text column on the right
  const R = W - 56, L = 410, CW = R - L;
  let y = 36;
  if (d.showLogo && has.logo) { items.push({ t: "image", x: R - 240, y, w: 240, h: 118, src: "logo", fit: "contain", align: "right" }); y = 190; }
  else { items.push({ t: "text", x: R, y: y + 44, text: data.business.toUpperCase(), font: "display", size: fit(data.business.toUpperCase(), "display", 28, CW, 16, 2), color: ink, align: "right", spacing: 2 }); y = 150; }
  // Centre the text block in the space between the logo and the bottom row
  const by = H - 92, rosR = 38, rosX = L + rosR + 4, rosY = by - 18, contentLimit = rosY - rosR - 14;
  const bodyLines = wrap(fill(d.body, data), "body", 11, CW, 3);
  const skillLines = d.showSkills && data.points?.length ? wrapItems(data.points, "body", 10.5, CW, 4) : [];
  const blockH = 34 + (d.subtitle ? 40 : 22) + 36 + bodyLines.length * 16 + (skillLines.length ? 14 + 15 + skillLines.length * 15 : 0);
  y += Math.max(0, Math.min(46, (contentLimit - y - blockH) / 2));
  const title = d.title.toUpperCase();
  items.push({ t: "text", x: R, y: y + 12, text: title, font: "display", size: fit(title, "display", 22, CW, 13), color: ink, align: "right" });
  y += 34;
  if (d.subtitle) { items.push({ t: "text", x: R, y, text: fill(d.subtitle, data), font: "body", size: fit(fill(d.subtitle, data), "body", 11.5, CW, 8), color: muted, align: "right" }); y += 40; } else y += 22;
  const nSize = fit(data.name, "light", 36, CW, 20);
  items.push({ t: "text", x: R, y, text: data.name, font: "light", size: nSize, color: A, align: "right" });
  y += 14;
  items.push({ t: "line", x1: R - 70, y1: y, x2: R, y2: y, stroke: A, sw: 1.2 });
  y += 22;
  for (const line of bodyLines) { items.push({ t: "text", x: R, y, text: line, font: "body", size: 11, color: ink, align: "right" }); y += 16; }

  // What the course covered
  if (skillLines.length) {
    y = Math.min(y + 14, contentLimit - (15 + skillLines.length * 15) + 4);
    items.push({ t: "text", x: R, y, text: `SKILLS COVERED${data.hours ? `  ·  ${data.hours.toUpperCase()}` : ""}`, font: "display", size: 7.5, color: A, align: "right", spacing: 1.4 });
    y += 16;
    for (const l of skillLines) { items.push({ t: "text", x: R, y, text: l, font: "body", size: 10.5, color: muted, align: "right" }); y += 15; }
  }

  // Bottom row: rosette | date | signature — fixed, non-overlapping zones
  if (d.showSeal) rosette(rosX, rosY, rosR, A, d.sealText, data.hours, items);
  const dateL = (d.showSeal ? rosX + rosR + 26 : L), dateR = R - 168, dateC = (dateL + dateR) / 2;
  items.push({ t: "text", x: dateC, y: by - 8, text: data.date, font: "body", size: fit(data.date, "body", 12, dateR - dateL, 9), color: ink, align: "center" });
  items.push({ t: "line", x1: dateL, y1: by, x2: dateR, y2: by, stroke: faint, sw: 0.6 });
  items.push({ t: "text", x: dateC, y: by + 12, text: "Date of completion", font: "body", size: 7.5, color: faint, align: "center" });
  const sigL = R - 150;
  if (d.signature) items.push({ t: "image", x: sigL, y: by - 58, w: 150, h: 54, src: "signature", fit: "contain", align: "center" });
  items.push({ t: "line", x1: sigL, y1: by, x2: R, y2: by, stroke: faint, sw: 0.6 });
  if (d.signerName) items.push({ t: "text", x: sigL + 75, y: by + 12, text: d.signerName, font: "display", size: fit(d.signerName, "display", 8.5, 150, 6), color: ink, align: "center" });
  if (d.signerTitle) items.push({ t: "text", x: sigL + 75, y: by + (d.signerName ? 23 : 12), text: d.signerTitle, font: "body", size: fit(d.signerTitle, "body", 7.5, 150, 5.5), color: faint, align: "center" });

  // Footer and the verify QR on a white card (bottom-left, over the artwork)
  const foot = [d.footer ? fill(d.footer, data) : null, d.showNumber ? `Certificate ${data.number}` : null].filter(Boolean).join("  ·  ");
  if (foot) items.push({ t: "text", x: R, y: H - 22, text: foot, font: "body", size: fit(foot, "body", 7.5, CW, 5.5), color: muted, align: "right" });
  if (d.showQr) {
    items.push({ t: "rect", x: 28, y: H - 120, w: 80, h: 94, fill: "#FFFFFF" });
    items.push({ t: "image", x: 38, y: H - 112, w: 60, h: 60, src: "qr" });
    items.push({ t: "text", x: 68, y: H - 40, text: "Scan to verify", font: "body", size: 7, color: muted, align: "center" });
  }
  return items;
}

/** Darker version of a hex colour. */
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - amount)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** "Saturday 10 October 2026" style date, as printed on the certificate. */
export const certDate = (iso: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso.slice(0, 10) + "T00:00:00Z"));
export const hoursLabel = (minutes: number | null | undefined) => (minutes ? `${Math.round((minutes / 60) * 10) / 10} hour${minutes === 60 ? "" : "s"}` : null);

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const FAMILY: Record<Font, string> = {
  script: "'EOS Script'", serif: "'EOS Serif'", serifItalic: "'EOS Serif Italic'", sans: "'EOS Sans'", sansBold: "'EOS Sans Bold'",
  light: "'EOS Light'", body: "'EOS Body'", display: "'EOS Display'", condensed: "'EOS Condensed'", serifRegular: "'EOS Serif Regular'", medium: "'EOS Medium'", scriptCasual: "'EOS Script Casual'", scriptFormal: "'EOS Script Formal'",
};
/** The preview: an SVG string using the same fonts as the PDF (loaded from /fonts/cert). */
export function toSvg(items: Item[], src: { logo?: string | null; signature?: string | null; qr?: string | null; background?: string | null; photo?: string | null; art?: string | null }) {
  const out: string[] = [];
  for (const it of items) {
    if (it.t === "rect") out.push(`<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" fill="${it.fill ?? "none"}"${it.opacity != null ? ` fill-opacity="${it.opacity}"` : ""}${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw ?? 1}"` : ""}/>`);
    else if (it.t === "line") out.push(`<line x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="${it.stroke}" stroke-width="${it.sw}"/>`);
    else if (it.t === "circle") out.push(`<circle cx="${it.cx}" cy="${it.cy}" r="${it.r}" fill="${it.fill ?? "none"}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw ?? 1}"` : ""}/>`);
    else if (it.t === "text") out.push(`<text x="${it.x}" y="${it.y}" font-family="${FAMILY[it.font]}" font-size="${it.size}" fill="${it.color}" text-anchor="${it.align === "center" ? "middle" : it.align === "right" ? "end" : "start"}"${it.spacing ? ` letter-spacing="${it.spacing}"` : ""}${it.rotate ? ` transform="rotate(${it.rotate.toFixed(2)} ${it.x.toFixed(2)} ${it.y.toFixed(2)})"` : ""}>${esc(it.text)}</text>`);
    else if (it.t === "path") out.push(`<path d="${it.d}" fill="${it.fill}"${it.opacity != null ? ` fill-opacity="${it.opacity}"` : ""}/>`);
    else if (it.t === "image") {
      const href = src[it.src];
      if (href) out.push(`<image x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" href="${esc(href)}" preserveAspectRatio="${it.fit === "fill" ? "none" : it.fit === "cover" ? "xMidYMid slice" : it.align === "right" ? "xMaxYMid meet" : "xMidYMid meet"}"${it.opacity != null ? ` opacity="${it.opacity}"` : ""}/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">${out.join("")}</svg>`;
}

export const CERT_FONT_CSS = `
@font-face{font-family:'EOS Script';src:url(/fonts/cert/GreatVibes.ttf)}
@font-face{font-family:'EOS Serif';src:url(/fonts/cert/PlayfairDisplay-Bold.ttf)}
@font-face{font-family:'EOS Serif Italic';src:url(/fonts/cert/PlayfairDisplay-Italic.ttf)}
@font-face{font-family:'EOS Sans';src:url(/fonts/cert/Lato-Regular.ttf)}
@font-face{font-family:'EOS Sans Bold';src:url(/fonts/cert/Lato-Bold.ttf)}
@font-face{font-family:'EOS Light';src:url(/fonts/cert/Barlow-Light.ttf)}
@font-face{font-family:'EOS Body';src:url(/fonts/cert/Barlow-Regular.ttf)}
@font-face{font-family:'EOS Display';src:url(/fonts/cert/Barlow-SemiBold.ttf)}
@font-face{font-family:'EOS Condensed';src:url(/fonts/cert/BarlowCondensed-Bold.ttf)}
@font-face{font-family:'EOS Serif Regular';src:url(/fonts/cert/PlayfairDisplay-Variable.ttf);font-weight:400}
@font-face{font-family:'EOS Medium';src:url(/fonts/cert/Barlow-Medium.ttf)}
@font-face{font-family:'EOS Script Casual';src:url(/fonts/cert/Allison-Regular.ttf)}
@font-face{font-family:'EOS Script Formal';src:url(/fonts/cert/PinyonScript-Regular.ttf)}`;
