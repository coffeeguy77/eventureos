import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { htmlToText, parseAddressList, type ParsedMessage } from "@/lib/integrations/gmail";
import { INTEGRATION_COLUMNS, loadOrg, type IntegrationRow, type SyncContext } from "@/lib/integrations/runtime";
import {
  createWebhook, getDomain, getReceivedEmail, listDomains, listWebhooks, updateDomain, updateWebhook, verifyDomain,
  type ReceivedEmail, type ResendRecord,
} from "./resend-api";

/**
 * Forwarding addresses: every business can have a private address at the EventureOS domain
 * (e.g. webculture-k3f9a2@eventureos.com.au). They forward mail to it from any mailbox — all of it, or only what a
 * Gmail/Outlook filter picks — and it's read exactly like a connected Gmail: enquiries, client emails, Nerd Herd tickets.
 *
 * Stored as an integrations row (provider 'email_forward', account_label = the address, settings = recent mail and
 * forwarding confirmations). Resend receives the mail (receiving switched on for the EventureOS domain, MX record in
 * Vercel DNS) and calls our webhook with email.received; we fetch the message and route it by address.
 */

export const PROVIDER = "email_forward";

export function inboundDomain(): string {
  const env = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase();
  if (env) return env;
  const from = process.env.EMAIL_FROM?.trim() ?? "";
  const m = from.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return (m?.[1] ?? "eventureos.com.au").toLowerCase();
}

export function newForwardingAddress(slug: string) {
  const base = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "inbox";
  return `${base}-${randomBytes(4).toString("hex").slice(0, 6)}@${inboundDomain()}`;
}

export interface ForwardSettings {
  /** Gmail/Outlook "confirm forwarding" messages caught at the address, newest first */
  confirmations?: { from: string; to: string | null; code: string | null; link: string | null; at: string }[];
  /** the last few emails received, newest first */
  recent?: { at: string; from: string; subject: string | null; outcome: string; detail?: string | null }[];
  /** mailboxes the business forwards from (shown in Settings, treated as the business's own) */
  sources?: string[];
}

// ------------------------------------------------------------------------------------------------
// Platform setup (runs from the background sync; idempotent)
// ------------------------------------------------------------------------------------------------

export interface InboundSetup {
  domain: string; domain_id?: string; receiving?: string; status?: string; mx?: ResendRecord[]; webhook?: string;
  ok: boolean; error?: string | null; checked_at: string;
}

const SETUP_KEY = "inbound_email";

