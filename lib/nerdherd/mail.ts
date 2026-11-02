import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/integrations/registry";

/**
 * Ticket email, both ways:
 *  - To the client: from the connected Gmail (e.g. hello@webculture.au), on the ticket's email conversation, with the
 *    sender's EventureOS signature — so the client's reply comes back into Gmail and the inbox sync puts it on the ticket.
 *    Without Gmail it goes from EventureOS's address with Reply-To set to the support email.
 *  - To the team: an alert when something happens (client replied, opened or accepted a quote, paid).
 */
const EMAIL = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]{2,}$/;

export interface MailTicket { id: string; number: number; subject: string; email_thread_id: string | null; gmail_thread_id?: string | null }
export interface MailOrg { id: string; name: string; brand_colour?: string | null; logo_url?: string | null; settings?: unknown; contact_email?: string | null }

/** Where ticket emails come from right now (shown to staff before they send). */
export async function ticketSender(db: SupabaseClient, orgId: string): Promise<{ via: "gmail" | "resend"; address: string | null }> {
  const { data } = await db.from("integrations").select("status, account_label").eq("organisation_id", orgId).eq("provider", "gmail").maybeSingle();
  if (data && ["connected", "syncing", "error"].includes(data.status as string) && EMAIL.test(String(data.account_label ?? ""))) return { via: "gmail", address: String(data.account_label).toLowerCase() };
  const { emailConfigured } = await import("@/lib/email/send");
  return { via: "resend", address: emailConfigured() ? (process.env.EMAIL_FROM?.match(/<([^>]+)>/)?.[1] ?? "noreply@eventureos.com.au") : null };
}

export interface Outgoing { to: string; name?: string | null; message: string; button?: { label: string; url: string } | null }

/**
 * Send one or more emails about a ticket (one per person so each gets their own link), log each on the ticket,
 * and remember the Gmail conversation so replies land on the ticket. Returns who it went to and any failures.
 */
export async function sendTicketMail(db: SupabaseClient, org: MailOrg, t: MailTicket, o: { mails: Outgoing[]; subject?: string | null; byUserId: string | null; byName: string; logAs?: string | null }) {
  const { readNerd } = await import("./core");
  const { ticketMail } = await import("@/lib/email/templates");
  const nerd = readNerd(org.settings);
  let sig: { html: string; text: string } | null = null;
  if (o.byUserId) {
    try { const { signatureForSend } = await import("@/lib/signatures/server"); const s = await signatureForSend(db, org.id, o.byUserId, null); if (s) sig = { html: s.html, text: s.text }; } catch { sig = null; }
  }
  const sent: string[] = [], failed: { email: string; error: string }[] = [];

  // Gmail: reply on the ticket's conversation when there is one
  let gm: { ctx: import("@/lib/integrations/runtime").SyncContext; address: string } | null = null;
  try {
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const ctx = await buildContext(db, "service", org.id, "gmail", o.byUserId);
    const address = String(ctx.integration.account_label ?? ctx.integration.external_account_id ?? "").toLowerCase();
    if (EMAIL.test(address)) gm = { ctx, address };
  } catch { gm = null; }

  let subject = (o.subject?.trim() || `Ticket #${t.number}: ${t.subject}`).slice(0, 200);
  let threadId: string | null = t.gmail_thread_id ?? null, inReplyTo: string | null = null, references: string[] = [];
  if (gm && t.email_thread_id) {
    try {
      const { replyTarget } = await import("@/lib/email/thread-reply");
      const { ownAddresses } = await import("@/lib/integrations/gmail-sync");
      const target = await replyTarget(db, org.id, t.email_thread_id, ownAddresses(gm.ctx));
      if (target?.thread.gmail_thread_id) { threadId = target.thread.gmail_thread_id; inReplyTo = target.inReplyTo; references = target.references; subject = target.subject; }
    } catch { /* new conversation */ }
  }

  for (const m of o.mails) {
    const to = m.to.trim().toLowerCase();
    if (!EMAIL.test(to)) { failed.push({ email: m.to, error: "not a valid email address" }); continue; }
    const body = ticketMail({ message: m.message, button: m.button ?? null, signatureHtml: sig?.html ?? null, signatureText: sig?.text ?? null, brand: org.brand_colour ?? null });
    try {
      let gmailId: string | null = null;
      if (gm) {
        const { buildRawMessage, sendGmail } = await import("@/lib/integrations/gmail-send");
        const raw = buildRawMessage({ from: gm.address, fromName: o.byName && o.byName !== org.name ? `${o.byName} · ${org.name}` : org.name, to: [to], subject, inReplyTo, references, text: body.text, html: body.html });
        const r = await sendGmail(gm.ctx, raw, threadId);
        gmailId = r.id;
        if (!threadId) {
          threadId = r.threadId;
          await db.from("support_tickets").update({ gmail_thread_id: r.threadId }).eq("id", t.id).then(() => undefined, () => undefined);
        }
        if (r.messageId) { inReplyTo = r.messageId; references = [...references, r.messageId].slice(-10); }
      } else {
        const { emailConfigured, sendEmail } = await import("@/lib/email/send");
        if (!emailConfigured()) throw new Error("email isn't set up (connect Gmail in Settings → Integrations)");
        await sendEmail({ to, subject, html: body.html, text: body.text, fromName: org.name, replyTo: nerd.supportEmail ?? org.contact_email ?? null, orgId: org.id });
      }
      sent.push(to);
      const row: Record<string, unknown> = { organisation_id: org.id, ticket_id: t.id, kind: "email_out", body: `${o.logAs ? `${o.logAs}\n\n` : ""}To ${m.name ? `${m.name} <${to}>` : to}:\n\n${m.message}${m.button ? `\n\n[${m.button.label}]` : ""}`.slice(0, 20000), public: true, author_id: o.byUserId, author_name: o.byName };
      let { error } = await db.from("support_ticket_updates").insert(gmailId ? { ...row, gmail_id: gmailId } : row);
      if (error && /gmail_id/.test(error.message)) ({ error } = await db.from("support_ticket_updates").insert(row));
    } catch (e) { failed.push({ email: to, error: e instanceof Error ? e.message : String(e) }); }
  }
  if (sent.length) await db.from("support_tickets").update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", t.id);
  return { sent, failed, via: gm ? ("gmail" as const) : ("resend" as const), from: gm?.address ?? null };
}

