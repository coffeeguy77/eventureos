/**
 * Mail-outs (pure): turn the plain text a business writes into the email each client receives — their first name,
 * paragraphs and bullet points, links, and the footer Australian spam law requires (who it's from, and a working
 * unsubscribe).
 */

export type Audience = "repairshopr" | "all" | "xero";
export const AUDIENCE_LABEL: Record<Audience, string> = {
  repairshopr: "Clients from RepairShopr",
  all: "Every client with an email address",
  xero: "Clients from Xero",
};
export const AUDIENCE_TAG: Partial<Record<Audience, string>> = { repairshopr: "RepairShopr contact", xero: "Xero" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s: string) => esc(s).replace(/\bhttps?:\/\/[^\s<)]+[^\s<).,;:!?'"]/g, (u) => `<a href="${u}" style="color:#6028EC">${u}</a>`);

/** "Hi {first_name}," → the person's first name, or "there" when we don't know it. */
export function personalise(text: string, firstName: string | null) {
  const n = (firstName ?? "").trim();
  return text.replace(/\{first_name\}/gi, n && /^[\p{L}'’-]{2,30}$/u.test(n) ? n[0].toUpperCase() + n.slice(1) : "there");
}

/** Plain text (blank lines between paragraphs, "•" or "-" bullets) → simple, readable email HTML. */
export function bodyHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => {
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*[•\-*]\s+/.test(l))) {
      return `<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li style="margin:0 0 6px">${linkify(l.replace(/^\s*[•\-*]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p style="margin:0 0 16px">${lines.map(linkify).join("<br>")}</p>`;
  }).join("");
}

export function render(m: { subject: string; body: string }, r: { firstName: string | null; unsubscribeUrl: string }, from: { name: string; address: string | null; phone: string | null; email: string | null }) {
  const text = personalise(m.body, r.firstName);
  const footerText = `You're receiving this because you're a ${from.name} client. ${from.name}${from.address ? `, ${from.address}` : ""}${from.phone ? ` · ${from.phone}` : ""}.\nUnsubscribe: ${r.unsubscribeUrl}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F5F4FA;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F0B1E">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 26px;font-size:16px;line-height:1.6">${bodyHtml(text)}</div>
<p style="max-width:600px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#8A86A0;text-align:center">You're receiving this because you're a ${esc(from.name)} client. ${esc(from.name)}${from.address ? `, ${esc(from.address)}` : ""}${from.phone ? ` · ${esc(from.phone)}` : ""}.<br><a href="${esc(r.unsubscribeUrl)}" style="color:#8A86A0">Unsubscribe from these emails</a></p>
</body></html>`;
  return { subject: personalise(m.subject, r.firstName).slice(0, 200), html, text: `${text}\n\n—\n${footerText}` };
}

/** The Care Hub email, ready to send to existing clients (edit before sending). */
export const CARE_HUB_EMAIL = {
  subject: "Website changes, without the wait",
  body: `Hi {first_name},

Small website changes shouldn't need a quote, three emails and a week. So we've built the Care Hub.

Buy a block of hours (2 hours $240, 5 hours $570, 10 hours $1,080, all + GST), list the changes you want in your client portal, attach your files, and we do them. No quote each time, and you can see exactly how many hours you have left.

Your portal also shows what your website needs: the WordPress and plugin updates waiting, next to the latest versions. One tap asks us to run them.

Want more enquiries? Add Google Ads management to your package for $600 + GST a month. That includes 2 hours of campaign work every week — about $1,040 of our time at our normal rate — plus a detailed report each month.

See how it works: https://webculture.au/website-maintenance
Get started: https://webculture.au/p/webculture

The Web Culture team
02 6223 2222 · hello@webculture.au`,
};
