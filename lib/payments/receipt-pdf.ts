import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

/**
 * A payment receipt (A4 PDF) — what a customer downloads from their account after paying an invoice.
 * Pure (no server imports) so it can be tested with `npx tsx`. Standard fonts: Western European characters only.
 */
export interface ReceiptInput {
  org: { name: string; abn?: string | null; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; brand?: string | null; logo?: Uint8Array | null };
  customer: { name: string; lines?: string[] };
  receiptNo: string;
  invoice: { number: string; issueDate: string | null; total: number; taxTotal: number; currency: string; reference?: string | null; eventLabel?: string | null };
  payment: { amount: number; paidAt: string; method: string | null; reference: string | null };
  /** paid on this invoice before this payment */
  paidBefore: number;
  timezone: string;
  lines?: { description: string; amount: number | null }[];
}

const A4: [number, number] = [595.28, 841.89];
const M = 48;
const INK = rgb(0.09, 0.09, 0.11), MUTED = rgb(0.42, 0.42, 0.46), FAINT = rgb(0.6, 0.6, 0.64), LINE = rgb(0.89, 0.89, 0.91), GREEN = rgb(0.02, 0.47, 0.34);
const SWAP: Record<string, string> = { "\u2212": "-", "\u2010": "-", "\u2011": "-", "\u2013": "-", "\u2014": "-", "\u00a0": " ", "\u202f": " ", "\u2009": " ", "\u2192": "->", "\u2713": "v", "\u00d7": "x", "\u2019": "'", "\u2018": "'", "\u201c": "\"", "\u201d": "\"" };

function hexColour(hex: string | null | undefined): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return rgb(0.38, 0.16, 0.93);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
export const receiptMoney = (n: number, currency = "AUD") => {
  const s = new Intl.NumberFormat("en-AU", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
  return (n < 0 ? "-" : "") + s.replace(/^A\$/, "$");
};
const fmtDay = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
export const fmtPaidAt = (ts: string, tz: string) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-AU", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
};
/** "Stripe" + pi_… → "Card (Stripe)"; bank etc. as written. */
export const methodLabel = (m: string | null, ref: string | null) => {
  const v = (m ?? "").trim();
  if (/stripe|card/i.test(v) || /^pi_/.test(ref ?? "")) return "Card (online)";
  if (/xero/i.test(v)) return "Bank transfer / recorded in Xero";
  return v ? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Payment";
};
/** The GST included in a payment, in proportion to the invoice's GST. */
export const gstInPayment = (amount: number, total: number, tax: number) => (total > 0 ? Math.round((amount * tax / total) * 100) / 100 : 0);

