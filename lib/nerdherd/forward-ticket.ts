import "server-only";
import type { SyncContext } from "@/lib/integrations/runtime";
import type { ParsedMessage } from "@/lib/integrations/gmail";
import { parseForwarded } from "./forwarded";
import { readNerd } from "./core";

/**
 * Nerd Herd: an email forwarded to the support inbox by someone listed in Settings → "Forwarded emails become tickets"
 * (e.g. a staff member who's leaving) opens a ticket for the person who originally wrote, with their subject and
 * message — not for the forwarder. Returns a line for the sync log, or null when this email isn't one of those.
 */
export function forwarders(settings: unknown): string[] {
  const n = ((settings as { nerdherd?: { forward_from?: unknown } } | null)?.nerdherd ?? {}) as { forward_from?: unknown };
  return Array.isArray(n.forward_from) ? n.forward_from.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [];
}

export async function ticketFromForward(ctx: SyncContext, pm: ParsedMessage, getMatch: (email: string) => Promise<{ customerId: string | null }>): Promise<string | null> {
  const by = pm.from.email.trim().toLowerCase();
  if (!forwarders(ctx.org.settings).includes(by)) return null;
  const nerd = readNerd(ctx.org.settings);
  const db = ctx.db, org = ctx.org.id;

  // already turned into a ticket (the sync can see the same email twice)
  const { data: seen } = await db.from("support_ticket_updates").select("ticket_id").eq("organisation_id", org).eq("gmail_id", pm.gmailId).limit(1).maybeSingle();
  if (seen) return `Forwarded by ${by} — already ticket`;

  const f = parseForwarded(pm.text, pm.subject);
  const fromEmail = f?.fromEmail ?? by, fromName = f ? f.fromName : pm.from.name;
  const subject = (f?.subject || pm.subject?.replace(/^\s*((fw|fwd)\s*:\s*)+/i, "").trim() || `Email forwarded by ${pm.from.name ?? by}`).slice(0, 300);
  const original = (f?.body || pm.text || "").trim();
  const note = [
    `Forwarded by ${pm.from.name ?? by}${f?.date ? ` — originally sent ${f.date}` : ""}.`,
    f?.note ? `Their note: ${f.note}` : null,
    f ? null : "The original sender couldn't be read from the forward, so this ticket is under the forwarder — check the email below.",
  ].filter(Boolean).join("\n");
  const body = `${original}\n\n— ${note}`.slice(0, 20000);

  // the client: matched by email (as for any email), otherwise added as a new client
  let customerId = f ? (await getMatch(fromEmail)).customerId : null;
  if (f && !customerId) {
    const { data: c, error } = await db.from("customers").insert({ organisation_id: org, kind: "individual", name: fromName ?? fromEmail, email: fromEmail, source: "other", notes: `Added from an email forwarded by ${by}.` }).select("id").single();
    if (error) throw new Error(`Couldn't add ${fromEmail} as a client: ${error.message}`);
    customerId = c.id as string;
  }
  let websiteId: string | null = null;
  if (customerId) {
    const { data: sites } = await db.from("websites").select("id, domain").eq("organisation_id", org).eq("customer_id", customerId).neq("status", "archived");
    const list = (sites ?? []) as { id: string; domain: string }[];
    const text = `${subject} ${original}`.toLowerCase();
    websiteId = (list.length === 1 ? list[0] : list.find((s) => text.includes(s.domain)))?.id ?? null;
  }
  const { data: t, error } = await db.from("support_tickets").insert({
    organisation_id: org, customer_id: customerId, website_id: websiteId, subject, description: body, status: "new", source: "email",
    last_activity_at: pm.sentAt, created_by: null, assigned_to: nerd.defaultAssignee,
  }).select("id, number").single();
  if (error) throw new Error(`Couldn't open a ticket from the forwarded email: ${error.message}`);
  await db.from("support_ticket_updates").insert({
    organisation_id: org, ticket_id: t.id, kind: "email_in", body, public: true, author_id: null, author_name: fromName ?? fromEmail, gmail_id: pm.gmailId,
  });
  await db.from("notifications").insert({
    organisation_id: org, type: "ticket.new", title: `New ticket #${t.number} from ${fromName ?? fromEmail} (forwarded by ${pm.from.name ?? by})`.slice(0, 200),
    body: subject.slice(0, 140), link: `/nerd-herd/tickets/${t.id}`, entity_type: "support_ticket", entity_id: t.id,
  });
  const { alertStaff } = await import("./mail");
  await alertStaff(db, org, t.id as string, `New ticket from ${fromName ?? fromEmail} (forwarded)`, [subject, original.slice(0, 600)]);
  return `Forwarded by ${by} — ticket #${t.number} for ${fromEmail}`;
}
