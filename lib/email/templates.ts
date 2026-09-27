/** Branded, email-client-safe invitation emails (inline styles, table layout). */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");

function layout(o: { brand: string; logoUrl?: string | null; businessName: string; heading: string; paragraphs: string[]; button: { label: string; url: string }; footer: string }) {
  const colour = safeColour(o.brand);
  const logo = o.logoUrl && /^https:\/\//.test(o.logoUrl)
    ? `<img src="${esc(o.logoUrl)}" alt="${esc(o.businessName)}" height="40" style="display:block;height:40px;max-width:200px;border:0">`
    : `<div style="font:600 18px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">${esc(o.businessName)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e4e4e7">
<tr><td style="padding:28px 28px 8px">${logo}</td></tr>
<tr><td style="padding:12px 28px 0;font:600 20px/1.35 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">${esc(o.heading)}</td></tr>
${o.paragraphs.map((p) => `<tr><td style="padding:12px 28px 0;font:400 15px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#3f3f46">${esc(p)}</td></tr>`).join("")}
<tr><td style="padding:24px 28px 8px"><a href="${esc(o.button.url)}" style="display:inline-block;background:${colour};color:#ffffff;text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:14px 22px;border-radius:10px">${esc(o.button.label)}</a></td></tr>
<tr><td style="padding:8px 28px 28px;font:400 12.5px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#71717a">If the button doesn't work, copy this link:<br><a href="${esc(o.button.url)}" style="color:#71717a;word-break:break-all">${esc(o.button.url)}</a></td></tr>
</table>
<p style="margin:16px 0 0;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#a1a1aa">${esc(o.footer)}</p>
</td></tr></table></body></html>`;
}

export function teamInviteEmail(o: { businessName: string; inviterName: string; roleLabel: string; roleHint: string; url: string; brand?: string | null; logoUrl?: string | null }) {
  const subject = `${o.inviterName} invited you to join ${o.businessName} on EventureOS`;
  const paragraphs = [
    `${o.inviterName} has invited you to ${o.businessName}'s EventureOS as ${o.roleLabel} — ${o.roleHint.charAt(0).toLowerCase()}${o.roleHint.slice(1)}.`,
    "Create your account with this email address and you'll be in straight away.",
  ];
  const html = layout({ brand: o.brand ?? "#6028EC", logoUrl: o.logoUrl, businessName: o.businessName, heading: `Join ${o.businessName}`, paragraphs,
    button: { label: "Accept invitation", url: o.url }, footer: `Sent by EventureOS on behalf of ${o.businessName}. Not expecting this? You can ignore it.` });
  const text = `${paragraphs.join("\n\n")}\n\nAccept: ${o.url}\n\nNot expecting this? You can ignore it.`;
  return { subject, html, text };
}

export function portalInviteEmail(o: { businessName: string; inviterName: string | null; firstName: string; eventName: string; eventDate: string | null; url: string; brand?: string | null; logoUrl?: string | null }) {
  const subject = `You've been added to ${o.eventName} with ${o.businessName}`;
  const paragraphs = [
    `Hi ${o.firstName},`,
    `${o.inviterName ? `${o.inviterName} added you` : "You've been added"} to ${o.eventName}${o.eventDate ? ` (${o.eventDate})` : ""} with ${o.businessName}.`,
    "In the booking portal you can see the details, the quote, invoices and documents, and message us. Sign in with this email address — we'll send you a one-time code, no password needed.",
  ];
  const html = layout({ brand: o.brand ?? "#6028EC", logoUrl: o.logoUrl, businessName: o.businessName, heading: "Your booking portal", paragraphs,
    button: { label: "Open the booking", url: o.url }, footer: `Sent on behalf of ${o.businessName}. Not expecting this? You can ignore it.` });
  const text = `${paragraphs.join("\n\n")}\n\nOpen the booking: ${o.url}`;
  return { subject, html, text };
}

export function bookingApprovalEmail(o: { businessName: string; eventName: string; customer: string | null; when: string; dateText: string | null; venue: string | null; url: string }) {
  const subject = `Approve booking: ${o.eventName} — ${o.when}`;
  const paragraphs = [
    `${o.customer ?? "A customer"} just accepted the quote for ${o.eventName}${o.dateText ? ` on ${o.dateText}` : ""}${o.venue ? ` at ${o.venue}` : ""} — ${o.when}.`,
    "It is NOT confirmed yet: it isn't on the calendar and no invoice has been raised. Their portal tells them you still need to confirm.",
    "Check you have the staff and equipment, then approve it on the event page. If you can't do it, call the customer and cancel the event.",
  ];
  const html = layout({ brand: "#D97706", businessName: o.businessName, heading: `Short-notice booking: ${o.when}`, paragraphs,
    button: { label: "Review and approve", url: o.url }, footer: `Sent by EventureOS to ${o.businessName}'s owners and admins. Change this in Settings → Automations → Booking approval.` });
  const text = `${paragraphs.join("\n\n")}\n\nReview and approve: ${o.url}`;
  return { subject, html, text };
}

export function xeroQuoteAcceptedEmail(o: { businessName: string; customer: string; quoteNumber: string; amount: string; acceptedAt: string; upcoming: string[]; url: string }) {
  const subject = `${o.customer} accepted ${o.quoteNumber} in Xero — confirm the booking`;
  const paragraphs = [
    `${o.customer} accepted quote ${o.quoteNumber} (${o.amount}) in Xero at ${o.acceptedAt}.`,
    "Quotes accepted in Xero skip EventureOS's booking approval, so nothing has been confirmed with them. Check the date, make sure you have staff and equipment, and reply so they know where they stand.",
    o.upcoming.length ? `Upcoming bookings on your calendar for them: ${o.upcoming.join("; ")}.` : "There's nothing on your calendar for them yet — if the event is soon, contact them now.",
  ];
  const html = layout({ brand: "#D97706", businessName: o.businessName, heading: `Quote accepted in Xero: ${o.customer}`, paragraphs,
    button: { label: "Open the client", url: o.url }, footer: `Sent by EventureOS to ${o.businessName}'s owners and admins when a quote is accepted in Xero.` });
  const text = `${paragraphs.join("\n\n")}\n\nOpen the client: ${o.url}`;
  return { subject, html, text };
}
