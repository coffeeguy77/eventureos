/**
 * Course certificates — the design (saved per business) and one layout used by both the on-screen preview (SVG)
 * and the PDF, so what you design is exactly what people download. Pure: no server or browser imports.
 * A4 landscape in PDF points (842 × 595); origin top-left.
 */

export type CertStyle = "classic" | "modern" | "minimal";
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
  signature: string | null; // PNG data URL drawn in the builder
  showLogo: boolean;
  showQr: boolean;
  showNumber: boolean;
  showSeal: boolean;
  sealText: string;        // words around the seal
}

export const DEFAULT_DESIGN: CertDesign = {
  style: "classic", accent: "#9A7B4F", paper: "#FFFDF7",
  title: "Certificate of Completion", subtitle: "This certifies that",
  body: "has successfully completed the {course} on {date}.", footer: "",
  signerName: "", signerTitle: "Trainer", signature: null,
  showLogo: true, showQr: true, showNumber: true, showSeal: true, sealText: "Completed",
};

const HEX = /^#[0-9a-f]{6}$/i;
const s = (v: unknown, d: string, max: number) => (typeof v === "string" ? v.slice(0, max) : d);
export function readDesign(raw: unknown): CertDesign {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sig = typeof o.signature === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(o.signature) && o.signature.length < 400_000 ? o.signature : null;
  return {
    style: o.style === "modern" || o.style === "minimal" ? o.style : "classic",
    accent: typeof o.accent === "string" && HEX.test(o.accent) ? o.accent : DEFAULT_DESIGN.accent,
    paper: typeof o.paper === "string" && HEX.test(o.paper) ? o.paper : DEFAULT_DESIGN.paper,
    title: s(o.title, DEFAULT_DESIGN.title, 80) || DEFAULT_DESIGN.title,
    subtitle: s(o.subtitle, DEFAULT_DESIGN.subtitle, 80),
    body: s(o.body, DEFAULT_DESIGN.body, 300),
    footer: s(o.footer, "", 160),
    signerName: s(o.signerName, "", 80), signerTitle: s(o.signerTitle, DEFAULT_DESIGN.signerTitle, 80),
    signature: sig,
    showLogo: o.showLogo !== false, showQr: o.showQr !== false, showNumber: o.showNumber !== false, showSeal: o.showSeal !== false,
    sealText: s(o.sealText, DEFAULT_DESIGN.sealText, 24),
  };
}

export interface CertData { name: string; course: string; date: string; hours: string | null; number: string; business: string; verifyUrl: string }

export function fill(text: string, d: CertData) {
  return text.replace(/\{(name|course|date|hours|business|number)\}/g, (_, k: keyof CertData) => (k === "hours" ? d.hours ?? "" : d[k]) ?? "");
}

export type Font = "script" | "serif" | "serifItalic" | "sans" | "sansBold";
export type Item =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; opacity?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: "text"; x: number; y: number; text: string; font: Font; size: number; color: string; align: "left" | "center" | "right"; spacing?: number }
  | { t: "image"; x: number; y: number; w: number; h: number; src: "logo" | "signature" | "qr" };

export const W = 842, H = 595;
// Average glyph width as a share of the font size — used to wrap and shrink text the same way in the preview and the PDF
const AVG: Record<Font, number> = { script: 0.42, serif: 0.56, serifItalic: 0.5, sans: 0.5, sansBold: 0.54 };
export const approxWidth = (text: string, font: Font, size: number, spacing = 0) => text.length * (AVG[font] * size + spacing);

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

function fit(text: string, font: Font, size: number, maxWidth: number, min = size * 0.55) {
  let z = size;
  while (z > min && approxWidth(text, font, z) > maxWidth) z -= 1;
  return z;
}

/** Lighter version of a hex colour (for the seal ring and frame). */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function layout(d: CertDesign, data: CertData, has: { logo: boolean }): Item[] {
  const ink = "#1F1A17", muted = "#5B544E", items: Item[] = [];
  const A = d.accent;
  items.push({ t: "rect", x: 0, y: 0, w: W, h: H, fill: d.paper });
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
    items.push({ t: "text", x: cx, y: sy + 4, text: d.sealText.toUpperCase(), font: "sansBold", size: fit(d.sealText.toUpperCase(), "sansBold", 9, 54, 6), color: "#FFFFFF", align: "center", spacing: 1.2 });
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

/** "Saturday 10 October 2026" style date, as printed on the certificate. */
export const certDate = (iso: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso.slice(0, 10) + "T00:00:00Z"));
export const hoursLabel = (minutes: number | null | undefined) => (minutes ? `${Math.round((minutes / 60) * 10) / 10} hour${minutes === 60 ? "" : "s"}` : null);

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const FAMILY: Record<Font, string> = {
  script: "'EOS Script'", serif: "'EOS Serif'", serifItalic: "'EOS Serif Italic'", sans: "'EOS Sans'", sansBold: "'EOS Sans Bold'",
};
/** The preview: an SVG string using the same fonts as the PDF (loaded from /fonts/cert). */
export function toSvg(items: Item[], src: { logo?: string | null; signature?: string | null; qr?: string | null }) {
  const out: string[] = [];
  for (const it of items) {
    if (it.t === "rect") out.push(`<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" fill="${it.fill ?? "none"}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw ?? 1}"` : ""}/>`);
    else if (it.t === "line") out.push(`<line x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="${it.stroke}" stroke-width="${it.sw}"/>`);
    else if (it.t === "circle") out.push(`<circle cx="${it.cx}" cy="${it.cy}" r="${it.r}" fill="${it.fill ?? "none"}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw ?? 1}"` : ""}/>`);
    else if (it.t === "text") out.push(`<text x="${it.x}" y="${it.y}" font-family="${FAMILY[it.font]}" font-size="${it.size}" fill="${it.color}" text-anchor="${it.align === "center" ? "middle" : it.align === "right" ? "end" : "start"}"${it.spacing ? ` letter-spacing="${it.spacing}"` : ""}>${esc(it.text)}</text>`);
    else if (it.t === "image") { const href = src[it.src]; if (href) out.push(`<image x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" href="${esc(href)}" preserveAspectRatio="xMidYMid meet"/>`); }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">${out.join("")}</svg>`;
}

export const CERT_FONT_CSS = `
@font-face{font-family:'EOS Script';src:url(/fonts/cert/GreatVibes.ttf)}
@font-face{font-family:'EOS Serif';src:url(/fonts/cert/PlayfairDisplay-Bold.ttf)}
@font-face{font-family:'EOS Serif Italic';src:url(/fonts/cert/PlayfairDisplay-Italic.ttf)}
@font-face{font-family:'EOS Sans';src:url(/fonts/cert/Lato-Regular.ttf)}
@font-face{font-family:'EOS Sans Bold';src:url(/fonts/cert/Lato-Bold.ttf)}`;
