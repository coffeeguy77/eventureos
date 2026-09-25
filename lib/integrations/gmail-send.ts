import "server-only";
import { GMAIL_BASE, getMessage, header } from "@/lib/integrations/gmail";
import { apiJSON, type SyncContext } from "@/lib/integrations/runtime";

/**
 * Send a reply through the connected Gmail account so it lands in the same Gmail thread.
 *
 * users.messages.send — POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send  body { raw, threadId }
 *   https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
 * Threading rules — https://developers.google.com/workspace/gmail/api/guides/threads :
 *   1. threadId must be set, 2. References and In-Reply-To must follow RFC 2822, 3. the Subject must match.
 */

/** Strip CR/LF so user input can never inject extra headers. */
const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** RFC 2047 encoded-word for non-ASCII header text. */
export function encodeHeader(s: string) {
  const v = clean(s);
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function mailbox(email: string, name?: string | null) {
  const e = clean(email);
  if (!/^[^\s@<>",]+@[^\s@<>",]+$/.test(e)) throw new Error(`“${email}” isn't a valid email address`);
  if (!name) return e;
  const n = clean(name);
  return /^[\x20-\x7e]*$/.test(n) ? `"${n.replace(/["\\]/g, "")}" <${e}>` : `${encodeHeader(n)} <${e}>`;
}

export function replySubject(subject: string | null | undefined) {
  const s = clean(subject ?? "");
  if (!s) return "Re: your enquiry";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export interface ReplyInput {
  from: string; fromName?: string | null;
  to: string[]; cc?: string[];
  subject: string;
  inReplyTo?: string | null;
  references?: string[];
  text: string;
}

/** RFC 2822 message, base64url-encoded for the Gmail API `raw` field. */
export function buildRawMessage(m: ReplyInput): string {
  if (!m.to.length) throw new Error("A reply needs at least one recipient");
  const lines = [
    `From: ${mailbox(m.from, m.fromName)}`,
    `To: ${m.to.map((t) => mailbox(t)).join(", ")}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.map((t) => mailbox(t)).join(", ")}`] : []),
    `Subject: ${encodeHeader(m.subject)}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${clean(m.inReplyTo)}`] : []),
    ...(m.references?.length ? [`References: ${m.references.map(clean).filter(Boolean).join(" ")}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body = Buffer.from(m.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return Buffer.from(lines.join("\r\n") + "\r\n\r\n" + body, "utf8").toString("base64url");
}

export async function sendGmail(ctx: SyncContext, raw: string, threadId?: string | null) {
  const sent = await apiJSON<{ id: string; threadId: string; labelIds?: string[] }>(ctx, `${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  }, "Gmail messages.send");
  // Read back the Message-ID Gmail assigned so later replies can reference it
  let messageId: string | null = null;
  try { messageId = header(await getMessage(ctx, sent.id), "Message-ID"); } catch { /* not critical */ }
  return { ...sent, messageId };
}
