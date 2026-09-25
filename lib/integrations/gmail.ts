import "server-only";
import { apiJSON, type SyncContext } from "@/lib/integrations/runtime";

/**
 * Gmail API v1 client (fetch only). Reference:
 *  users.getProfile   GET  https://gmail.googleapis.com/gmail/v1/users/{userId}/profile
 *                     https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile
 *  users.messages.list GET https://gmail.googleapis.com/gmail/v1/users/{userId}/messages  (q, maxResults≤500, pageToken, includeSpamTrash)
 *                     https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
 *  users.messages.get GET  https://gmail.googleapis.com/gmail/v1/users/{userId}/messages/{id}?format=full|metadata
 *                     https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages
 *  users.history.list GET  https://gmail.googleapis.com/gmail/v1/users/{userId}/history  (startHistoryId, historyTypes, pageToken)
 *                     404 when startHistoryId is too old → do a full sync.
 *                     https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
 *  users.threads.list GET  https://gmail.googleapis.com/gmail/v1/users/{userId}/threads
 *                     https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list
 *  users.threads.get  GET  https://gmail.googleapis.com/gmail/v1/users/{userId}/threads/{id}?format=full|metadata|minimal
 *                     https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get
 */
export const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailHeader { name: string; value: string }
export interface GmailPart {
  partId?: string; mimeType?: string; filename?: string; headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string }; parts?: GmailPart[];
}
export interface GmailMessage {
  id: string; threadId: string; labelIds?: string[]; snippet?: string; historyId?: string; internalDate?: string; payload?: GmailPart;
}
export interface GmailThread { id: string; historyId?: string; messages?: GmailMessage[] }

export async function gmailProfileWithToken(accessToken: string) {
  const res = await fetch(`${GMAIL_BASE}/profile`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Gmail profile ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { emailAddress: string; historyId: string; messagesTotal?: number; threadsTotal?: number };
}

export function gmailProfile(ctx: SyncContext) {
  return apiJSON<{ emailAddress: string; historyId: string }>(ctx, `${GMAIL_BASE}/profile`, {}, "Gmail profile");
}

export function listMessages(ctx: SyncContext, q: string, pageToken?: string, maxResults = 100) {
  const u = new URL(`${GMAIL_BASE}/messages`);
  u.searchParams.set("q", q);
  u.searchParams.set("maxResults", String(maxResults));
  if (pageToken) u.searchParams.set("pageToken", pageToken);
  return apiJSON<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(ctx, u.toString(), {}, "Gmail messages.list");
}

export function listHistory(ctx: SyncContext, startHistoryId: string, pageToken?: string) {
  const u = new URL(`${GMAIL_BASE}/history`);
  u.searchParams.set("startHistoryId", startHistoryId);
  u.searchParams.append("historyTypes", "messageAdded");
  u.searchParams.set("maxResults", "500");
  if (pageToken) u.searchParams.set("pageToken", pageToken);
  return apiJSON<{ history?: { id: string; messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[] }[]; nextPageToken?: string; historyId?: string }>(
    ctx, u.toString(), {}, "Gmail history.list");
}

export function getMessage(ctx: SyncContext, id: string) {
  return apiJSON<GmailMessage>(ctx, `${GMAIL_BASE}/messages/${encodeURIComponent(id)}?format=full`, {}, "Gmail messages.get");
}

export function listThreads(ctx: SyncContext, q: string, pageToken?: string, maxResults = 100) {
  const u = new URL(`${GMAIL_BASE}/threads`);
  u.searchParams.set("q", q);
  u.searchParams.set("maxResults", String(maxResults));
  if (pageToken) u.searchParams.set("pageToken", pageToken);
  return apiJSON<{ threads?: { id: string; snippet?: string; historyId?: string }[]; nextPageToken?: string }>(ctx, u.toString(), {}, "Gmail threads.list");
}

export function getThread(ctx: SyncContext, id: string, format: "full" | "metadata" = "full") {
  return apiJSON<GmailThread>(ctx, `${GMAIL_BASE}/threads/${encodeURIComponent(id)}?format=${format}`, {}, "Gmail threads.get");
}

// ------------------------------------------------------------------------------------------------
// Parsing
// ------------------------------------------------------------------------------------------------

export interface Address { email: string; name: string | null }

/** Parse an RFC 5322 address list: `"Smith, John" <john@x.com>, jane@y.com`. */
export function parseAddressList(v: string | null | undefined): Address[] {
  if (!v) return [];
  const parts: string[] = [];
  let cur = "", quoted = false, angle = 0;
  for (const ch of v) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "<" && !quoted) angle++;
    else if (ch === ">" && !quoted) angle = Math.max(0, angle - 1);
    if (ch === "," && !quoted && angle === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const out: Address[] = [];
  for (const p of parts) {
    const m = p.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
    const email = (m ? m[2] : p).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) continue;
    const name = m?.[1]?.trim().replace(/^'|'$/g, "") || null;
    out.push({ email, name: name && name.toLowerCase() !== email ? name : null });
  }
  return out;
}

