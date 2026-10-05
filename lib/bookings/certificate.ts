/**
 * Course certificates — the design (saved per business) and one layout used by both the on-screen preview (SVG)
 * and the PDF, so what you design is exactly what people download. Pure: no server or browser imports.
 * A4 landscape in PDF points (842 × 595); origin top-left.
 */

export type CertStyle = "swoosh" | "classic" | "modern" | "minimal";
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
  sealText: string;        // words around the seal
}

export const DEFAULT_DESIGN: CertDesign = {
  style: "swoosh", accent: "#E8508A", paper: "#EDEDEF",
  title: "Certificate of Achievement", subtitle: "This certificate is proudly presented to",
  body: "Has successfully completed the {course} at {business}.", footer: "",
  signerName: "", signerTitle: "", signature: null, background: null,
  showLogo: true, showQr: true, showNumber: true, showSeal: true, sealText: "Completed",
};

const HEX = /^#[0-9a-f]{6}$/i;
const s = (v: unknown, d: string, max: number) => (typeof v === "string" ? v.slice(0, max) : d);
export function readDesign(raw: unknown): CertDesign {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sig = typeof o.signature === "string" && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(o.signature) && o.signature.length < 600_000 ? o.signature : null;
  const bg = typeof o.background === "string" && /^https:\/\/[^\s"'<>]+$/.test(o.background) && o.background.length < 600 ? o.background : null;
  return {
    style: o.style === "modern" || o.style === "minimal" || o.style === "classic" ? o.style : "swoosh",
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
  };
}

export interface CertData { name: string; course: string; date: string; hours: string | null; number: string; business: string; verifyUrl: string }

export function fill(text: string, d: CertData) {
  return text.replace(/\{(name|course|date|hours|business|number)\}/g, (_, k: keyof CertData) => (k === "hours" ? d.hours ?? "" : d[k]) ?? "");
}

export type Font = "script" | "serif" | "serifItalic" | "sans" | "sansBold" | "light" | "body" | "display";
export type Item =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; opacity?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: "text"; x: number; y: number; text: string; font: Font; size: number; color: string; align: "left" | "center" | "right"; spacing?: number }
  | { t: "image"; x: number; y: number; w: number; h: number; src: "logo" | "signature" | "qr" | "background"; fit?: "contain" | "cover"; align?: "center" | "right" }
  | { t: "path"; d: string; fill: string; opacity?: number };

export const W = 842, H = 595;
// Average glyph width as a share of the font size — used to wrap and shrink text the same way in the preview and the PDF
const AVG: Record<Font, number> = { script: 0.42, serif: 0.56, serifItalic: 0.5, sans: 0.5, sansBold: 0.54, light: 0.47, body: 0.48, display: 0.52 };
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
  if (d.style === "swoosh") return swoosh(d, data, has, items);
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

