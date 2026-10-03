import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { QuoteSnapshotData } from "@/components/quotes/types";
import { qtyUnit } from "@/lib/quotes/units";
import { billToLines, type BillTo } from "@/lib/customers/bill-to";

/**
 * A printable PDF of a published quote version — attached to quote emails.
 * Pure (no server imports) so it can be tested with `npx tsx`.
 * Uses the PDF standard fonts, so text is limited to the Western European character set;
 * anything else is swapped for a close equivalent or "?".
 */

export interface QuotePdfInput {
  snap: QuoteSnapshotData;
  orgName: string;
  quoteNumber: number;
  versionNumber?: number | null;
  customerName?: string | null;
  /** The client's details — printed as "Prepared for" */
  billTo?: BillTo | null;
  eventLabel?: string | null;
  /** The event's date (YYYY-MM-DD); null shows "TBC", undefined leaves the row out. */
  eventDate?: string | null;
  currency?: string;
  brand?: string | null;
  /** PNG or JPEG bytes. Other formats are skipped. */
  logo?: Uint8Array | null;
  /** The customer's personal link to view and accept online. */
  acceptUrl?: string | null;
}

const A4: [number, number] = [595.28, 841.89];
const M = 48; // margin
const INK = rgb(0.09, 0.09, 0.11), MUTED = rgb(0.42, 0.42, 0.46), FAINT = rgb(0.6, 0.6, 0.64), LINE = rgb(0.89, 0.89, 0.91), GREEN = rgb(0.02, 0.47, 0.34);

function hexColour(hex: string | null | undefined): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return rgb(0.38, 0.16, 0.93);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const SWAP: Record<string, string> = { "−": "-", "‐": "-", "‑": "-", " ": " ", " ": " ", " ": " ", "→": "->", "✓": "v", "×": "x" };

export function quotePdfMoney(n: number | null | undefined, currency = "AUD") {
  const v = Number(n ?? 0);
  const s = new Intl.NumberFormat("en-AU", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v));
  return (v < 0 ? "-" : "") + s.replace(/^A\$/, "$");
}

const fmtDay = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};


