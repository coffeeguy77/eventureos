import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

/**
 * The invoice as a PDF — a tax invoice with everything bought, GST, and the payments made, so once it's paid it shows
 * the date paid and a zero balance (the same as Xero's paid invoice). Unpaid, it shows the amount due and the pay link.
 * Pure (no server imports) — tested with `npx tsx`. Standard fonts: Western European characters only.
 */
export interface DocLine { description: string; quantity: number | null; unit: number | null; amount: number | null }
export interface DocPayment { date: string; label: string; amount: number }
export interface InvoiceDocInput {
  org: { name: string; abn?: string | null; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; brand?: string | null; logo?: Uint8Array | null };
  billTo: { main: string; sub: string[] } | null;
  invoice: { number: string; issueDate: string | null; dueDate: string | null; reference?: string | null; eventLabel?: string | null; currency: string;
    subtotal: number; taxTotal: number; total: number; balance: number; status: string };
  lines: DocLine[];
  /** "inc" = line amounts include GST, "ex" = exclude it, null = amounts hidden (only the invoice totals are certain) */
  lineTax: "inc" | "ex" | null;
  payments: DocPayment[];
  credits: DocPayment[];
  payUrl?: string | null;
}

const A4: [number, number] = [595.28, 841.89];
const M = 48;
const INK = rgb(0.09, 0.09, 0.11), MUTED = rgb(0.42, 0.42, 0.46), FAINT = rgb(0.6, 0.6, 0.64), LINE = rgb(0.89, 0.89, 0.91), GREEN = rgb(0.02, 0.47, 0.34);
const SWAP: Record<string, string> = { "−": "-", "‐": "-", "‑": "-", "–": "-", "—": "-", " ": " ", " ": " ", " ": " ", "→": "->", "✓": "v", "×": "x", "’": "'", "‘": "'", "“": "\"", "”": "\"", "•": "-" };

