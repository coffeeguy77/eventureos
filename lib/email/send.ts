import "server-only";

/**
 * Transactional email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 *  POST https://api.resend.com/emails  { from, to, subject, html, text, reply_to }
 * Env: RESEND_API_KEY (required), EMAIL_FROM (optional; default "EventureOS <noreply@eventureos.com.au>").
 * The From address must be on a domain verified in Resend. Each business's name goes in the display name,
 * and replies go to the person who sent the invite (reply_to).
 */
export const emailConfigured = () => !!process.env.RESEND_API_KEY?.trim();

function fromAddress(displayName?: string) {
  const base = process.env.EMAIL_FROM?.trim() || "EventureOS <noreply@eventureos.com.au>";
  if (!displayName) return base;
  const addr = base.match(/<([^>]+)>/)?.[1] ?? base;
  return `${displayName.replace(/[<>"\r\n]/g, "").slice(0, 70)} <${addr}>`;
}

export async function sendEmail(m: { to: string; subject: string; html: string; text: string; replyTo?: string | null; fromName?: string; attachments?: { filename: string; content: string }[]; headers?: Record<string, string> }) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("Email isn't set up — RESEND_API_KEY is missing in Vercel.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(m.fromName), to: [m.to], subject: m.subject.slice(0, 200), html: m.html, text: m.text,
      ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      // base64 file contents (e.g. a certificate PDF)
      ...(m.attachments?.length ? { attachments: m.attachments } : {}),
      ...(m.headers ? { headers: m.headers } : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`The email couldn't be sent (${res.status}): ${detail}`);
  }
  return (await res.json()) as { id: string };
}