export async function buildQuotePdf(input: QuotePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Quote Q-${input.quoteNumber} - ${input.orgName}`);
  doc.setAuthor(input.orgName);
  doc.setCreator("EventureOS");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const brand = hexColour(input.brand);
  const cur = input.currency ?? "AUD";
  const money = (n: number | null | undefined) => quotePdfMoney(n, cur);

  // Text the standard fonts can't draw is replaced rather than crashing the whole PDF
  const ok = new Map<string, boolean>();
  const safe = (s: string | null | undefined) => Array.from((s ?? "").replace(/\r\n?/g, "\n")).map((ch) => {
    if (ch === "\n") return ch;
    if (SWAP[ch]) return SWAP[ch];
    if (!ok.has(ch)) { try { regular.encodeText(ch); bold.encodeText(ch); ok.set(ch, true); } catch { ok.set(ch, false); } }
    return ok.get(ch) ? ch : "?";
  }).join("");

  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const out: string[] = [];
    for (const para of safe(text).split("\n")) {
      if (!para.trim()) { out.push(""); continue; }
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
        if (line) out.push(line);
        // A single word wider than the column is broken by characters
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          out.push(w.slice(0, cut)); w = w.slice(cut);
        }
        line = w;
      }
      out.push(line);
    }
    return out;
  };

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
  const pages: PDFPage[] = [page];
  const newPage = () => { page = doc.addPage(A4); pages.push(page); y = A4[1] - M; };
  const need = (h: number) => { if (y - h < M + 24) newPage(); };
  const text = (s: string, x: number, size: number, opts: { font?: PDFFont; color?: RGB; right?: boolean } = {}) => {
    const f = opts.font ?? regular;
    const t = safe(s);
    page.drawText(t, { x: opts.right ? x - f.widthOfTextAtSize(t, size) : x, y, size, font: f, color: opts.color ?? INK });
  };
  const rule = (color = LINE, thickness = 0.75) => page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness, color });
  const right = A4[0] - M;

  // ── Header: logo or business name, then the quote details on the right
  page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: brand });
  let logoDrawn = false;
  if (input.logo?.length) {
    try {
      const b = input.logo;
      const img = b[0] === 0x89 && b[1] === 0x50 ? await doc.embedPng(b) : b[0] === 0xff && b[1] === 0xd8 ? await doc.embedJpg(b) : null;
      if (img) {
        const scale = Math.min(150 / img.width, 54 / img.height, 1);
        page.drawImage(img, { x: M, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
        logoDrawn = true;
        y -= img.height * scale + 14;
      }
    } catch { /* unreadable logo — fall back to the name */ }
  }
  const headTop = A4[1] - M;
  if (!logoDrawn) { y -= 16; text(input.orgName, M, 16, { font: bold }); y -= 22; }
  else { text(input.orgName, M, 10, { font: bold, color: MUTED }); y -= 18; }

  // Right-hand details block
  const details: [string, string][] = [
    ["Quote", `Q-${input.quoteNumber}`],
    ...(input.versionNumber ? [["Version", String(input.versionNumber)] as [string, string]] : []),
    ["Issued", fmtDay(input.snap.issue_date)],
    ["Valid until", fmtDay(input.snap.expiry_date)],
    ...(input.eventDate !== undefined ? [["Event date", input.eventDate ? fmtDay(input.eventDate) : "TBC"] as [string, string]] : []),
  ];
  let dy = headTop - 12;
  for (const [k, v] of details) {
    const t = safe(v);
    page.drawText(t, { x: right - bold.widthOfTextAtSize(t, 9.5), y: dy, size: 9.5, font: bold, color: INK });
    const kk = safe(k);
    page.drawText(kk, { x: right - 150, y: dy, size: 9, font: regular, color: FAINT });
    dy -= 14;
  }
  y = Math.min(y, dy - 6);

  // Title, event and customer
  y -= 8;
  for (const l of wrap(input.snap.title ?? `Quote Q-${input.quoteNumber}`, bold, 18, right - M)) { need(24); text(l, M, 18, { font: bold }); y -= 23; }
  if (input.eventLabel) { for (const l of wrap(input.eventLabel, regular, 10, right - M)) { text(l, M, 10, { color: MUTED }); y -= 14; } }
  const bt = billToLines(input.billTo);
  if (bt) {
    y -= 6; text("PREPARED FOR", M, 7.5, { color: FAINT }); y -= 12;
    text(bt.main, M, 10, { font: bold }); y -= 13;
    for (const l of bt.sub) for (const w of wrap(l, regular, 9.5, right - M)) { need(14); text(w, M, 9.5, { color: MUTED }); y -= 12.5; }
  } else if (input.customerName) { y -= 4; text(`Prepared for ${input.customerName}`, M, 10, { color: MUTED }); y -= 14; }
  y -= 10; rule(INK, 1); y -= 18;

  // ── Lines
  const COL_AMT = right, COL_PRICE = right - 90, COL_QTY = right - 175, DESC_W = COL_QTY - 40 - M;
  const sections = input.snap.sections ?? [];
  if (!sections.length) { text("This quote has no items.", M, 10, { color: MUTED }); y -= 16; }
  for (const s of sections) {
    need(40);
    text((s.title ?? "").toUpperCase(), M, 8.5, { font: bold, color: MUTED });
    if (s.optional) text("OPTIONAL EXTRAS", right, 8, { font: bold, color: brand, right: true });
    y -= 6; rule(); y -= 14;
    if (s.description) { for (const l of wrap(s.description, regular, 9, right - M)) { need(14); text(l, M, 9, { color: MUTED }); y -= 12; } y -= 4; }
    // Column headings
    text("Qty", COL_QTY, 7.5, { color: FAINT, right: true }); text("Unit price", COL_PRICE, 7.5, { color: FAINT, right: true }); text("Amount", COL_AMT, 7.5, { color: FAINT, right: true });
    y -= 13;
    for (const it of s.items ?? []) {
      const nameLines = wrap(it.name + (it.optional && !s.optional ? "  (optional)" : ""), bold, 10, DESC_W);
      const descLines = it.description ? wrap(it.description, regular, 8.5, DESC_W) : [];
      const disc = [
        Number(it.discount_percent ?? 0) > 0 ? `${Number(it.discount_percent)}% off` : null,
        Number(it.discount_amount ?? 0) > 0 ? `${money(Number(it.discount_amount))} off` : null,
        it.tax_rate != null && Number(it.tax_rate) === 0 ? "No GST" : null,
      ].filter(Boolean).join(" · ");
      need(14 + nameLines.length * 13 + descLines.length * 11 + (disc ? 11 : 0));
      const top = y;
      nameLines.forEach((l, i) => { text(l, M, 10, { font: bold, color: it.optional ? MUTED : INK }); if (i < nameLines.length - 1) y -= 13; });
      const qty = qtyUnit(Number(it.quantity), it.unit);
      const sy = y; y = top;
      text(qty, COL_QTY, 9.5, { right: true, color: MUTED });
      text(money(it.unit_price), COL_PRICE, 9.5, { right: true, color: MUTED });
      text(money(it.line_total), COL_AMT, 10, { right: true, font: it.optional ? regular : bold, color: it.optional ? MUTED : INK });
      y = sy;
      for (const l of descLines) { y -= 11; text(l, M, 8.5, { color: MUTED }); }
      if (disc) { y -= 11; text(disc, M, 8.5, { color: GREEN }); }
      y -= 10; rule(); y -= 13;
    }
    y -= 8;
  }

  // ── Totals
  const totals: [string, string, { bold?: boolean; green?: boolean }][] = [];
  if (input.snap.discount && input.snap.discount.amount > 0) {
    totals.push(["Items (ex GST)", money(input.snap.lines_subtotal ?? Number(input.snap.subtotal ?? 0) + input.snap.discount.amount), {}]);
    totals.push([`${input.snap.discount.label || "Discount"}${input.snap.discount.type === "percent" ? ` (${Number(input.snap.discount.value)}%)` : ""}`, `-${money(input.snap.discount.amount)}`, { green: true }]);
  }
  totals.push(["Subtotal (ex GST)", money(input.snap.subtotal), {}]);
  totals.push(["GST", money(input.snap.tax_total), {}]);
  const optionalTotal = sections.reduce((a, s) => a + (s.items ?? []).filter((i) => i.optional)
    .reduce((b, i) => b + Number(i.line_total) * (1 + Number(i.tax_rate ?? 0) / 100), 0), 0);
  need(30 + totals.length * 16 + 30);
  for (const [k, v, o] of totals) {
    text(k, right - 220, 9.5, { color: o.green ? GREEN : MUTED });
    text(v, right, 9.5, { right: true, color: o.green ? GREEN : INK });
    y -= 15;
  }
  page.drawLine({ start: { x: right - 220, y: y + 9 }, end: { x: right, y: y + 9 }, thickness: 1, color: INK });
  y -= 6;
  text("Total (inc GST)", right - 220, 12, { font: bold });
  text(money(input.snap.total), right, 12, { right: true, font: bold });
  y -= 16;
  if (optionalTotal > 0) { text(`Optional extras (not included): ${money(optionalTotal)}`, right, 8.5, { right: true, color: MUTED }); y -= 14; }

  // ── Accept online
  if (input.acceptUrl) {
    y -= 18; need(56);
    const boxTop = y + 14;
    page.drawRectangle({ x: M, y: y - 30, width: right - M, height: 44, color: rgb(0.97, 0.97, 0.98), borderColor: LINE, borderWidth: 0.75 });
    y -= 2;
    text("View and accept this quote online", M + 14, 10.5, { font: bold, color: brand });
    y -= 15;
    const urlText = safe(input.acceptUrl);
    const shown = regular.widthOfTextAtSize(urlText, 8.5) > right - M - 28 ? urlText.slice(0, 90) + "..." : urlText;
    text(shown, M + 14, 8.5, { color: MUTED });
    // Make the whole box clickable
    const link = doc.context.obj({
      Type: "Annot", Subtype: "Link", Rect: [M, boxTop - 44, right, boxTop], Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(input.acceptUrl) },
    });
    page.node.addAnnot(doc.context.register(link));
    y -= 28;
  }

  // ── Notes and terms
  for (const [title, body] of [["Notes", input.snap.notes], ["Terms & conditions", input.snap.terms]] as const) {
    if (!body) continue;
    y -= 14; need(40);
    text(title.toUpperCase(), M, 8, { font: bold, color: FAINT }); y -= 13;
    for (const l of wrap(body, regular, 8.5, right - M)) { need(12); text(l, M, 8.5, { color: MUTED }); y -= 11.5; }
  }

  // Footer on every page
  pages.forEach((p, i) => {
    const f = safe(`${input.orgName} · Quote Q-${input.quoteNumber}${pages.length > 1 ? ` · Page ${i + 1} of ${pages.length}` : ""}`);
    p.drawText(f, { x: M, y: 26, size: 7.5, font: regular, color: FAINT });
  });
  return doc.save();
}