function hexColour(hex: string | null | undefined): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return rgb(0.38, 0.16, 0.93);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
export const docMoney = (n: number, currency = "AUD") => {
  const s = new Intl.NumberFormat("en-AU", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
  return (n < 0 ? "-" : "") + s.replace(/^A\$/, "$");
};
export const docDay = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/** Do the line amounts include GST, exclude it, or not add up to the invoice (then hide them)? */
export function lineTaxMode(lines: { amount: number | null }[], subtotal: number, total: number): "inc" | "ex" | null {
  if (!lines.length || lines.some((l) => l.amount == null)) return null;
  const sum = Math.round(lines.reduce((t, l) => t + Number(l.amount), 0) * 100) / 100;
  if (Math.abs(sum - total) <= 0.05) return "inc";
  if (Math.abs(sum - subtotal) <= 0.05) return "ex";
  return null;
}

export async function buildInvoicePdf(d: InvoiceDocInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const paid = d.invoice.balance <= 0.004 && d.invoice.status !== "void";
  doc.setTitle(`${paid ? "Paid tax invoice" : "Tax invoice"} ${d.invoice.number} - ${d.org.name}`);
  doc.setAuthor(d.org.name);
  doc.setCreator("EventureOS");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const brand = hexColour(d.org.brand);
  const cur = d.invoice.currency || "AUD";
  const money = (n: number) => docMoney(n, cur);
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
      if (!para.trim()) continue;
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
        if (line) out.push(line);
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) { let c = w.length - 1; while (c > 1 && font.widthOfTextAtSize(w.slice(0, c), size) > width) c--; out.push(w.slice(0, c)); w = w.slice(c); }
        line = w;
      }
      if (line) out.push(line);
    }
    return out;
  };

  let page: PDFPage = doc.addPage(A4);
  const pages: PDFPage[] = [page];
  let y = A4[1] - M;
  const right = A4[0] - M;
  const newPage = () => { page = doc.addPage(A4); pages.push(page); y = A4[1] - M; };
  const need = (h: number) => { if (y - h < M + 24) newPage(); };
  const text = (s: string, x: number, size: number, o: { font?: PDFFont; color?: RGB; right?: boolean } = {}) => {
    const f = o.font ?? regular; const t = safe(s);
    page.drawText(t, { x: o.right ? x - f.widthOfTextAtSize(t, size) : x, y, size, font: f, color: o.color ?? INK });
  };
  const rule = (c = LINE, w = 0.75) => page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: w, color: c });

  // Header: logo / name and business details (left), title and invoice details (right)
  page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: brand });
  const top = y;
  let logoDrawn = false;
  if (d.org.logo?.length) {
    try {
      const b = d.org.logo;
      const img = b[0] === 0x89 && b[1] === 0x50 ? await doc.embedPng(b) : b[0] === 0xff && b[1] === 0xd8 ? await doc.embedJpg(b) : null;
      if (img) { const k = Math.min(150 / img.width, 54 / img.height, 1); page.drawImage(img, { x: M, y: y - img.height * k, width: img.width * k, height: img.height * k }); y -= img.height * k + 14; logoDrawn = true; }
    } catch { /* no logo */ }
  }
  if (!logoDrawn) { y -= 16; text(d.org.name, M, 16, { font: bold }); y -= 18; } else { text(d.org.name, M, 10, { font: bold }); y -= 13; }
  for (const l of [d.org.abn ? `ABN ${d.org.abn}` : null, d.org.address ? d.org.address.replace(/\s*\n\s*/g, ", ") : null, d.org.phone, d.org.email, d.org.website].filter(Boolean) as string[]) {
    for (const w of wrap(l, regular, 9, 250).slice(0, 2)) { text(w, M, 9, { color: MUTED }); y -= 12; }
  }
  let dy = top - 10;
  const title = "TAX INVOICE";
  page.drawText(title, { x: right - bold.widthOfTextAtSize(title, 16), y: dy - 4, size: 16, font: bold, color: brand });
  dy -= 26;
  const det: [string, string][] = [["Invoice", d.invoice.number], ["Invoice date", docDay(d.invoice.issueDate)], ...(d.invoice.dueDate && !paid ? [["Due", docDay(d.invoice.dueDate)] as [string, string]] : []),
    ...(d.invoice.reference ? [["Reference", d.invoice.reference] as [string, string]] : [])];
  for (const [k, v] of det) {
    const tv = safe(v).slice(0, 40);
    page.drawText(tv, { x: right - bold.widthOfTextAtSize(tv, 9.5), y: dy, size: 9.5, font: bold, color: INK });
    page.drawText(safe(k), { x: right - 230, y: dy, size: 9, font: regular, color: FAINT });
    dy -= 14;
  }
  if (paid) {
    dy -= 6;
    const stamp = "PAID";
    const w = bold.widthOfTextAtSize(stamp, 13) + 22;
    page.drawRectangle({ x: right - w, y: dy - 8, width: w, height: 22, borderColor: GREEN, borderWidth: 1.5, color: rgb(0.93, 0.98, 0.95) });
    page.drawText(stamp, { x: right - w + 11, y: dy - 1, size: 13, font: bold, color: GREEN });
    dy -= 22;
  }
  y = Math.min(y, dy) - 14;

  // Bill to + event
  if (d.billTo) {
    text("BILL TO", M, 7.5, { color: FAINT }); y -= 13;
    text(d.billTo.main, M, 11, { font: bold }); y -= 13;
    for (const l of d.billTo.sub.slice(0, 5)) for (const w of wrap(l, regular, 9.5, right - M).slice(0, 1)) { text(w, M, 9.5, { color: MUTED }); y -= 12; }
  }
  if (d.invoice.eventLabel) { y -= 2; for (const w of wrap(d.invoice.eventLabel, regular, 9.5, right - M).slice(0, 2)) { text(w, M, 9.5, { color: MUTED }); y -= 12; } }
  y -= 12; rule(INK, 1); y -= 16;

  // Lines
  const COL_AMT = right, COL_UNIT = right - 90, COL_QTY = right - 165;
  const showAmounts = d.lineTax !== null;
  const descW = (showAmounts ? COL_QTY - 34 : right) - M;
  text("Description", M, 7.5, { color: FAINT });
  if (showAmounts) { text("Qty", COL_QTY, 7.5, { color: FAINT, right: true }); text(d.lineTax === "inc" ? "Unit (inc GST)" : "Unit (ex GST)", COL_UNIT, 7.5, { color: FAINT, right: true }); text(d.lineTax === "inc" ? "Amount (inc GST)" : "Amount (ex GST)", COL_AMT, 7.5, { color: FAINT, right: true }); }
  y -= 8; rule(); y -= 14;
  for (const l of d.lines) {
    const parts = l.description.split("\n");
    const head = wrap(parts[0] ?? "", bold, 9.5, descW);
    const rest = parts.slice(1).join(" ").trim() ? wrap(parts.slice(1).join("\n"), regular, 8.5, descW).slice(0, 4) : [];
    need(16 + head.length * 12 + rest.length * 11);
    const rowTop = y;
    head.forEach((h, i) => { text(h, M, 9.5, { font: bold }); if (i < head.length - 1) y -= 12; });
    const after = y; y = rowTop;
    if (showAmounts) {
      if (l.quantity != null) text(String(Math.round(l.quantity * 100) / 100), COL_QTY, 9.5, { right: true, color: MUTED });
      if (l.unit != null) text(money(l.unit), COL_UNIT, 9.5, { right: true, color: MUTED });
      if (l.amount != null) text(money(l.amount), COL_AMT, 9.5, { right: true, font: bold });
    } else if (l.quantity != null && l.quantity !== 1) text(`x ${Math.round(l.quantity * 100) / 100}`, right, 9.5, { right: true, color: MUTED });
    y = after;
    for (const r of rest) { y -= 11; text(r, M, 8.5, { color: MUTED }); }
    y -= 9; rule(); y -= 13;
  }

  // Totals
  need(140);
  y -= 4;
  const rows: [string, string, RGB?][] = [["Subtotal (ex GST)", money(d.invoice.subtotal)], ["GST", money(d.invoice.taxTotal)]];
  for (const [k, v] of rows) { text(k, right - 230, 9.5, { color: MUTED }); text(v, right, 9.5, { right: true }); y -= 15; }
  page.drawLine({ start: { x: right - 230, y: y + 9 }, end: { x: right, y: y + 9 }, thickness: 1, color: INK });
  y -= 6;
  text("Total (inc GST)", right - 230, 11.5, { font: bold }); text(money(d.invoice.total), right, 11.5, { right: true, font: bold }); y -= 18;
  for (const p of d.payments) { text(`Paid ${docDay(p.date)}${p.label ? ` · ${p.label}` : ""}`.slice(0, 48), right - 230, 9, { color: GREEN }); text(`-${money(p.amount)}`, right, 9, { right: true, color: GREEN }); y -= 13; need(40); }
  for (const c of d.credits) { text(`Credit ${docDay(c.date)}${c.label ? ` · ${c.label}` : ""}`.slice(0, 48), right - 230, 9, { color: MUTED }); text(`-${money(c.amount)}`, right, 9, { right: true, color: MUTED }); y -= 13; need(40); }
  page.drawLine({ start: { x: right - 230, y: y + 7 }, end: { x: right, y: y + 7 }, thickness: 1, color: INK });
  y -= 8;
  const due = Math.max(0, d.invoice.balance);
  text(paid ? "Amount owing" : "Amount due", right - 230, 12.5, { font: bold }); text(money(due), right, 12.5, { right: true, font: bold, color: paid ? GREEN : INK }); y -= 16;
  if (paid && d.payments.length) { text(`Paid in full ${docDay(d.payments[d.payments.length - 1].date)} - thank you.`, right, 9.5, { right: true, color: GREEN }); y -= 14; }

  // How to pay (unpaid)
  if (!paid && d.payUrl && d.invoice.status !== "void") {
    y -= 16; need(56);
    const boxTop = y + 14;
    page.drawRectangle({ x: M, y: y - 30, width: right - M, height: 44, color: rgb(0.97, 0.97, 0.98), borderColor: LINE, borderWidth: 0.75 });
    y -= 2; text("Pay this invoice online", M + 14, 10.5, { font: bold, color: brand }); y -= 15;
    const u = safe(d.payUrl); text(regular.widthOfTextAtSize(u, 8.5) > right - M - 28 ? `${u.slice(0, 90)}...` : u, M + 14, 8.5, { color: MUTED });
    const link = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [M, boxTop - 44, right, boxTop], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(d.payUrl) } });
    page.node.addAnnot(doc.context.register(link));
    y -= 22;
    text(`Or pay by bank transfer using ${d.invoice.number} as the reference.`, M, 8.5, { color: MUTED }); y -= 12;
  }

  pages.forEach((p, i) => {
    const f = safe(`${d.org.name}${d.org.abn ? ` · ABN ${d.org.abn}` : ""} · Tax invoice ${d.invoice.number}${pages.length > 1 ? ` · Page ${i + 1} of ${pages.length}` : ""}`);
    p.drawText(f, { x: M, y: 26, size: 7.5, font: regular, color: FAINT });
  });
  return doc.save();
}
