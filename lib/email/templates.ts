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

export function staffAppInviteEmail(o: { businessName: string; firstName: string; inviterName: string | null; url: string; brand?: string | null; logoUrl?: string | null }) {
  const subject = `Your ${o.businessName} staff app`;
  const paragraphs = [
    `Hi ${o.firstName},`,
    `${o.inviterName ? `${o.inviterName} has set you up` : "You've been set up"} on the ${o.businessName} staff app — your shifts, job addresses and details, the job board for swapping shifts, your hours and pay, all in one place.`,
    "Open it on your phone and sign in with this email address (we'll email you a code, no password). Then add it to your home screen so it opens like an app: on iPhone tap Share → Add to Home Screen; on Android tap the ⋮ menu → Add to Home screen.",
    "Keep accepting the Google Calendar invites too — your calendar gives you the reminders, the app gives you everything else.",
  ];
  const html = layout({ brand: o.brand ?? "#6028EC", logoUrl: o.logoUrl, businessName: o.businessName, heading: "Your staff app", paragraphs,
    button: { label: "Open the staff app", url: o.url }, footer: `Sent on behalf of ${o.businessName}.` });
  const text = `${paragraphs.join("\n\n")}\n\nOpen the staff app: ${o.url}`;
  return { subject, html, text };
}

export function staffSignInEmail(o: { businessName: string; firstName: string; url: string; code: string | null; brand?: string | null; logoUrl?: string | null }) {
  const subject = `Sign in to the ${o.businessName} staff app`;
  const paragraphs = [
    `Hi ${o.firstName},`,
    "Tap the button to sign in to the staff app. The link works once and expires in an hour.",
    ...(o.code ? [`Using the app from your iPhone home screen? Type this code into the app instead: ${o.code}`] : []),
  ];
  const html = layout({ brand: o.brand ?? "#6028EC", logoUrl: o.logoUrl, businessName: o.businessName, heading: "Sign in to the staff app", paragraphs,
    button: { label: "Sign in", url: o.url }, footer: `Didn't ask for this? You can ignore it — nobody can sign in without this email. Sent on behalf of ${o.businessName}.` });
  const text = `${paragraphs.join("\n\n")}\n\nSign in: ${o.url}`;
  return { subject, html, text };
}

/** A wholesale customer's private ordering link (sent when the business clicks "Email the ordering link"). */
export function wholesaleLinkEmail(o: { businessName: string; customerName: string; deliveryDay: string; url: string; brand?: string | null; logoUrl?: string | null }) {
  const subject = `Order from ${o.businessName} online`;
  const paragraphs = [
    `Hi ${o.customerName},`,
    `You can now place your ${o.businessName} orders online, with your own prices. Orders go on the next ${o.deliveryDay} delivery.`,
    "Keep this link — it's just for your business, so there's nothing to sign up for. Bookmark it or add it to your phone's home screen.",
  ];
  const html = layout({ brand: o.brand ?? "#6028EC", logoUrl: o.logoUrl, businessName: o.businessName, heading: "Your ordering link", paragraphs,
    button: { label: "Place an order", url: o.url }, footer: `Sent by ${o.businessName}. Please don't share this link outside your business.` });
  const text = `${paragraphs.join("\n\n")}\n\nPlace an order: ${o.url}`;
  return { subject, html, text };
}

/** Confirmation to the customer when a wholesale order is placed (and paid, when paying by card). */
export function wholesaleOrderEmail(o: { businessName: string; customerName: string; number: string; delivery: string; lines: string[]; total: string; paidNote: string; url: string; brand?: string | null; logoUrl?: string | null }) {
  const subject = `Order ${o.number} confirmed — ${o.businessName}`;
  const paragraphs = [`Hi ${o.customerName},`, `Thanks — we've got your order ${o.number} for delivery ${o.delivery}.`, ...o.lines, `Total ${o.total}. ${o.paidNote}`];
  const html = layout({ brand: o.brand ?? "#6028EC", logoUrl: o.logoUrl, businessName: o.businessName, heading: `Order ${o.number}`, paragraphs,
    button: { label: "Order again", url: o.url }, footer: `Sent by ${o.businessName}. Reply to this email if anything needs changing.` });
  const text = `${paragraphs.join("\n\n")}\n\nOrder again: ${o.url}`;
  return { subject, html, text };
}

/** To kitchen staff: catering jobs that are new, changed or cancelled (one block of lines per job). */
export function kitchenJobsEmail(o: { businessName: string; firstName: string; subject: string; blocks: string[][]; url: string; brand?: string | null; logoUrl?: string | null }) {
  const paragraphs = [`Hi ${o.firstName},`, "Here's what's new or changed in catering:", ...o.blocks.map((b) => b.filter(Boolean).join(" · "))];
  const html = layout({ brand: o.brand ?? "#6028EC", logoUrl: o.logoUrl, businessName: o.businessName, heading: o.subject, paragraphs,
    button: { label: "Open the Kitchen tab", url: o.url }, footer: `Sent by ${o.businessName} because you're set up as kitchen staff.` });
  const text = `Hi ${o.firstName},\n\nHere's what's new or changed in catering:\n\n${o.blocks.map((b) => b.filter(Boolean).join("\n")).join("\n\n")}\n\nOpen the Kitchen tab: ${o.url}`;
  return { subject: o.subject, html, text };
}

/** The franchise application link, sent when the business clicks "Send application" on an enquiry. */
export function franchiseApplicationEmail(o: { businessName: string; firstName: string; url: string; note?: string | null; brand?: string | null; logoUrl?: string | null }) {
  const subject = `Your ${o.businessName} franchise application`;
  const paragraphs = [
    `Hi ${o.firstName},`,
    `Thanks for your interest in joining ${o.businessName}. The next step is a short application — it takes about 10 minutes and tells us about you, where you'd like to open and how you'd fund it.`,
    ...(o.note ? [o.note] : []),
    "Once it's in, we'll read it carefully and be in touch about a meeting.",
  ];
  const html = layout({ brand: o.brand ?? "#6028EC", logoUrl: o.logoUrl, businessName: o.businessName, heading: "Your application", paragraphs,
    button: { label: "Start my application", url: o.url }, footer: `Sent by ${o.businessName}. This link is just for you.` });
  const text = `${paragraphs.join("\n\n")}\n\nStart your application: ${o.url}`;
  return { subject, html, text };
}

/** A receipt or paid tax invoice sent from the invoice page (the PDF is attached). */
export function invoiceDocEmail(o: { businessName: string; heading: string; message: string; url: string; brand?: string | null; logoUrl?: string | null; signatureText?: string | null }) {
  const paragraphs = o.message.split(/\n{2,}/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
  const html = layout({ brand: o.brand ?? "#6028EC", logoUrl: o.logoUrl, businessName: o.businessName, heading: o.heading, paragraphs,
    button: { label: "View invoice & receipts", url: o.url }, footer: `Sent by ${o.businessName}. The PDF is attached to this email.` });
  const text = `${o.message}\n\nView your invoice and receipts: ${o.url}${o.signatureText ? `\n\n${o.signatureText}` : ""}`;
  return { html, text };
}