/** Scalloped rosette with two ribbon tails (the "award" badge). */
function rosette(cx: number, cy: number, r: number, color: string, items: Item[]) {
  const dark = shade(color, 0.18);
  // Ribbons first (behind)
  items.push({ t: "path", d: `M${cx - r * 0.55},${cy + r * 0.3} L${cx - r * 0.95},${cy + r * 1.75} L${cx - r * 0.55},${cy + r * 1.5} L${cx - r * 0.3},${cy + r * 1.85} L${cx - r * 0.05},${cy + r * 0.55} Z`, fill: dark });
  items.push({ t: "path", d: `M${cx + r * 0.55},${cy + r * 0.3} L${cx + r * 0.95},${cy + r * 1.75} L${cx + r * 0.55},${cy + r * 1.5} L${cx + r * 0.3},${cy + r * 1.85} L${cx + r * 0.05},${cy + r * 0.55} Z`, fill: dark });
  const n = 22, pts: string[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2, rr = i % 2 ? r * 0.88 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  items.push({ t: "path", d: `M${pts.join(" L")} Z`, fill: color });
  items.push({ t: "circle", cx, cy, r: r * 0.7, stroke: "#FFFFFF", sw: 1.2 });
  items.push({ t: "circle", cx, cy, r: r * 0.62, fill: tint(color, 0.15) });
}

/**
 * "Swoosh": flowing layered curves down the left in tints of the brand colour, logo top-right, right-aligned type,
 * rosette and signature along the bottom. Your own artwork (background) replaces the curves.
 */
function swoosh(d: CertDesign, data: CertData, has: { logo: boolean }, items: Item[]): Item[] {
  const A = d.accent, ink = "#1D1D1F", muted = "#55555C";
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
  const R = W - 52; // right edge of the text column
  let y = 34;
  if (d.showLogo && has.logo) { items.push({ t: "image", x: R - 250, y, w: 250, h: 190, src: "logo", fit: "contain", align: "right" }); y += 212; }
  else { items.push({ t: "text", x: R, y: y + 40, text: data.business.toUpperCase(), font: "display", size: 30, color: ink, align: "right", spacing: 2 }); y += 90; }
  y = Math.max(y, 250);
  const title = d.title.toUpperCase();
  items.push({ t: "text", x: R, y: y + 18, text: title, font: "display", size: fit(title, "display", 21, 400, 13), color: ink, align: "right" });
  y += 40;
  if (d.subtitle) { items.push({ t: "text", x: R, y, text: fill(d.subtitle, data), font: "body", size: 11.5, color: muted, align: "right" }); y += 36; }
  const nSize = fit(data.name, "light", 32, 380, 20);
  items.push({ t: "text", x: R, y: y + 10, text: data.name, font: "light", size: nSize, color: A, align: "right" });
  y += 54;
  for (const line of wrap(fill(d.body, data), "body", 10.5, 330, 7)) { items.push({ t: "text", x: R, y, text: line, font: "body", size: 10.5, color: ink, align: "right" }); y += 15; }

  const by = H - 76;
  items.push({ t: "text", x: 578, y: by - 8, text: data.date, font: "body", size: 12, color: ink, align: "center" });
  items.push({ t: "line", x1: 520, y1: by, x2: 636, y2: by, stroke: "#8E8E95", sw: 0.6 });
  items.push({ t: "text", x: 578, y: by + 11, text: "Date of completion", font: "body", size: 7.5, color: "#8E8E95", align: "center" });
  if (d.showSeal) {
    rosette(690, by - 22, 26, A, items);
    items.push({ t: "text", x: 690, y: by - 19, text: d.sealText.toUpperCase(), font: "display", size: fit(d.sealText.toUpperCase(), "display", 7.5, 34, 5), color: "#FFFFFF", align: "center", spacing: 0.6 });
  }
  if (d.signature) items.push({ t: "image", x: R - 150, y: by - 62, w: 150, h: 54, src: "signature", fit: "contain", align: "right" });
  if (d.signerName || d.signerTitle) {
    items.push({ t: "line", x1: R - 140, y1: by, x2: R, y2: by, stroke: "#8E8E95", sw: 0.6 });
    if (d.signerName) items.push({ t: "text", x: R - 70, y: by + 11, text: d.signerName, font: "display", size: 8.5, color: ink, align: "center" });
    if (d.signerTitle) items.push({ t: "text", x: R - 70, y: by + 21, text: d.signerTitle, font: "body", size: 7.5, color: "#8E8E95", align: "center" });
  }
  const foot = [d.footer ? fill(d.footer, data) : null, d.showNumber ? `Certificate ${data.number}` : null].filter(Boolean).join("  ·  ");
  if (foot) items.push({ t: "text", x: R, y: H - 22, text: foot, font: "body", size: 7.5, color: muted, align: "right" });
  if (d.showQr) {
    items.push({ t: "image", x: 452, y: by - 34, w: 44, h: 44, src: "qr" });
    items.push({ t: "text", x: 474, y: by + 20, text: "Scan to verify", font: "body", size: 6, color: "#8E8E95", align: "center" });
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
  light: "'EOS Light'", body: "'EOS Body'", display: "'EOS Display'",
};
/** The preview: an SVG string using the same fonts as the PDF (loaded from /fonts/cert). */
export function toSvg(items: Item[], src: { logo?: string | null; signature?: string | null; qr?: string | null; background?: string | null }) {
  const out: string[] = [];
  for (const it of items) {
    if (it.t === "rect") out.push(`<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" fill="${it.fill ?? "none"}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw ?? 1}"` : ""}/>`);
    else if (it.t === "line") out.push(`<line x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="${it.stroke}" stroke-width="${it.sw}"/>`);
    else if (it.t === "circle") out.push(`<circle cx="${it.cx}" cy="${it.cy}" r="${it.r}" fill="${it.fill ?? "none"}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw ?? 1}"` : ""}/>`);
    else if (it.t === "text") out.push(`<text x="${it.x}" y="${it.y}" font-family="${FAMILY[it.font]}" font-size="${it.size}" fill="${it.color}" text-anchor="${it.align === "center" ? "middle" : it.align === "right" ? "end" : "start"}"${it.spacing ? ` letter-spacing="${it.spacing}"` : ""}>${esc(it.text)}</text>`);
    else if (it.t === "path") out.push(`<path d="${it.d}" fill="${it.fill}"${it.opacity != null ? ` fill-opacity="${it.opacity}"` : ""}/>`);
    else if (it.t === "image") {
      const href = src[it.src];
      if (href) out.push(`<image x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" href="${esc(href)}" preserveAspectRatio="${it.fit === "cover" ? "xMidYMid slice" : it.align === "right" ? "xMaxYMid meet" : "xMidYMid meet"}"/>`);
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
@font-face{font-family:'EOS Display';src:url(/fonts/cert/Barlow-SemiBold.ttf)}`;