export async function buildReceiptPdf(r: ReceiptInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Receipt ${r.receiptNo} - ${r.org.name}`);
  doc.setAuthor(r.org.name);
  doc.setCreator("EventureOS");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const brand = hexColour(r.org.brand);
  const cur = r.invoice.currency || "AUD";
  const money = (n: number) => receiptMoney(n, cur);
  const ok = new Map<string, boolean>();
  const safe = (s: string | null | undefined) => Array.from((s ?? "").replace(/\r\n?/g, "\n")).map((ch) => {
    if (ch === "\n") return ch;
    if (SWAP[ch]) return SWAP[ch];
    if (!ok.has(ch)) { try { regular.encodeText(ch); bold.encodeText(ch); ok.set(ch, true); } catch { ok.set(ch, false); } }
    return ok.get(ch) ? ch : "?";
  }).join("");
  const page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
  const right = A4[0] - M;
  const text = (s: string, x: number, size: number, o: { font?: PDFFont; color?: RGB; right?: boolean } = {}) => {
    const f = o.font ?? regular; const t = safe(s);
    page.drawText(t, { x: o.right ? x - f.widthOfTextAtSize(t, size) : x, y, size, font: f, color: o.color ?? INK });
  };
  const fit = (s: string, font: PDFFont, size: number, width: number) => {
    let t = safe(s).replace(/\s+/g, " ").trim();
    if (font.widthOfTextAtSize(t, size) <= width) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
    return `${t}...`;
  };
  const rule = (c = LINE, w = 0.75) => page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: w, color: c });

  // Header
  page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: brand });
  const top = y;
  let logoDrawn = false;
  if (r.org.logo?.length) {
    try {
      const b = r.org.logo;
      const img = b[0] === 0x89 && b[1] === 0x50 ? await doc.embedPng(b) : b[0] === 0xff && b[1] === 0xd8 ? await doc.embedJpg(b) : null;
      if (img) { const k = Math.min(150 / img.width, 54 / img.height, 1); page.drawImage(img, { x: M, y: y - img.height * k, width: img.width * k, height: img.height * k }); y -= img.height * k + 14; logoDrawn = true; }
    } catch { /* no logo */ }
  }
  if (!logoDrawn) { y -= 16; text(r.org.name, M, 16, { font: bold }); y -= 18; } else { text(r.org.name, M, 10, { font: bold }); y -= 13; }
  for (const l of [r.org.abn ? `ABN ${r.org.abn}` : null, r.org.address ? r.org.address.replace(/\s*\n\s*/g, ", ") : null, r.org.phone, r.org.email, r.org.website].filter(Boolean) as string[]) {
    text(fit(l, regular, 9, 260), M, 9, { color: MUTED }); y -= 12;
  }
  // Right: receipt title + details
  let dy = top - 10;
  const t1 = "PAYMENT RECEIPT";
  page.drawText(t1, { x: right - bold.widthOfTextAtSize(t1, 15), y: dy - 4, size: 15, font: bold, color: brand });
  dy -= 26;
  for (const [k, v] of [["Receipt", r.receiptNo], ["Date paid", fmtPaidAt(r.payment.paidAt, r.timezone)], ["Invoice", r.invoice.number], ["Invoice date", fmtDay(r.invoice.issueDate)]] as [string, string][]) {
    const tv = safe(v);
    page.drawText(tv, { x: right - bold.widthOfTextAtSize(tv, 9.5), y: dy, size: 9.5, font: bold, color: INK });
    page.drawText(safe(k), { x: right - 220, y: dy, size: 9, font: regular, color: FAINT });
    dy -= 14;
  }
  y = Math.min(y, dy) - 14;

  // Received from
  text("RECEIVED FROM", M, 7.5, { color: FAINT }); y -= 13;
  text(fit(r.customer.name, bold, 11, right - M), M, 11, { font: bold }); y -= 13;
  for (const l of (r.customer.lines ?? []).slice(0, 4)) { text(fit(l, regular, 9.5, right - M), M, 9.5, { color: MUTED }); y -= 12; }
  if (r.invoice.eventLabel) { y -= 2; text(fit(r.invoice.eventLabel, regular, 9.5, right - M), M, 9.5, { color: MUTED }); y -= 12; }
  if (r.invoice.reference) { text(fit(`Your reference: ${r.invoice.reference}`, regular, 9.5, right - M), M, 9.5, { color: MUTED }); y -= 12; }
  y -= 14;

  // Amount paid — the big box
  const boxH = 70;
  page.drawRectangle({ x: M, y: y - boxH, width: right - M, height: boxH, color: rgb(0.97, 0.98, 0.97), borderColor: LINE, borderWidth: 0.75 });
  const by = y;
  y = by - 24; text("Amount paid", M + 16, 10, { color: MUTED });
  y = by - 52; text(money(r.payment.amount), M + 16, 24, { font: bold, color: GREEN });
  const gst = gstInPayment(r.payment.amount, r.invoice.total, r.invoice.taxTotal);
  y = by - 24; text(methodLabel(r.payment.method, r.payment.reference), right - 16, 10, { right: true, font: bold });
  y = by - 40; if (gst > 0) text(`Includes GST of ${money(gst)}`, right - 16, 9.5, { right: true, color: MUTED });
  y = by - 54; if (r.payment.reference) text(fit(`Ref ${r.payment.reference}`, regular, 8.5, 240), right - 16, 8.5, { right: true, color: FAINT });
  y = by - boxH - 26;

  // What it was for (summary of the invoice lines, when known)
  const lines = (r.lines ?? []).filter((l) => l.description.trim()).slice(0, 14);
  if (lines.length) {
    text(`INVOICE ${r.invoice.number}`.toUpperCase(), M, 8, { font: bold, color: MUTED }); y -= 6; rule(); y -= 14;
    for (const l of lines) {
      text(fit(l.description.split("\n")[0], regular, 9.5, right - M - 110), M, 9.5);
      if (l.amount != null) text(money(l.amount), right, 9.5, { right: true, color: MUTED });
      y -= 15;
    }
    if ((r.lines ?? []).length > lines.length) { text(`+ ${(r.lines ?? []).length - lines.length} more`, M, 8.5, { color: FAINT }); y -= 13; }
    y -= 4;
  }

  // Invoice position
  const balanceAfter = Math.max(0, Math.round((r.invoice.total - r.paidBefore - r.payment.amount) * 100) / 100);
  rule(INK, 1); y -= 18;
  const rows: [string, string, boolean?][] = [
    ["Invoice total (inc GST)", money(r.invoice.total)],
    ...(r.invoice.taxTotal > 0 ? [["GST included", money(r.invoice.taxTotal)] as [string, string]] : []),
    ...(r.paidBefore > 0 ? [["Paid before", `-${money(r.paidBefore)}`] as [string, string]] : []),
    ["This payment", `-${money(r.payment.amount)}`],
  ];
  for (const [k, v] of rows) { text(k, right - 240, 9.5, { color: MUTED }); text(v, right, 9.5, { right: true }); y -= 15; }
  page.drawLine({ start: { x: right - 240, y: y + 9 }, end: { x: right, y: y + 9 }, thickness: 1, color: INK });
  y -= 6;
  text(balanceAfter > 0 ? "Balance still owing" : "Balance owing", right - 240, 11, { font: bold });
  text(money(balanceAfter), right, 11, { right: true, font: bold, color: balanceAfter > 0 ? INK : GREEN });
  y -= 16;
  if (balanceAfter <= 0) { text("Paid in full - thank you.", right, 9.5, { right: true, color: GREEN }); y -= 14; }

  // Footer
  const foot = safe(`${r.org.name} · Receipt ${r.receiptNo} · This receipt confirms payment against invoice ${r.invoice.number}.`);
  page.drawText(foot.length > 140 ? foot.slice(0, 140) : foot, { x: M, y: 26, size: 7.5, font: regular, color: FAINT });
  return doc.save();
}