/** Each person's private link to the ticket (made on first use). */
export async function ticketLink(db: SupabaseClient, orgId: string, ticketId: string, p: { email: string; name?: string | null; contactId?: string | null }): Promise<string> {
  const email = p.email.trim().toLowerCase();
  const { data: have } = await db.from("support_ticket_links").select("token").eq("ticket_id", ticketId).eq("email", email).maybeSingle();
  if (have) return `${appBaseUrl()}/ticket/${have.token}`;
  const { data, error } = await db.from("support_ticket_links").insert({ organisation_id: orgId, ticket_id: ticketId, email, name: p.name ?? null, contact_id: p.contactId ?? null }).select("token").single();
  if (error) throw new Error(/support_ticket_links/.test(error.message) ? "Run database update 0092 (ticket quotes) first." : error.message);
  return `${appBaseUrl()}/ticket/${data.token}`;
}

/**
 * Email the team about something on a ticket: the person it's assigned to and anyone with a tab on it;
 * if nobody has it, the owners, admins and managers. Never the person who did it. Never throws.
 */
export async function alertStaff(db: SupabaseClient, orgId: string, ticketId: string, heading: string, lines: string[], o: { except?: string | null } = {}) {
  try {
    const { emailConfigured, sendEmail } = await import("@/lib/email/send");
    if (!emailConfigured()) return;
    const { data: org } = await db.from("organisations").select("id, name, brand_colour, logo_url, settings").eq("id", orgId).maybeSingle();
    if (!org) return;
    const { readNerd } = await import("./core");
    if (!readNerd(org.settings).staffAlerts) return;
    const { data: t } = await db.from("support_tickets").select("id, number, subject, assigned_to").eq("id", ticketId).maybeSingle();
    if (!t) return;
    const ids = new Set<string>();
    if (t.assigned_to) ids.add(t.assigned_to as string);
    const { data: tabs } = await db.from("support_ticket_tabs").select("assigned_to, done").eq("ticket_id", ticketId);
    for (const x of (tabs ?? []) as { assigned_to: string | null; done: boolean }[]) if (x.assigned_to && !x.done) ids.add(x.assigned_to);
    if (!ids.size) {
      const { data: m } = await db.from("organisation_users").select("user_id").eq("organisation_id", orgId).eq("status", "active").in("role", ["owner", "admin", "manager"]);
      for (const x of (m ?? []) as { user_id: string }[]) ids.add(x.user_id);
    }
    if (o.except) ids.delete(o.except);
    if (!ids.size) return;
    const { data: users } = await db.from("users").select("id, email").in("id", [...ids]);
    const { staffTicketAlert } = await import("@/lib/email/templates");
    const url = `${appBaseUrl()}/nerd-herd/tickets/${ticketId}`;
    const m = staffTicketAlert({ businessName: org.name as string, heading, lines: [`#${t.number} ${t.subject}`, ...lines], url, brand: org.brand_colour as string | null, logoUrl: org.logo_url as string | null });
    for (const u of (users ?? []) as { email: string | null }[]) {
      if (!u.email || !EMAIL.test(u.email)) continue;
      await sendEmail({ to: u.email, subject: `${heading} — #${t.number}`.slice(0, 200), html: m.html, text: m.text, fromName: `${org.name} · Nerd Herd`, orgId }).catch(() => undefined);
    }
  } catch { /* alerts never break the thing that triggered them */ }
}
