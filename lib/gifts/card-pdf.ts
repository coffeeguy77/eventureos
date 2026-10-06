import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * A gift certificate as a two-page PDF for double-sided printing.
 *
 * Page 1 is the front artwork, page 2 the back (who it's for, the message, who it's from, value and code).
 * Both pages are A4 landscape with the card in exactly the same place, centred, so the back lands behind the front
 * whichever way the printer turns the paper. The artwork runs 3 mm past the cut line (bleed) so a printer that's a
 * millimetre or two out still cuts cleanly, and corner marks show where to cut.
 *
 * The card is the same shape as the on-screen card (1489 × 1056), and the back follows the on-screen layout.
 */

export const MM = 72 / 25.4;
export const PAGE_W = 297 * MM, PAGE_H = 210 * MM;
export const CARD_W = 240 * MM, CARD_H = CARD_W * (1056 / 1489);
export const BLEED = 3 * MM;
export const CARD_X = (PAGE_W - CARD_W) / 2, CARD_Y = (PAGE_H - CARD_H) / 2;

export interface GiftPdfBack {
  to: string | null; from: string | null; message: string | null;
  value: string; valueNote?: string | null; code?: string | null; expires?: string | null;
  business: string; redeem?: string | null;
}
export interface GiftPdfFonts { script: Uint8Array; serifBold: Uint8Array; serifItalic: Uint8Array; sans: Uint8Array; sansMedium: Uint8Array; sansSemi: Uint8Array }

const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
/** The wash over the back: paper colour, 25% → 92% (at 38%) → 97% opacity, left to right. */
const WASH = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAQAAAAABCAYAAAAxWXB3AAAAK0lEQVR42mP8/umVAwMDAxMDAwMjlGaiEn+wmDFU3EUKYBxk6oeLHSPO3wCGuQPMcDvbYAAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const INK = hex("#1d1916"), MUTED = hex("#6d655e"), BODY = hex("#2c2622"), PAPER = hex("#F7F2EA");

async function embedImage(doc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 8) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
  } catch { /* unsupported image — leave it out */ }
  return null;
}

/** Split text into lines that fit `max` points wide (keeps the customer's own line breaks). */
export function wrap(font: PDFFont, text: string, size: number, max: number) {
  const out: string[] = [];
  for (const para of text.replace(/\r/g, "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= max) { line = next; continue; }
      if (line) out.push(line);
      // A single word longer than the line: break it
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > max && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > max) n--;
        out.push(rest.slice(0, n)); rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

/** Shrink a single line until it fits. */
function fit(font: PDFFont, text: string, size: number, max: number, min: number) {
  let s = size;
  while (s > min && font.widthOfTextAtSize(text, s) > max) s -= 0.5;
  return s;
}

function spaced(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, spacing: number, color: ReturnType<typeof rgb>, align: "left" | "right" = "left") {
  const width = [...text].reduce((a, ch) => a + font.widthOfTextAtSize(ch, size), 0) + spacing * Math.max(0, text.length - 1);
  let at = align === "right" ? x - width : x;
  for (const ch of text) { page.drawText(ch, { x: at, y, size, font, color }); at += font.widthOfTextAtSize(ch, size) + spacing; }
}

/** Corner marks just outside the bleed, lined up with the cut lines. */
function cropMarks(page: PDFPage) {
  const gap = BLEED + 1 * MM, len = 7 * MM, t = 0.4, c = rgb(0.35, 0.35, 0.35);
  const L = CARD_X, R = CARD_X + CARD_W, B = CARD_Y, T = CARD_Y + CARD_H;
  for (const [x, y, dx, dy] of [[L, T, -1, 1], [R, T, 1, 1], [L, B, -1, -1], [R, B, 1, -1]] as const) {
    page.drawLine({ start: { x: x + dx * gap, y }, end: { x: x + dx * (gap + len), y }, thickness: t, color: c });
    page.drawLine({ start: { x, y: y + dy * gap }, end: { x, y: y + dy * (gap + len) }, thickness: t, color: c });
  }
}

/** Draw an image so it covers a box (cropping the overflow), optionally mirrored left-to-right. */
function cover(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number, opts: { mirror?: boolean; opacity?: number } = {}) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s, ih = img.height * s;
  const ix = x + (w - iw) / 2, iy = y + (h - ih) / 2;
  page.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath());
  // pdf-lib draws with translate + scale, so a negative width from the right-hand edge mirrors the picture
  if (opts.mirror) page.drawImage(img, { x: ix + iw, y: iy, width: -iw, height: ih, opacity: opts.opacity ?? 1 });
  else page.drawImage(img, { x: ix, y: iy, width: iw, height: ih, opacity: opts.opacity ?? 1 });
  page.pushOperators(popGraphicsState());
}