export function decodeB64Url(data: string | undefined) {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1).replace(/^x/i, "0x"))) : m))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walk(part: GmailPart | undefined, acc: { text: string[]; html: string[]; attachments: string[] }) {
  if (!part) return;
  const mt = (part.mimeType ?? "").toLowerCase();
  if (part.filename && part.body?.attachmentId) { acc.attachments.push(part.filename); return; }
  if (mt === "text/plain" && part.body?.data) acc.text.push(decodeB64Url(part.body.data));
  else if (mt === "text/html" && part.body?.data) acc.html.push(decodeB64Url(part.body.data));
  for (const p of part.parts ?? []) walk(p, acc);
}

export interface ParsedMessage {
  gmailId: string;
  threadId: string;
  labelIds: string[];
  sentAt: string;
  from: Address;
  to: Address[];
  cc: Address[];
  replyTo: Address | null;
  subject: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  text: string;
  html: string | null;
  snippet: string;
  attachments: string[];
  headers: { list_unsubscribe: boolean; precedence: string | null; auto_submitted: string | null };
}

export function header(msg: GmailMessage, name: string) {
  const n = name.toLowerCase();
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? null;
}

export function parseMessage(msg: GmailMessage): ParsedMessage {
  const acc = { text: [] as string[], html: [] as string[], attachments: [] as string[] };
  walk(msg.payload, acc);
  const html = acc.html.join("\n") || null;
  const text = (acc.text.join("\n").trim() || (html ? htmlToText(html) : "") || msg.snippet || "").replace(/\r\n/g, "\n");
  const from = parseAddressList(header(msg, "From"))[0] ?? { email: "unknown@unknown", name: null };
  const dateHeader = header(msg, "Date");
  const sentAt = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString()
    : dateHeader && !Number.isNaN(Date.parse(dateHeader)) ? new Date(dateHeader).toISOString() : new Date().toISOString();
  return {
    gmailId: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds ?? [],
    sentAt,
    from,
    to: parseAddressList(header(msg, "To")),
    cc: parseAddressList(header(msg, "Cc")),
    replyTo: parseAddressList(header(msg, "Reply-To"))[0] ?? null,
    subject: header(msg, "Subject"),
    messageId: header(msg, "Message-ID") ?? header(msg, "Message-Id"),
    inReplyTo: header(msg, "In-Reply-To"),
    references: header(msg, "References"),
    text,
    html,
    snippet: decodeEntities(msg.snippet ?? text.slice(0, 200)),
    attachments: acc.attachments,
    headers: {
      list_unsubscribe: !!header(msg, "List-Unsubscribe"),
      precedence: header(msg, "Precedence"),
      auto_submitted: header(msg, "Auto-Submitted"),
    },
  };
}

function decodeEntities(s: string) {
  return s.replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : m));
}
