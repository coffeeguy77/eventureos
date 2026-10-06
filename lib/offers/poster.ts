import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";

/**
 * A printable A4 poster for an offer: big discount, the code, and a QR code that opens the right page with the code
 * already applied. For the café counter, the coffee cart, a class handout or a shop window.
 */

const W = 595.28, H = 841.89, M = 44;
const hex = (h: string) => { const n = parseInt(h.replace("#", "").padEnd(6, "0").slice(0, 6), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const INK = hex("#1A1614"), MUTED = hex("#6B625C"), CREAM = hex("#FFF8F4");

export interface PosterFonts { display: Uint8Array; sans: Uint8Array; sansSemi: Uint8Array; script: Uint8Array }
export interface PosterInput {
  business: string; brand: string;              // brand colour, #RRGGBB
  big: string;                                   // "15% OFF"
  where: string;                                 // "barista classes & gift certificates"
  headline: string | null; description: string | null;
  code: string; url: string; shortUrl: string;
  ends: string | null;                           // "31 October 2026"
  terms: string[];                               // "One use per customer", …
  contact: string | null;                        // phone · email
}

/** White or near-black text, whichever reads better on the brand colour. */
function onBrand(h: string) {
  const n = parseInt(h.replace("#", "").slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (L + 0.05)) >= 2.6 ? rgb(1, 1, 1) : INK;
}

function centred(page: PDFPage, font: PDFFont, text: string, y: number, size: number, color = INK, spacing = 0) {
  const w = [...text].reduce((a, ch) => a + font.widthOfTextAtSize(ch, size), 0) + spacing * Math.max(0, text.length - 1);
  let x = (W - w) / 2;
  if (!spacing) { page.drawText(text, { x, y, size, font, color }); return; }
  for (const ch of text) { page.drawText(ch, { x, y, size, font, color }); x += font.widthOfTextAtSize(ch, size) + spacing; }
}
const fit = (font: PDFFont, text: string, size: number, max: number, min = 10) => { let s = size; while (s > min && font.widthOfTextAtSize(text, s) > max) s -= 1; return s; };
function wrap(font: PDFFont, text: string, size: number, max: number) {
  const out: string[] = []; let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) { const n = line ? `${line} ${w}` : w; if (font.widthOfTextAtSize(n, size) <= max) line = n; else { if (line) out.push(line); line = w; } }
  if (line) out.push(line);
  return out;
}

export async function offerPoster(p: PosterInput, fonts: PosterFonts) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${p.business} — ${p.code}`);
  doc.setAuthor(p.business);
  const f = {
    display: await doc.embedFont(fonts.display, { subset: true }),
    sans: await doc.embedFont(fonts.sans, { subset: true }),
    semi: await doc.embedFont(fonts.sansSemi, { subset: true }),
    script: await doc.embedFont(fonts.script, { subset: false }),
  };
  const brand = hex(p.brand), on = onBrand(p.brand);
  const page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });

  // Top: the brand panel with the big number
  const panelH = 330;
  page.drawRectangle({ x: 0, y: H - panelH, width: W, height: panelH, color: brand });
  // soft circles for depth
  page.drawCircle({ x: W - 40, y: H - 40, size: 150, color: rgb(1, 1, 1), opacity: 0.08 });
  page.drawCircle({ x: 30, y: H - panelH + 20, size: 110, color: rgb(1, 1, 1), opacity: 0.07 });
  centred(page, f.semi, p.business.toUpperCase(), H - 70, 13, on, 3.2);
  const bigSize = fit(f.display, p.big, 112, W - 2 * M, 48);
  centred(page, f.display, p.big, H - 70 - 26 - bigSize * 0.78, bigSize, on);
  const whereSize = fit(f.sans, p.where, 22, W - 2 * M, 12);
  centred(page, f.sans, p.where, H - panelH + 52, whereSize, on);

  // Headline + description
  let y = H - panelH - 66;
  if (p.headline) {
    const s = fit(f.script, p.headline, 44, W - 2 * M, 22);
    centred(page, f.script, p.headline, y, s, INK);
    y -= 34;
  } else y -= 6;
  if (p.description) {
    for (const l of wrap(f.sans, p.description, 14, W - 2 * M - 40).slice(0, 3)) { centred(page, f.sans, l, y, 14, MUTED); y -= 20; }
  }

  // Code box (left) + QR (right)
  const boxY = 170, boxH = 210;
  const qrSize = 168;
  const leftW = W - 2 * M - qrSize - 28;
  page.drawRectangle({ x: M, y: boxY, width: W - 2 * M, height: boxH, color: rgb(1, 1, 1), borderColor: hex("#EADDD5"), borderWidth: 1 });
  // dashed code box
  const cx = M + 22, cw = leftW - 22, cy = boxY + 70, ch = 74;
  page.drawRectangle({ x: cx, y: cy, width: cw, height: ch, borderColor: brand, borderWidth: 2, borderDashArray: [7, 5], color: hex("#FFF4F6") });
  page.drawText("USE CODE", { x: cx, y: cy + ch + 16, size: 11, font: f.semi, color: MUTED });
  const codeSize = fit(f.semi, p.code, 38, cw - 24, 16);
  const codeW = [...p.code].reduce((a, c) => a + f.semi.widthOfTextAtSize(c, codeSize), 0) + 2.5 * (p.code.length - 1);
  let x = cx + (cw - codeW) / 2;
  for (const c of p.code) { page.drawText(c, { x, y: cy + (ch - codeSize * 0.7) / 2, size: codeSize, font: f.semi, color: INK }); x += f.semi.widthOfTextAtSize(c, codeSize) + 2.5; }
  page.drawText(p.ends ? `Ends ${p.ends}` : "While it lasts", { x: cx, y: cy - 26, size: 12, font: f.semi, color: brand });
  const urlSize = fit(f.sans, p.shortUrl, 10.5, cw, 7);
  page.drawText(p.shortUrl, { x: cx, y: cy - 44, size: urlSize, font: f.sans, color: MUTED });

  const qr = await doc.embedPng(await QRCode.toBuffer(p.url, { margin: 1, width: 600, errorCorrectionLevel: "M", color: { dark: "#1A1614", light: "#FFFFFF" } }));
  const qx = W - M - 22 - qrSize, qy = boxY + 30;
  page.drawImage(qr, { x: qx, y: qy, width: qrSize, height: qrSize });
  const scan = "Scan to claim";
  page.drawText(scan, { x: qx + (qrSize - f.semi.widthOfTextAtSize(scan, 12)) / 2, y: qy - 18, size: 12, font: f.semi, color: INK });

  // Fine print
  let ty = 132;
  if (p.terms.length) {
    for (const l of wrap(f.sans, p.terms.join(" · "), 10, W - 2 * M).slice(0, 3)) { centred(page, f.sans, l, ty, 10, MUTED); ty -= 14; }
  }
  // Footer
  page.drawLine({ start: { x: M, y: 70 }, end: { x: W - M, y: 70 }, thickness: 0.6, color: hex("#E6D9D0") });
  centred(page, f.semi, p.business, 48, 12, INK);
  if (p.contact) centred(page, f.sans, p.contact, 32, 10, MUTED);
  return doc.save();
}
