/**
 * The email a customer receives with their quote. Pure (no server imports) so the send dialog can preview
 * exactly what will go out. The message is the sender's own words; the card and button are added around it.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");
const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

/** White or near-black text on the brand colour, whichever reads better. */
function onColour(hex: string) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0556 ? "#ffffff" : "#111111";
}

export interface QuoteEmailInput {
  businessName: string;
  logoUrl?: string | null;
  brand?: string | null;
  quoteNumber: number;
  title: string;
  eventLine: string | null;   // "Corporate breakfast · Saturday 14 November 2026"
  total: string;              // "$962.50"
  validUntil: string | null;  // "14 October 2026"
  message: string;            // the sender's message, plain text
  url: string;                // the recipient's own quote link
  signatureHtml?: string | null;
  signatureText?: string | null;
  footer?: string;
}

export function defaultQuoteSubject(o: { businessName: string; quoteNumber: number; eventName?: string | null }) {
  return `Quote Q-${o.quoteNumber} from ${o.businessName}${o.eventName ? ` — ${o.eventName}` : ""}`;
}

export function defaultQuoteMessage(o: { firstName: string | null; eventName: string | null; eventDate: string | null; validUntil: string | null; senderFirstName: string | null; isUpdate: boolean }) {
  const lines = [
    `Hi ${o.firstName?.trim() || "there"},`,
    "",
    o.isUpdate
      ? `I've updated your quote${o.eventName ? ` for ${o.eventName}` : ""}${o.eventDate ? ` on ${o.eventDate}` : ""}. The latest version is below.`
      : `Thanks for getting in touch. Here's your quote${o.eventName ? ` for ${o.eventName}` : ""}${o.eventDate ? ` on ${o.eventDate}` : ""}.`,
    "",
    `You can view the full quote and accept it online using the button below.${o.validUntil ? ` It's valid until ${o.validUntil}.` : ""}`,
    "",
    "If you have any questions or would like to change anything, just reply to this email.",
    "",
    "Kind regards,",
    o.senderFirstName?.trim() || "",
  ];
  return lines.join("\n").trim();
}

const paragraphs = (s: string) =>
  s.replace(/\r\n/g, "\n").trim().split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px;font:400 15px/1.6 ${FONT};color:#27272a">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

export function quoteEmail(o: QuoteEmailInput) {
  const colour = safeColour(o.brand);
  const logo = o.logoUrl && /^https:\/\//.test(o.logoUrl)
    ? `<img src="${esc(o.logoUrl)}" alt="${esc(o.businessName)}" height="44" style="display:block;height:44px;max-width:220px;border:0">`
    : `<div style="font:600 18px/1.3 ${FONT};color:#18181b">${esc(o.businessName)}</div>`;
  const card = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:12px;border-collapse:separate">
<tr><td style="padding:18px 20px 4px;font:600 11px/1.4 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:#71717a">Quote Q-${o.quoteNumber}</td></tr>
<tr><td style="padding:0 20px;font:600 17px/1.4 ${FONT};color:#18181b">${esc(o.title)}</td></tr>
${o.eventLine ? `<tr><td style="padding:2px 20px 0;font:400 14px/1.5 ${FONT};color:#52525b">${esc(o.eventLine)}</td></tr>` : ""}
<tr><td style="padding:14px 20px 18px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font:400 13px/1.4 ${FONT};color:#71717a">Total inc GST<br><span style="font:700 22px/1.3 ${FONT};color:#18181b">${esc(o.total)}</span></td>
    ${o.validUntil ? `<td align="right" style="font:400 13px/1.4 ${FONT};color:#71717a;vertical-align:bottom">Valid until<br><span style="font:600 14px/1.5 ${FONT};color:#27272a">${esc(o.validUntil)}</span></td>` : ""}
  </tr></table>
</td></tr>
<tr><td style="padding:0 20px 20px"><a href="${esc(o.url)}" style="display:block;text-align:center;background:${colour};color:${onColour(colour)};text-decoration:none;font:600 15px/1 ${FONT};padding:15px 22px;border-radius:10px">View and accept quote</a></td></tr>
</table>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(`Quote Q-${o.quoteNumber}`)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e4e4e7">
<tr><td style="padding:26px 28px 18px">${logo}</td></tr>
<tr><td style="padding:4px 28px 6px">${paragraphs(o.message)}</td></tr>
<tr><td style="padding:4px 28px 22px">${card}</td></tr>
${o.signatureHtml ? `<tr><td style="padding:0 28px 24px">${o.signatureHtml}</td></tr>` : ""}
<tr><td style="padding:0 28px 24px;font:400 12.5px/1.5 ${FONT};color:#71717a">If the button doesn't work, copy this link into your browser:<br><a href="${esc(o.url)}" style="color:#71717a;word-break:break-all">${esc(o.url)}</a></td></tr>
</table>
<p style="margin:14px 0 0;font:400 12px/1.5 ${FONT};color:#a1a1aa">${esc(o.footer ?? `Sent by ${o.businessName}. This link is personal to you — please don't forward it.`)}</p>
</td></tr></table></body></html>`;
  const text = [
    o.message.trim(),
    "",
    `Quote Q-${o.quoteNumber}: ${o.title}`,
    o.eventLine,
    `Total inc GST: ${o.total}`,
    o.validUntil ? `Valid until: ${o.validUntil}` : null,
    "",
    `View and accept your quote: ${o.url}`,
    ...(o.signatureText ? ["", "-- ", o.signatureText] : []),
  ].filter((x) => x !== null).join("\n");
  return { html, text };
}
