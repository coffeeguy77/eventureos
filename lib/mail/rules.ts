import "server-only";
import { classifyEmail, stripQuoted } from "@/lib/ai/classify";
import { classifyContextBase } from "@/lib/integrations/gmail-sync";
import { GMAIL_BASE, getMessage, header, listMessages, parseAddressList, parseMessage, type GmailMessage, type ParsedMessage } from "@/lib/integrations/gmail";
import { apiJSON, likeExact, saveIntegrationSettings, type SyncContext } from "@/lib/integrations/runtime";
import { todayISO } from "@/lib/format";
import { cleanQuery, cleanRules, ruleSearch, type MailRule } from "./rules-core";

/**
 * The second Gmail account: nothing comes in except emails matching the rules set for it. Each match becomes an
 * enquiry tagged with the rule's tag (or is added to the sender's open enquiry). Supplier invoices are read separately
 * by Pricing.
 */
interface Box { rules?: unknown; seen?: string[] }

export function mailboxRules(ctx: SyncContext): MailRule[] {
  return cleanRules((ctx.integration.settings as Box).rules, todayISO(ctx.org.timezone));
}

export interface PreviewRow { id: string; from: string; fromEmail: string; subject: string; date: string | null; snippet: string }

/** What a search matches in this mailbox (newest first) — shown before a rule is saved, like a Gmail filter. */
export async function previewSearch(ctx: SyncContext, query: string, days = 180): Promise<{ estimate: number; rows: PreviewRow[] }> {
  const q = cleanQuery(query);
  if (!q) throw new Error("Type what to look for.");
  const after = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const r = await apiJSON<{ messages?: { id: string }[]; resultSizeEstimate?: number }>(ctx,
    `${GMAIL_BASE}/messages?maxResults=25&q=${encodeURIComponent(ruleSearch(q, after))}`, {}, "Gmail messages.list");
  const ids = (r.messages ?? []).map((m) => m.id);
  const msgs = await Promise.all(ids.map((id) => apiJSON<GmailMessage>(ctx, `${GMAIL_BASE}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, {}, "Gmail messages.get").catch(() => null)));
  const rows = msgs.filter((m): m is GmailMessage => !!m).map((m) => {
    const from = parseAddressList(header(m, "From"))[0];
    return { id: m.id, from: from?.name ?? from?.email ?? "", fromEmail: from?.email ?? "", subject: header(m, "Subject") ?? "(no subject)", date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null, snippet: (m.snippet ?? "").slice(0, 200) };
  });
  return { estimate: Math.max(r.resultSizeEstimate ?? rows.length, rows.length), rows };
}

/** Bring in new matches for every rule that's on. Stops after ~40 s; the next run carries on. */
export async function runMailboxRules(ctx: SyncContext): Promise<{ message: string; created: number; tagged: number }> {
  const started = Date.now();
  const rules = mailboxRules(ctx).filter((r) => r.on);
  const box = ctx.integration.settings as Box;
  const seen = new Set<string>(Array.isArray(box.seen) ? box.seen : []);
  let created = 0, tagged = 0, more = false;
  if (!rules.length) return { message: "No rules switched on — nothing brought in.", created, tagged };
  for (const rule of rules) {
    const ids: string[] = [];
    let page: string | undefined;
    do {
      const r = await listMessages(ctx, ruleSearch(rule.query, rule.since), page, 100);
      ids.push(...(r.messages ?? []).map((m) => m.id));
      page = r.nextPageToken;
    } while (page && ids.length < 500);
    for (const id of ids.reverse()) {
      if (seen.has(id)) continue;
      if (Date.now() - started > 40_000) { more = true; break; }
      const pm = parseMessage(await getMessage(ctx, id));
      seen.add(id);
      if (seen.has(`t:${pm.threadId}`)) continue; // one enquiry per conversation
      seen.add(`t:${pm.threadId}`);
      const r = await enquiryFrom(ctx, rule, pm);
      if (r === "created") created++; else if (r === "tagged") tagged++;
    }
    if (more) break;
  }
  await saveIntegrationSettings(ctx, { seen: [...seen].slice(-4000) });
  const message = `${created} new enquir${created === 1 ? "y" : "ies"}${tagged ? `, ${tagged} added to open enquiries` : ""}${more ? " — more next time" : ""}.`;
  await ctx.db.from("integrations").update({ last_sync_at: new Date().toISOString(), last_sync_status: "success", last_error: null, status: "connected" }).eq("id", ctx.integration.id);
  return { message, created, tagged };
}

async function enquiryFrom(ctx: SyncContext, rule: MailRule, pm: ParsedMessage): Promise<"created" | "tagged" | "skipped"> {
  const db = ctx.db;
  const own = [ctx.integration.account_label?.toLowerCase(), ctx.org.contact_email?.toLowerCase()].filter(Boolean);
  if (own.includes(pm.from.email.toLowerCase())) return "skipped";
  const body = stripQuoted(pm.text) || pm.text;
  // details (name, date, guests…) read the same way as the main inbox; the rule has already said it's an enquiry
  const c = await classifyEmail({ subject: pm.subject, from_email: pm.from.email, from_name: pm.from.name, to: pm.to.map((a) => a.email), body: pm.text, received_at: pm.sentAt, headers: pm.headers },
    classifyContextBase(ctx), { allowAI: true }).catch(() => null);
  const x = c?.extracted ?? ({} as Record<string, unknown>);
  const email = (typeof x.email === "string" && c?.website_form ? x.email : pm.replyTo?.email ?? pm.from.email).toLowerCase();
  const tags = rule.tag ? [rule.tag] : [];
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: open } = await db.from("enquiries").select("id").eq("organisation_id", ctx.org.id).ilike("contact_email", likeExact(email))
    .in("status", ["new", "needs_review", "contacted", "qualified", "quote_required"]).gte("received_at", since).limit(1);
  if (open?.length) {
    if (tags.length) {
      const { data: t } = await db.from("enquiries").select("tags").eq("id", open[0].id).maybeSingle();
      const cur = ((t as { tags?: string[] } | null)?.tags) ?? [];
      if (t && !cur.includes(tags[0])) await db.from("enquiries").update({ tags: [...cur, ...tags] }).eq("id", open[0].id);
    }
    return "tagged";
  }
  const { data: cust } = await db.from("contacts").select("id, customer_id").eq("organisation_id", ctx.org.id).ilike("email", likeExact(email)).limit(1).maybeSingle();
  const who = (typeof x.name === "string" && x.name) || pm.from.name || email;
  const row = {
    organisation_id: ctx.org.id,
    title: (pm.subject?.trim() || `${rule.tag ?? "Enquiry"} — ${who}`).slice(0, 200),
    customer_id: cust?.customer_id ?? null, contact_id: cust?.id ?? null,
    contact_name: typeof x.name === "string" ? x.name : pm.from.name, contact_email: email, contact_phone: typeof x.phone === "string" ? x.phone : null, company: typeof x.company === "string" ? x.company : null,
    event_type: typeof x.event_type === "string" ? x.event_type : null, event_date: typeof x.event_date === "string" ? x.event_date : null,
    guest_count: typeof x.guest_count === "number" ? x.guest_count : null, budget: typeof x.budget === "number" ? x.budget : null, venue: typeof x.venue === "string" ? x.venue : null,
    message: `${body.slice(0, 4800)}\n\n— Came in to ${ctx.integration.account_label ?? "the second Gmail account"} (rule: ${rule.name})`,
    source: "email", status: "new", tags, received_at: pm.sentAt,
    classification: "event_enquiry", classification_confidence: 1,
    next_action: "Reply to the enquiry", next_action_due: new Date(Math.max(Date.parse(pm.sentAt), Date.now()) + 4 * 3_600_000).toISOString(),
  };
  let { error } = await db.from("enquiries").insert(row);
  // before the 0071 update there's no tags column: the enquiry still comes in
  if (error && /tags/.test(error.message)) { const { tags: _t, ...rest } = row; ({ error } = await db.from("enquiries").insert(rest)); }
  if (error) throw new Error(error.message);
  return "created";
}