/** Switch receiving on for the EventureOS domain, make sure the webhook gets email.received, and record what's needed. */
export async function ensureInboundSetup(db: SupabaseClient): Promise<InboundSetup> {
  const { data: row } = await db.from("platform_settings").select("value").eq("key", SETUP_KEY).maybeSingle();
  const prev = (row?.value ?? null) as InboundSetup | null;
  // Once working, check again at most every 6 hours
  if (prev?.ok && prev.receiving === "verified_ok" && Date.now() - Date.parse(prev.checked_at) < 6 * 3600_000) return prev;
  const domain = inboundDomain();
  const out: InboundSetup = { domain, ok: false, checked_at: new Date().toISOString() };
  try {
    const d0 = (await listDomains()).find((d) => d.name.toLowerCase() === domain);
    if (!d0) throw new Error(`${domain} isn't a domain in Resend — add it in Resend → Domains first.`);
    out.domain_id = d0.id;
    let d = await getDomain(d0.id);
    if (d.capabilities?.receiving !== "enabled") {
      await updateDomain(d0.id, { capabilities: { sending: d.capabilities?.sending ?? "enabled", receiving: "enabled" } });
      d = await getDomain(d0.id);
    }
    out.mx = (d.records ?? []).filter((r) => r.type === "MX" && !/^send(\.|$)/i.test(r.name));
    const mxOk = out.mx.length > 0 && out.mx.every((r) => r.status === "verified");
    if (!mxOk && out.mx.length) await verifyDomain(d0.id).catch(() => undefined);
    out.status = d.status;
    out.receiving = mxOk ? "verified_ok" : out.mx.length ? (out.mx[0].status ?? "pending") : "no_mx_record";

    // The webhook: our existing delivery-events webhook also gets email.received
    const app = (process.env.APP_URL?.trim() || "https://www.eventureos.com.au").replace(/\/+$/, "");
    const hooks = await listWebhooks();
    const mine = hooks.find((h) => /\/api\/resend\/webhook\/?$/.test(h.endpoint));
    if (mine) {
      if (!mine.events.includes("email.received")) await updateWebhook(mine.id, { events: [...new Set([...mine.events, "email.received"])] });
      out.webhook = mine.endpoint;
    } else {
      const created = await createWebhook(`${app}/api/resend/webhook`, ["email.received", "email.delivered", "email.bounced", "email.complained", "email.delivery_delayed", "email.failed"]);
      out.webhook = created.endpoint ?? `${app}/api/resend/webhook`;
      out.error = "A new Resend webhook was created — copy its signing secret into Vercel as RESEND_WEBHOOK_SECRET (Resend → Webhooks), then redeploy.";
    }
    out.ok = mxOk && !out.error;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  await db.from("platform_settings").upsert({ key: SETUP_KEY, value: out, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return out;
}

// ------------------------------------------------------------------------------------------------
// Receiving
// ------------------------------------------------------------------------------------------------

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const bare = (s: string) => parseAddressList(s)[0]?.email?.toLowerCase() ?? lower(s);
const headerOf = (h: ReceivedEmail["headers"], name: string) => {
  if (!h) return null;
  const k = Object.keys(h).find((x) => x.toLowerCase() === name);
  const v = k ? h[k] : null;
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
};

/** Gmail and Outlook "please confirm forwarding" messages. */
export function forwardingConfirmation(from: string, subject: string, text: string) {
  const isGmail = /forwarding-noreply@google\.com/i.test(from) || /gmail forwarding confirmation/i.test(subject);
  const isOutlook = /microsoft|outlook/i.test(from) && /forward/i.test(subject) && /(verify|confirm)/i.test(subject + text);
  if (!isGmail && !isOutlook) return null;
  const code = text.match(/confirmation code[:\s]*([0-9]{6,12})/i)?.[1] ?? subject.match(/\(#?([0-9]{6,12})\)/)?.[1] ?? null;
  const link = text.match(/https:\/\/(?:mail(?:-settings)?\.google\.com|[a-z0-9.-]*(?:outlook|microsoft|live)\.com)\/[^\s<>")]+/i)?.[0] ?? null;
  const who = text.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}) has requested to automatically forward/i)?.[1] ?? null;
  return { code, link, who };
}

async function remember(db: SupabaseClient, integ: IntegrationRow, entry: NonNullable<ForwardSettings["recent"]>[number], patch: Partial<ForwardSettings> = {}) {
  const s = (integ.settings ?? {}) as ForwardSettings;
  const recent = [entry, ...(s.recent ?? [])].slice(0, 25);
  const settings = { ...s, ...patch, recent };
  await db.from("integrations").update({ settings, last_sync_at: new Date().toISOString(), last_sync_status: "success", last_error: null }).eq("id", integ.id);
  integ.settings = settings as Record<string, unknown>;
}

function toParsed(e: ReceivedEmail): ParsedMessage {
  const fromHeader = headerOf(e.headers, "from") ?? e.from;
  const from = parseAddressList(fromHeader)[0] ?? { email: lower(e.from) || "unknown@unknown", name: null };
  const toHeader = headerOf(e.headers, "to");
  const ccHeader = headerOf(e.headers, "cc");
  const date = headerOf(e.headers, "date");
  const messageId = (e.message_id ?? headerOf(e.headers, "message-id"))?.trim() ?? null;
  const inReplyTo = headerOf(e.headers, "in-reply-to")?.trim() ?? null;
  const references = headerOf(e.headers, "references")?.trim() ?? null;
  const root = (references?.match(/<[^>]+>/)?.[0] ?? inReplyTo ?? messageId ?? e.id).replace(/[<>\s]/g, "");
  const text = (e.text?.trim() || (e.html ? htmlToText(e.html) : "")).replace(/\r\n/g, "\n");
  return {
    gmailId: `rs:${e.id}`,
    threadId: `rt:${root}`.slice(0, 250),
    labelIds: ["INBOX", "UNREAD"],
    sentAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : e.created_at,
    from,
    to: toHeader ? parseAddressList(toHeader) : (e.to ?? []).map((t) => parseAddressList(t)[0] ?? { email: lower(t), name: null }),
    cc: ccHeader ? parseAddressList(ccHeader) : (e.cc ?? []).map((t) => parseAddressList(t)[0] ?? { email: lower(t), name: null }),
    replyTo: e.reply_to?.[0] ? parseAddressList(e.reply_to[0])[0] ?? null : null,
    subject: e.subject,
    messageId,
    inReplyTo,
    references,
    text,
    html: e.html,
    snippet: text.replace(/\s+/g, " ").slice(0, 200),
    attachments: (e.attachments ?? []).map((a) => a.filename),
    headers: {
      list_unsubscribe: !!headerOf(e.headers, "list-unsubscribe"),
      precedence: headerOf(e.headers, "precedence"),
      auto_submitted: headerOf(e.headers, "auto-submitted"),
    },
  };
}

/** email.received → find the business by the address it was sent to, then read it like a Gmail message. */
export async function handleReceived(db: SupabaseClient, emailId: string, hinted: string[] = []): Promise<{ outcome: string; org?: string; detail?: string }> {
  const e = await getReceivedEmail(emailId);
  const domain = inboundDomain();
  const candidates = [...new Set([...(e.received_for ?? []), ...(e.to ?? []), ...(e.cc ?? []), ...hinted].map(bare))].filter((a) => a.endsWith(`@${domain}`));
  if (!candidates.length) return { outcome: "unrouted", detail: "not addressed to a forwarding address" };
  const { data } = await db.from("integrations").select(INTEGRATION_COLUMNS).eq("provider", PROVIDER).in("account_label", candidates).limit(1);
  const integ = ((data ?? []) as IntegrationRow[])[0];
  if (!integ) return { outcome: "unrouted", detail: `no business uses ${candidates.join(", ")}` };
  if (integ.status !== "connected") return { outcome: "ignored", org: integ.organisation_id, detail: "forwarding is switched off" };

  const pm = toParsed(e);
  const at = new Date().toISOString();
  const conf = forwardingConfirmation(pm.from.email, pm.subject ?? "", pm.text);
  if (conf) {
    const s = (integ.settings ?? {}) as ForwardSettings;
    const confirmations = [{ from: pm.from.email, to: conf.who, code: conf.code, link: conf.link, at }, ...(s.confirmations ?? [])].slice(0, 10);
    const sources = conf.who ? [...new Set([...(s.sources ?? []), conf.who.toLowerCase()])] : s.sources;
    await remember(db, integ, { at, from: pm.from.email, subject: pm.subject, outcome: "confirmation", detail: conf.code ? `code ${conf.code}` : null }, { confirmations, sources });
    await db.from("notifications").insert({
      organisation_id: integ.organisation_id, type: "email.forwarding", title: "Confirm email forwarding",
      body: `${conf.who ?? "Your mailbox"} wants to forward to EventureOS${conf.code ? ` — confirmation code ${conf.code}` : ""}. Open Settings → Email.`.slice(0, 280),
      link: "/settings/email",
    });
    return { outcome: "confirmation", org: integ.organisation_id };
  }

  const org = await loadOrg(db, integ.organisation_id);
  const ctx: SyncContext = { db, mode: "service", actorId: null, integration: { ...integ, provider: "gmail" as IntegrationRow["provider"] }, org };
  // The business's own mailboxes count as "us" (so our replies don't look like client emails)
  const sources = ((integ.settings ?? {}) as ForwardSettings).sources ?? [];
  ctx.integration.external_account_id = sources[0] ?? ctx.integration.external_account_id;
  const { ingestMessage } = await import("@/lib/integrations/gmail-sync");
  const res = await ingestMessage(ctx, pm, new Map());
  const outcome = res.filtered ? "filtered" : "processed";
  await remember(db, integ, { at, from: pm.from.email, subject: pm.subject, outcome, detail: res.filtered ? res.filterReason : res.enquiryCreated ? "new enquiry" : null });
  return { outcome, org: integ.organisation_id, detail: res.filterReason || undefined };
}
