import "server-only";
import type { SyncContext } from "@/lib/integrations/runtime";
import { readAppAccess, appAllowed } from "@/lib/apps";
import { readNerd } from "./core";

/**
 * Support inbox → tickets (Nerd Herd businesses only, when "Turn client emails into tickets" is on).
 *  - A client's reply on a conversation that already has a ticket is added to that ticket (and reopens it).
 *  - A new conversation from a client, or from anyone that didn't become a sales enquiry, opens a new ticket.
 *  - Our own replies sent from Gmail are added to the ticket's log too.
 * Spam, suppliers, mailing lists and old mail (imported history) never open tickets.
 */
const enabled = new WeakMap<SyncContext, Promise<boolean>>();

async function nerdOn(ctx: SyncContext): Promise<boolean> {
  if (!enabled.has(ctx)) {
    enabled.set(ctx, (async () => {
      if (!readNerd(ctx.org.settings).emailTickets) return false;
      const { data } = await ctx.db.from("organisations").select("app_access").eq("id", ctx.org.id).maybeSingle();
      return appAllowed(readAppAccess((data as { app_access?: unknown } | null)?.app_access), "nerdherd");
    })().catch(() => false));
  }
  return enabled.get(ctx)!;
}

export interface EmailForTicket {
  threadId: string; gmailMessageId: string; outbound: boolean; bulk: boolean; classification: string;
  customerId: string | null; enquiryCreated: boolean; subject: string | null; body: string; fromName: string | null; fromEmail: string; sentAt: string;
}

export async function ticketFromEmail(ctx: SyncContext, m: EmailForTicket): Promise<void> {
  if (!(await nerdOn(ctx))) return;
  if (m.bulk || ["spam", "supplier"].includes(m.classification)) return;
  const db = ctx.db, org = ctx.org.id;
  const { data: existing } = await db.from("support_tickets").select("id, status, number").eq("organisation_id", org).eq("email_thread_id", m.threadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: msg } = await db.from("email_messages").select("id").eq("organisation_id", org).eq("gmail_message_id", m.gmailMessageId).maybeSingle();
  const body = m.body.trim().slice(0, 20000) || null;

  if (existing) {
    const { error } = await db.from("support_ticket_updates").insert({
      organisation_id: org, ticket_id: existing.id, kind: m.outbound ? "email_out" : "email_in", body, public: true,
      author_id: null, author_name: m.outbound ? "Email from us" : (m.fromName ?? m.fromEmail), email_message_id: msg?.id ?? null,
    });
    if (error && /duplicate key/.test(error.message)) return; // already on the ticket
    if (error) throw new Error(`Couldn't add the email to ticket #${existing.number}: ${error.message}`);
    const patch: Record<string, unknown> = { last_activity_at: m.sentAt, updated_at: new Date().toISOString() };
    if (!m.outbound && ["resolved", "closed", "waiting_customer"].includes(existing.status as string)) { patch.status = "open"; patch.resolved_at = null; }
    if (m.outbound && existing.status === "new") patch.status = "in_progress";
    await db.from("support_tickets").update(patch).eq("id", existing.id);
    if (!m.outbound) {
      await db.from("notifications").insert({
        organisation_id: org, type: "ticket.reply", title: `Reply on #${existing.number} from ${m.fromName ?? m.fromEmail}`.slice(0, 200),
        body: (body ?? "").slice(0, 140), link: `/nerd-herd/tickets/${existing.id}`, entity_type: "support_ticket", entity_id: existing.id,
      });
    }
    return;
  }

  // New ticket: inbound, recent (not an old conversation being imported), and not a new sales lead from a stranger
  if (m.outbound) return;
  if (Date.parse(m.sentAt) < Date.now() - 7 * 86_400_000) return;
  if (m.enquiryCreated && !m.customerId) return;
  const subject = (m.subject?.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim() || `Email from ${m.fromName ?? m.fromEmail}`).slice(0, 300);
  let websiteId: string | null = null;
  if (m.customerId) {
    const { data: sites } = await db.from("websites").select("id, domain").eq("organisation_id", org).eq("customer_id", m.customerId).neq("status", "archived");
    const list = (sites ?? []) as { id: string; domain: string }[];
    const text = `${m.subject ?? ""} ${m.body}`.toLowerCase();
    websiteId = (list.length === 1 ? list[0] : list.find((s) => text.includes(s.domain)))?.id ?? null;
  }
  const { data: t, error } = await db.from("support_tickets").insert({
    organisation_id: org, customer_id: m.customerId, website_id: websiteId, subject, description: body, status: "new", source: "email",
    email_thread_id: m.threadId, last_activity_at: m.sentAt, created_by: null,
  }).select("id, number").single();
  if (error) throw new Error(`Couldn't open a ticket from the email: ${error.message}`);
  await db.from("support_ticket_updates").insert({
    organisation_id: org, ticket_id: t.id, kind: "email_in", body, public: true, author_id: null, author_name: m.fromName ?? m.fromEmail, email_message_id: msg?.id ?? null,
  });
  await db.from("notifications").insert({
    organisation_id: org, type: "ticket.new", title: `New ticket #${t.number} from ${m.fromName ?? m.fromEmail}`.slice(0, 200),
    body: subject.slice(0, 140), link: `/nerd-herd/tickets/${t.id}`, entity_type: "support_ticket", entity_id: t.id,
  });
}