export async function giftCardPdf(o: { art: Uint8Array | null; backArt?: Uint8Array | null; back: GiftPdfBack; fonts: GiftPdfFonts; title: string; instructions?: boolean }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(o.title);
  doc.setAuthor(o.back.business);
  doc.setSubject("Gift certificate — print double-sided");
  const f = {
    script: await doc.embedFont(o.fonts.script, { subset: false }), // subsetting breaks the script's joined letters
    serifBold: await doc.embedFont(o.fonts.serifBold, { subset: true }),
    italic: await doc.embedFont(o.fonts.serifItalic, { subset: true }),
    sans: await doc.embedFont(o.fonts.sans, { subset: true }),
    medium: await doc.embedFont(o.fonts.sansMedium, { subset: true }),
    semi: await doc.embedFont(o.fonts.sansSemi, { subset: true }),
  };
  const art = await embedImage(doc, o.art);
  const backArt = await embedImage(doc, o.backArt ?? null);
  const bx = CARD_X - BLEED, by = CARD_Y - BLEED, bw = CARD_W + 2 * BLEED, bh = CARD_H + 2 * BLEED;

  /* ---------------- front ---------------- */
  const front = doc.addPage([PAGE_W, PAGE_H]);
  front.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: PAPER });
  if (art) cover(front, art, bx, by, bw, bh);
  cropMarks(front);
  if (o.instructions !== false) {
    const note = "Print at actual size (100%), double-sided, flip on short edge. Cut along the corner marks.";
    const s = 7.5;
    front.drawText(note, { x: (PAGE_W - f.sans.widthOfTextAtSize(note, s)) / 2, y: CARD_Y - BLEED - 8.5 * MM, size: s, font: f.sans, color: rgb(0.45, 0.45, 0.45) });
  }

  /* ---------------- back ---------------- */
  const back = doc.addPage([PAGE_W, PAGE_H]);
  back.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: PAPER });
  // Faint artwork behind the writing, mirrored so the leaves sit on the left. Use artwork without words —
  // the front's wording would show through backwards.
  if (backArt) cover(back, backArt, bx, by, bw, bh, { mirror: true, opacity: 0.55 });
  // Wash from left (faint) to right (nearly solid) so the writing is easy to read — same as the on-screen card.
  // A 256 × 1 picture stretched across the card: smooth, no banding, works in every viewer.
  back.drawImage(await doc.embedPng(WASH), { x: bx, y: by, width: bw, height: bh });
  cropMarks(back);

  // Layout: on-screen sizes are in card-width units (cqw); 1 cqw = CARD_W / 100
  const q = CARD_W / 100;
  const left = CARD_X + 0.36 * CARD_W, right = CARD_X + 0.94 * CARD_W, width = right - left;
  const top = CARD_Y + CARD_H - 0.08 * CARD_H, bottom = CARD_Y + 0.08 * CARD_H;
  const b = o.back;
  const rule = (y: number) => back.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: INK, opacity: 0.15 });

  // Top: "TO" + their name
  let y = top - 1.9 * q;
  spaced(back, f.medium, "TO", left, y, 1.9 * q, 0.3 * 1.9 * q, MUTED);
  const toSize = b.to ? fit(f.script, b.to, 6.4 * q, width, 3.4 * q) : 6.4 * q;
  y -= 0.35 * q + toSize * 0.92;
  if (b.to) back.drawText(b.to, { x: left, y, size: toSize, font: f.script, color: INK });
  y -= toSize * 0.3 + 2.2 * q;
  rule(y);
  const messageTop = y - 2.8 * q;

  // Bottom up: how to use it, value + code, then "FROM"
  let yb = bottom;
  if (b.redeem) {
    const lines = wrap(f.sans, b.redeem, 1.6 * q, width).slice(0, 2);
    for (const l of lines.reverse()) { back.drawText(l, { x: left, y: yb, size: 1.6 * q, font: f.sans, color: MUTED }); yb += 1.6 * q * 1.35; }
    yb += 1.2 * q - 1.6 * q * 0.35;
  }
  const meta = [b.expires ? `Valid until ${b.expires}` : null, b.business].filter(Boolean).join(" · ");
  const metaSize = 1.65 * q;
  if (meta) { const w = f.sans.widthOfTextAtSize(meta, metaSize); back.drawText(meta, { x: right - w, y: yb, size: metaSize, font: f.sans, color: MUTED }); }
  if (b.code) spaced(back, f.semi, b.code, right, yb + metaSize * 1.45, 2.5 * q, 0.14 * 2.5 * q, INK, "right");
  let vy = yb;
  if (b.valueNote) { back.drawText(b.valueNote, { x: left, y: vy, size: 1.75 * q, font: f.sans, color: MUTED }); vy += 1.75 * q + 0.8 * q; }
  const codeW = b.code ? [...b.code].reduce((a, ch) => a + f.semi.widthOfTextAtSize(ch, 2.5 * q), 0) + 0.35 * q * b.code.length : 0;
  const valueSize = fit(f.serifBold, b.value, 4.4 * q, width - codeW - 2 * q, 2.6 * q);
  back.drawText(b.value, { x: left, y: vy, size: valueSize, font: f.serifBold, color: INK });
  const rowTop = Math.max(vy + valueSize * 0.8, yb + metaSize * 1.45 + 2.5 * q) + 2.2 * q;
  rule(rowTop);
  let fy = rowTop + 2.4 * q;
  const fromSize = b.from ? fit(f.script, b.from, 5 * q, width, 3 * q) : 5 * q;
  if (b.from) back.drawText(b.from, { x: left, y: fy + fromSize * 0.22, size: fromSize, font: f.script, color: INK });
  fy += fromSize * 1.05;
  spaced(back, f.medium, "FROM", left, fy, 1.9 * q, 0.3 * 1.9 * q, MUTED);
  const messageBottom = fy + 1.9 * q + 1.6 * q;

  // Middle: the message, as large as fits
  if (b.message?.trim()) {
    const room = messageTop - messageBottom;
    let size = (b.message.length > 140 ? 2.55 : 3.05) * q, lines = wrap(f.italic, b.message.trim(), size, width);
    while (size > 1.6 * q && lines.length * size * 1.45 > room) { size -= 0.25; lines = wrap(f.italic, b.message.trim(), size, width); }
    let my = messageTop - size;
    for (const l of lines) { if (my < messageBottom) break; back.drawText(l, { x: left, y: my, size, font: f.italic, color: BODY }); my -= size * 1.45; }
  }
  return doc.save();
}
