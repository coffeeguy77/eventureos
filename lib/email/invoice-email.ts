/**
 * The email a customer receives with their invoice. Pure (no server imports) so the send dialog can preview
 * exactly what will go out. The message is the sender's own words; the invoice card and pay button go below it.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");
const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

function onColour(hex: string) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0556 ? "#ffffff" : "#111111";
}

export interface InvoiceEmailInput {
  businessName: string;
  logoUrl?: string | null;
  brand?: string | null;
  invoiceNumber: string;
  eventLine: string | null;   // "Coffee Van | FlatRock · Saturday 17 October 2026"
  total: string;              // "$1,691.25"
  amountDue: string;          // "$1,691.25"
  dueDate: string | null;     // "17 October 2026"
  /** Already part-paid: shown under the amount due */
  paidNote?: string | null;
  message: string;
  url: string;                // the invoice / pay page
  /** Card payments switched on: the button says "View and pay" */
  cardPayments: boolean;
  signatureHtml?: string | null;
  signatureText?: string | null;
}

export function defaultInvoiceSubject(o: { businessName: string; invoiceNumber: string; eventName?: string | null }) {
  return `Invoice ${o.invoiceNumber} from ${o.businessName}${o.eventName ? ` — ${o.eventName}` : ""}`;
}

export function defaultInvoiceMessage(o: { firstName: string | null; eventName: string | null; eventDate: string | null; dueDate: string | null; amountDue: string; cardPayments: boolean; senderFirstName: string | null }) {
  return [
    `Hi ${o.firstName?.trim() || "there"},`,
    "",
    `Thanks for confirming${o.eventName ? ` ${o.eventName}` : ""}${o.eventDate ? ` on ${o.eventDate}` : ""}. Please find your invoice below.`,
    "",
    `The amount due is ${o.amountDue}${o.dueDate ? `, due by ${o.dueDate}` : ""}.${o.cardPayments ? " You can view the invoice and pay by card using the button below." : " You can view the invoice using the button below."}`,
    "",
    "If you have any questions, just reply to this email.",
    "",
    "Kind regards,",
    o.senderFirstName?.trim() || "",
  ].join("\n").trim();
}

const paragraphs = (s: string) =>
  s.replace(/\r\n/g, "\n").trim().split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px;font:400 15px/1.6 ${FONT};color:#27272a">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

export function invoiceEmail(o: InvoiceEmailInput) {
  const colour = safeColour(o.brand);
  const button = o.cardPayments ? "View and pay invoice" : "View invoice";
  const logo = o.logoUrl && /^https:\/\//.test(o.logoUrl)
    ? `<img src="${esc(o.logoUrl)}" alt="${esc(o.businessName)}" height="44" style="display:block;height:44px;max-width:220px;border:0">`
    : `<div style="font:600 18px/1.3 ${FONT};color:#18181b">${esc(o.businessName)}</div>`;
  const card = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:12px;border-collapse:separate">
<tr><td style="padding:18px 20px 4px;font:600 11px/1.4 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:#71717a">Invoice ${esc(o.invoiceNumber)}</td></tr>
${o.eventLine ? `<tr><td style="padding:0 20px;font:600 16px/1.4 ${FONT};color:#18181b">${esc(o.eventLine)}</td></tr>` : ""}
<tr><td style="padding:14px 20px 18px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font:400 13px/1.4 ${FONT};color:#71717a">Amount due<br><span style="font:700 22px/1.3 ${FONT};color:#18181b">${esc(o.amountDue)}</span>${o.paidNote ? `<br><span style="font:400 12.5px/1.5 ${FONT};color:#71717a">${esc(o.paidNote)}</span>` : ""}</td>
    ${o.dueDate ? `<td align="right" style="font:400 13px/1.4 ${FONT};color:#71717a;vertical-align:bottom">Due by<br><span style="font:600 14px/1.5 ${FONT};color:#27272a">${esc(o.dueDate)}</span></td>` : ""}
  </tr></table>
</td></tr>
<tr><td style="padding:0 20px 20px"><a href="${esc(o.url)}" style="display:block;text-align:center;background:${colour};color:${onColour(colour)};text-decoration:none;font:600 15px/1 ${FONT};padding:15px 22px;border-radius:10px">${button}</a></td></tr>
</table>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(`Invoice ${o.invoiceNumber}`)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e4e4e7">
<tr><td style="padding:26px 28px 18px">${logo}</td></tr>
<tr><td style="padding:4px 28px 6px">${paragraphs(o.message)}</td></tr>
<tr><td style="padding:4px 28px 22px">${card}</td></tr>
${o.signatureHtml ? `<tr><td style="padding:0 28px 24px">${o.signatureHtml}</td></tr>` : ""}
<tr><td style="padding:0 28px 24px;font:400 12.5px/1.5 ${FONT};color:#71717a">If the button doesn't work, copy this link into your browser:<br><a href="${esc(o.url)}" style="color:#71717a;word-break:break-all">${esc(o.url)}</a></td></tr>
</table>
<p style="margin:14px 0 0;font:400 12px/1.5 ${FONT};color:#a1a1aa">Sent by ${esc(o.businessName)}.</p>
</td></tr></table></body></html>`;
  const text = [
    o.message.trim(),
    "",
    `Invoice ${o.invoiceNumber}${o.eventLine ? ` — ${o.eventLine}` : ""}`,
    `Amount due: ${o.amountDue}${o.paidNote ? ` (${o.paidNote})` : ""}`,
    o.dueDate ? `Due by: ${o.dueDate}` : null,
    "",
    `${button}: ${o.url}`,
    ...(o.signatureText ? ["", "-- ", o.signatureText] : []),
  ].filter((x) => x !== null).join("\n");
  return { html, text };
}
