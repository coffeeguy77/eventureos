/**
 * Booking emails: confirmation, waitlist, reminder, thank-you, gift certificate, office alert.
 * Pure (no server imports) so they can be previewed and tested. Inline styles + table layout for email clients.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");
const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
function onColour(hex: string) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0556 ? "#ffffff" : "#111111";
}

export interface Brand { businessName: string; logoUrl?: string | null; brand?: string | null; contactEmail?: string | null; contactPhone?: string | null }
interface Row { label: string; value: string }
interface Btn { label: string; url: string }

function shell(b: Brand, o: { title: string; heading: string; intro: string[]; rows?: Row[]; buttons?: Btn[]; after?: string[]; footer?: string; badge?: string; big?: string }) {
  const colour = safeColour(b.brand);
  const logo = b.logoUrl && /^https:\/\//.test(b.logoUrl)
    ? `<img src="${esc(b.logoUrl)}" alt="${esc(b.businessName)}" height="44" style="display:block;height:44px;max-width:220px;border:0">`
    : `<div style="font:600 18px/1.3 ${FONT};color:#18181b">${esc(b.businessName)}</div>`;
  const p = (t: string) => `<p style="margin:0 0 12px;font:400 15px/1.6 ${FONT};color:#3f3f46">${esc(t).replace(/\n/g, "<br>")}</p>`;
  const rows = o.rows?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:12px;border-collapse:separate">
${o.badge ? `<tr><td colspan="2" style="padding:16px 20px 0;font:600 11px/1.4 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:#71717a">${esc(o.badge)}</td></tr>` : ""}
${o.big ? `<tr><td colspan="2" style="padding:6px 20px 2px;font:700 26px/1.25 ${FONT};letter-spacing:.04em;color:#18181b">${esc(o.big)}</td></tr>` : ""}
${o.rows.map((r) => `<tr><td style="padding:10px 0 0 20px;width:34%;vertical-align:top;font:400 13px/1.5 ${FONT};color:#71717a">${esc(r.label)}</td><td style="padding:10px 20px 0 8px;vertical-align:top;font:600 14px/1.5 ${FONT};color:#18181b">${esc(r.value).replace(/\n/g, "<br>")}</td></tr>`).join("")}
<tr><td colspan="2" style="height:16px"></td></tr></table>` : "";
  const buttons = (o.buttons ?? []).map((x, i) => `<a href="${esc(x.url)}" style="display:inline-block;margin:0 8px 8px 0;${i === 0 ? `background:${colour};color:${onColour(colour)}` : "background:#f4f4f5;color:#18181b"};text-decoration:none;font:600 14px/1 ${FONT};padding:13px 18px;border-radius:10px">${esc(x.label)}</a>`).join("");
  const contact = [b.contactPhone, b.contactEmail].filter(Boolean).join(" · ");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e4e4e7">
<tr><td style="padding:26px 28px 14px">${logo}</td></tr>
<tr><td style="padding:0 28px 8px;font:700 21px/1.35 ${FONT};color:#18181b">${esc(o.heading)}</td></tr>
<tr><td style="padding:4px 28px 6px">${o.intro.map(p).join("")}</td></tr>
${rows ? `<tr><td style="padding:4px 28px 18px">${rows}</td></tr>` : ""}
${buttons ? `<tr><td style="padding:0 28px 14px">${buttons}</td></tr>` : ""}
${o.after?.length ? `<tr><td style="padding:0 28px 10px">${o.after.map(p).join("")}</td></tr>` : ""}
<tr><td style="padding:0 28px 24px;font:400 12.5px/1.5 ${FONT};color:#71717a">${esc(o.footer ?? `Questions? Just reply to this email${contact ? ` or contact us: ${contact}` : ""}.`)}</td></tr>
</table>
<p style="margin:14px 0 0;font:400 12px/1.5 ${FONT};color:#a1a1aa">${esc(b.businessName)}</p>
</td></tr></table></body></html>`;
  const text = [o.heading, "", ...o.intro, "", ...(o.big ? [o.big] : []), ...(o.rows ?? []).map((r) => `${r.label}: ${r.value}`), "",
    ...(o.buttons ?? []).map((x) => `${x.label}: ${x.url}`), ...(o.after?.length ? ["", ...o.after] : []), "", o.footer ?? (contact ? `Questions? Reply to this email or contact ${contact}.` : "")].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { subject: o.title, html, text };
}

export interface BookingEmailInput {
  firstName: string; course: string; reference: string; when: string; time: string; location: string | null; seats: number; attendees: string[];
  paidLine: string | null; whatToBring: string | null; manageUrl: string; icsUrl: string; googleUrl: string; cancelHours: number;
}

export function confirmationEmail(b: Brand, o: BookingEmailInput) {
  return shell(b, {
    title: `You're booked: ${o.course} — ${o.when}`,
    heading: `You're booked in, ${o.firstName}!`,
    intro: [`Thanks for booking with ${b.businessName}. Here are your details — keep this email handy.`],
    badge: `Booking ${o.reference}`,
    rows: [
      { label: "Course", value: o.course },
      { label: "When", value: `${o.when}\n${o.time}` },
      ...(o.location ? [{ label: "Where", value: o.location }] : []),
      { label: o.seats === 1 ? "Seat" : "Seats", value: o.attendees.length ? o.attendees.join("\n") : String(o.seats) },
      ...(o.paidLine ? [{ label: "Payment", value: o.paidLine }] : []),
    ],
    buttons: [{ label: "Add to Google Calendar", url: o.googleUrl }, { label: "Apple / Outlook calendar", url: o.icsUrl }, { label: "Change or cancel", url: o.manageUrl }],
    after: [
      ...(o.whatToBring ? [`What to bring: ${o.whatToBring}`] : []),
      o.cancelHours > 0 ? `Need to change your date? You can move or cancel your booking online up to ${o.cancelHours} hours before it starts.` : "Need to change your date? Just reply to this email.",
    ],
  });
}

export function waitlistEmail(b: Brand, o: Pick<BookingEmailInput, "firstName" | "course" | "reference" | "when" | "time" | "seats" | "manageUrl">) {
  return shell(b, {
    title: `You're on the waitlist: ${o.course} — ${o.when}`,
    heading: `You're on the waitlist, ${o.firstName}`,
    intro: [`That session is full right now. If a seat opens up we'll let you know straight away — nothing to pay until then.`],
    badge: `Waitlist ${o.reference}`,
    rows: [{ label: "Course", value: o.course }, { label: "When", value: `${o.when}\n${o.time}` }, { label: "Seats wanted", value: String(o.seats) }],
    buttons: [{ label: "See other dates", url: o.manageUrl }],
  });
}

export function reminderEmail(b: Brand, o: BookingEmailInput) {
  return shell(b, {
    title: `Reminder: ${o.course} — ${o.when}`,
    heading: `See you soon, ${o.firstName}!`,
    intro: [`Just a reminder about your booking with ${b.businessName}.`],
    badge: `Booking ${o.reference}`,
    rows: [{ label: "Course", value: o.course }, { label: "When", value: `${o.when}\n${o.time}` }, ...(o.location ? [{ label: "Where", value: o.location }] : []),
      { label: o.seats === 1 ? "Seat" : "Seats", value: o.attendees.length ? o.attendees.join("\n") : String(o.seats) }],
    buttons: [{ label: "Add to calendar", url: o.googleUrl }, { label: "Change or cancel", url: o.manageUrl }],
    after: o.whatToBring ? [`What to bring: ${o.whatToBring}`] : [],
  });
}

export function thankYouEmail(b: Brand, o: { firstName: string; course: string; reviewUrl: string | null; bookUrl: string; giftUrl: string | null; social: { facebook?: string; instagram?: string }; certificateUrl?: string | null; accountUrl?: string | null }) {
  const buttons: Btn[] = [];
  if (o.certificateUrl) buttons.push({ label: "Download your certificate", url: o.certificateUrl });
  if (o.reviewUrl) buttons.push({ label: "Leave a quick review", url: o.reviewUrl });
  if (o.giftUrl) buttons.push({ label: "Give it as a gift", url: o.giftUrl });
  buttons.push({ label: "Book another course", url: o.bookUrl });
  if (o.social.instagram) buttons.push({ label: "Instagram", url: o.social.instagram });
  if (o.social.facebook) buttons.push({ label: "Facebook", url: o.social.facebook });
  return shell(b, {
    title: `Thanks for coming to ${o.course}!`,
    heading: `Thanks for coming, ${o.firstName}!`,
    intro: [`We hope you enjoyed ${o.course}.${o.certificateUrl ? " Your certificate is ready." : ""}${o.reviewUrl ? " If you have a minute, a review helps other people find us — it means a lot to a small business." : ""}`],
    buttons,
    after: o.accountUrl ? [`Your certificate is also kept in your account — sign in any time with just your email: ${o.accountUrl}`] : [],
  });
}

export function giftEmail(b: Brand, o: { to: "purchaser" | "recipient"; purchaserName: string | null; recipientName: string | null; code: string; amount: string; course: string | null; message: string | null; expires: string | null; viewUrl: string; bookUrl: string }) {
  const forWhom = o.recipientName ? `for ${o.recipientName}` : "";
  return shell(b, {
    title: o.to === "recipient" ? `${o.purchaserName ? `${o.purchaserName} sent you` : "You've received"} a ${b.businessName} gift certificate` : `Your gift certificate ${forWhom}`.trim(),
    heading: o.to === "recipient" ? `A gift for you${o.recipientName ? `, ${o.recipientName.split(/\s+/)[0]}` : ""}!` : "Here's your gift certificate",
    intro: o.to === "recipient"
      ? [`${o.purchaserName ?? "Someone"} has given you ${o.course ? `a ${o.course}` : `a ${o.amount} gift certificate`} with ${b.businessName}.`, ...(o.message ? [`“${o.message}”`] : [])]
      : [`Thanks for your purchase! Print it or forward this email — the code below is all they need to book.`],
    badge: "Gift certificate",
    big: o.code,
    rows: [{ label: "Value", value: o.amount }, ...(o.course ? [{ label: "For", value: o.course }] : []), ...(o.expires ? [{ label: "Use by", value: o.expires }] : [])],
    buttons: [{ label: o.to === "recipient" ? "Book now" : "View / print certificate", url: o.to === "recipient" ? o.bookUrl : o.viewUrl }, ...(o.to === "recipient" ? [{ label: "View certificate", url: o.viewUrl }] : [{ label: "Booking page", url: o.bookUrl }])],
    after: [`To use it: choose a date on the booking page and enter the code at checkout.`],
  });
}

export function officeAlertEmail(b: Brand, o: { heading: string; lines: Row[]; url: string }) {
  return shell(b, { title: o.heading, heading: o.heading, intro: [], rows: o.lines, buttons: [{ label: "Open in EventureOS", url: o.url }], footer: "Sent by EventureOS bookings." });
}

export function seatOpenEmail(b: Brand, o: { firstName: string; course: string; when: string; time: string; bookUrl: string }) {
  return shell(b, {
    title: `A seat has opened: ${o.course} — ${o.when}`,
    heading: `Good news, ${o.firstName} — a seat opened up`,
    intro: [`A seat is free on ${o.course}, ${o.when} (${o.time}). Seats go to whoever books first, so be quick!`],
    buttons: [{ label: "Book my seat", url: o.bookUrl }],
  });
}

export function loginEmail(b: Brand, o: { firstName: string; url: string; minutes: number }) {
  return shell(b, {
    title: `Your sign-in link — ${b.businessName}`,
    heading: `Hi ${o.firstName}, here's your sign-in link`,
    intro: [`Tap the button to see your bookings and certificates with ${b.businessName}. No password needed.`],
    buttons: [{ label: "Sign in", url: o.url }],
    after: [`The link works once and expires in ${o.minutes} minutes. If you didn't ask for it, you can ignore this email.`],
  });
}

export function certificateRequestEmail(b: Brand, o: { name: string; email: string; url: string }) {
  return shell(b, { title: `Certificate request — ${o.name}`, heading: "A past student has asked for their certificate", intro: [`${o.name} (${o.email}) signed in and asked for a certificate, but there's no course on record for them. Check which course they did and issue it from Bookings → Certificates.`],
    buttons: [{ label: "Open certificates", url: o.url }], footer: "Sent by EventureOS bookings." });
}
