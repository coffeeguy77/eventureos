/**
 * Barista job board emails. Pure (no server imports) — built on the booking email shell.
 */
import { shell, type Brand, type Btn } from "@/lib/bookings/emails";

export function employerLoginEmail(b: Brand, o: { firstName: string; board: string; url: string; minutes: number }) {
  return shell(b, {
    title: `Your sign-in link — ${o.board}`,
    heading: `Hi ${o.firstName || "there"}, here's your sign-in link`,
    intro: [`Tap the button to sign in to ${o.board}. No password needed.`],
    buttons: [{ label: "Sign in", url: o.url }],
    after: [`The link works once and expires in ${o.minutes} minutes. If you didn't ask for it, you can ignore this email.`],
  });
}

export function jobNoticeEmail(b: Brand, o: { heading: string; lines: string[]; button: Btn; footer?: string }) {
  return shell(b, { title: o.heading, heading: o.heading, intro: o.lines, buttons: [o.button], footer: o.footer });
}

/** The welcome letter. Body is plain text (blank lines = paragraphs). Includes an open-tracking pixel and an unsubscribe link. */
export function welcomeLetterEmail(b: Brand, o: { subject: string; body: string; button: Btn; pixel: string; unsubscribe: string; board: string }) {
  const paras = o.body.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const m = shell(b, {
    title: o.subject, heading: o.board, intro: paras, buttons: [o.button],
    footer: `You're getting this because you trained with ${b.businessName}. Don't want job board emails? Unsubscribe: ${o.unsubscribe}`,
  });
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = m.html
    .replace(`Unsubscribe: ${o.unsubscribe.replace(/&/g, "&amp;")}`, `<a href="${esc(o.unsubscribe)}" style="color:#71717a">Unsubscribe</a>`)
    .replace("</body>", `<img src="${esc(o.pixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0"></body>`);
  return { subject: m.subject, html, text: m.text };
}
