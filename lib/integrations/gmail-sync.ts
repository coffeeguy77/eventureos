import "server-only";
import {
  AUTO_ENQUIRY_THRESHOLD, classifyEmail, stripQuoted,
  type Classification, type ClassificationResult, type ClassifyContext,
} from "@/lib/ai/classify";
import { evaluateFilter, gmailQueryFor, resolveFilter, type EmailFilterSettings } from "@/lib/integrations/email-filter";
import { getMessage, gmailProfile, listHistory, listMessages, parseMessage, type ParsedMessage } from "@/lib/integrations/gmail";
import {
  ApiError, RateLimited, errMessage, finishSyncLog, likeExact, logIntegration, saveIntegrationSettings, startSyncLog, type SyncContext,
} from "@/lib/integrations/runtime";

/**
 * Gmail → EventureOS sync. Gmail stays the source of truth; we keep copies of relevant conversations.
 *
 * For each new message:
 *  1. identify the sender (the customer inside website-form notifications)
 *  2. match them to a contact/customer by email
 *  3. if the Gmail thread is already tracked → attach to it (and its event/enquiry)
 *  4. otherwise classify it (rules, + Claude when configured) and
 *       - event enquiry ≥ 75%       → new enquiry (status "new")
 *       - probable enquiry, < 75%   → new enquiry in NEEDS REVIEW
 *       - existing event / quote    → attach to the customer's open event when unambiguous
 *       - spam                      → stored, thread closed (never deleted)
 *       - anything uncertain        → thread flagged needs review / needs reply — never discarded
 */

export interface GmailSettings extends EmailFilterSettings {
  history_id?: string;
  /** Gmail ids the filter skipped during an unfinished first sync (so the next run doesn't re-fetch them). */
  skipped_ids?: string[];
  ai_enabled?: boolean;
  initial_days?: number;
  import_months?: number;
  import_page_token?: string | null;
  /** The Gmail search the saved import position belongs to. */
  import_query?: string;
  import_scanned?: number;
  import_last_run_at?: string;
}

const MAX_MESSAGES_PER_RUN = 150;
const TIME_BUDGET_MS = 45_000;

export interface GmailSyncResult { processed: number; skipped: number; filtered: number; enquiries: number; review: number; partial: boolean; message: string }

export function gmailSettings(ctx: SyncContext): GmailSettings {
  return (ctx.integration.settings ?? {}) as GmailSettings;
}

export function ownAddresses(ctx: SyncContext): string[] {
  const own = [ctx.integration.account_label, ctx.integration.external_account_id, ctx.org.contact_email]
    .filter((x): x is string => !!x && x.includes("@")).map((x) => x.toLowerCase());
  return [...new Set(own)];
}

export function classifyContextBase(ctx: SyncContext): ClassifyContext {
  const s = gmailSettings(ctx);
  const own = ownAddresses(ctx);
  return {
    timezone: ctx.org.timezone,
    own_emails: [...own, ...own.map((e) => "@" + e.split("@")[1]).filter((d) => !/@(gmail|googlemail|outlook|hotmail)\.com$/.test(d))],
    website_subject_patterns: s.website_subject_patterns ?? [],
    website_form_senders: s.website_form_senders ?? [],
  };
}

// ------------------------------------------------------------------------------------------------
// Matching senders to CRM records
// ------------------------------------------------------------------------------------------------

export interface SenderMatch {
  customerId: string | null;
  contactId: string | null;
  customerName: string | null;
  openEvents: { id: string; name: string; event_date: string | null }[];
  openQuoteEventIds: string[];
  knownSupplier: boolean;
}

export async function matchSender(ctx: SyncContext, email: string, cache: Map<string, SenderMatch>): Promise<SenderMatch> {
  const key = email.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const db = ctx.db;
  const m: SenderMatch = { customerId: null, contactId: null, customerName: null, openEvents: [], openQuoteEventIds: [], knownSupplier: false };
  const { data: contact } = await db.from("contacts").select("id, customer_id").eq("organisation_id", ctx.org.id).ilike("email", likeExact(key)).limit(1).maybeSingle();
  if (contact) { m.contactId = contact.id; m.customerId = contact.customer_id; }
  else {
    const { data: cust } = await db.from("customers").select("id").eq("organisation_id", ctx.org.id).ilike("email", likeExact(key)).limit(1).maybeSingle();
    if (cust) m.customerId = cust.id;
  }
  if (m.customerId) {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: cust }, { data: events }, { data: quotes }] = await Promise.all([
      db.from("customers").select("name, tags").eq("id", m.customerId).single(),
      db.from("events").select("id, name, event_date").eq("organisation_id", ctx.org.id).eq("customer_id", m.customerId)
        .not("status", "in", "(completed,cancelled)").or(`event_date.is.null,event_date.gte.${today}`).order("event_date", { nullsFirst: false }),
      db.from("quotes").select("event_id").eq("organisation_id", ctx.org.id).eq("customer_id", m.customerId).in("status", ["sent", "viewed"]),
    ]);
    m.customerName = cust?.name ?? null;
    m.knownSupplier = ((cust?.tags as string[] | null) ?? []).some((t) => /supplier|vendor/i.test(t));
    m.openEvents = (events ?? []) as SenderMatch["openEvents"];
    m.openQuoteEventIds = ((quotes ?? []) as { event_id: string }[]).map((q) => q.event_id);
  } else {
    // A sender we've previously filed as a supplier stays a supplier
    const { data: prev } = await db.from("email_threads").select("id").eq("organisation_id", ctx.org.id)
      .eq("classification", "supplier").contains("participants", [key]).limit(1);
    m.knownSupplier = !!prev?.length;
  }
  cache.set(key, m);
  return m;
}

// ------------------------------------------------------------------------------------------------
// Main sync
// ------------------------------------------------------------------------------------------------

export async function syncGmail(ctx: SyncContext): Promise<GmailSyncResult> {
  const logId = await startSyncLog(ctx, "email");
  const started = Date.now();
  const s = gmailSettings(ctx);
  const result: GmailSyncResult = { processed: 0, skipped: 0, filtered: 0, enquiries: 0, review: 0, partial: false, message: "" };
  const filter = resolveFilter(s);
  const skippedIds = new Set(s.skipped_ids ?? []);
  try {
    // 1. Which messages are new?
    let refs: { id: string; threadId: string }[] = [];
    let nextHistoryId: string | null = null;
    let mode = "incremental";
    if (s.history_id) {
      try {
        let page: string | undefined;
        do {
          const h = await listHistory(ctx, s.history_id, page);
          for (const rec of h.history ?? []) for (const a of rec.messagesAdded ?? []) {
            const labels = a.message.labelIds ?? [];
            if (labels.includes("DRAFT") || labels.includes("CHAT")) continue;
            refs.push({ id: a.message.id, threadId: a.message.threadId });
          }
          nextHistoryId = h.historyId ?? nextHistoryId;
          page = h.nextPageToken;
        } while (page);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
        mode = "full (history expired)";
        refs = [];
      }
    }
    if (!s.history_id || mode.startsWith("full")) {
      if (mode === "incremental") mode = "initial";
      const profile = await gmailProfile(ctx);
      nextHistoryId = profile.historyId;
      const days = Math.max(1, Math.min(60, Number(s.initial_days ?? 14)));
      let page: string | undefined;
      do {
        // Only list likely matches (the local filter still decides) — see email-filter.ts
        const narrow = gmailQueryFor(filter);
        const r = await listMessages(ctx, `newer_than:${days}d -in:chats -in:drafts -in:spam${narrow ? " " + narrow : ""}`, page, 100);
        refs.push(...(r.messages ?? []));
        page = r.nextPageToken;
      } while (page && refs.length < 1000);
    }

    // de-duplicate and drop messages we already have
    const seen = new Set<string>();
    refs = refs.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    const existing = new Set<string>();
    for (let i = 0; i < refs.length; i += 200) {
      const ids = refs.slice(i, i + 200).map((r) => r.id);
      const { data } = await ctx.db.from("email_messages").select("gmail_message_id").eq("organisation_id", ctx.org.id).in("gmail_message_id", ids);
      for (const d of data ?? []) existing.add(d.gmail_message_id as string);
    }
    const todo = refs.filter((r) => !existing.has(r.id) && !skippedIds.has(r.id));
    result.skipped = refs.length - todo.length;

    // 2. Fetch + parse (oldest first so threads build in order)
    const parsed: ParsedMessage[] = [];
    let rateLimited = false;
    for (const r of todo.slice(0, MAX_MESSAGES_PER_RUN)) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      try { parsed.push(parseMessage(await getMessage(ctx, r.id))); }
      catch (e) {
        if (e instanceof RateLimited) { rateLimited = true; break; } // keep what we have; the rest comes next sync
        if (!(e instanceof ApiError && e.status === 404)) throw e; // 404 = deleted since listed
      }
    }
    parsed.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    result.partial = parsed.length < todo.length;

    // 3. Process
    const cache = new Map<string, SenderMatch>();
    for (const pm of parsed) {
      const out = await ingestMessage(ctx, pm, cache);
      if (out.filtered) { result.filtered++; skippedIds.add(pm.gmailId); continue; }
      result.processed++;
      if (out.enquiryCreated) result.enquiries++;
      if (out.review) result.review++;
    }

    // 4. Only move the history pointer when everything listed was handled; otherwise the next run
    //    re-reads the same range (duplicates are skipped by gmail_message_id).
    //    (A first sync that is too big for one run simply continues from the same 14-day window next time.)
    if (!result.partial && nextHistoryId) await saveIntegrationSettings(ctx, { history_id: nextHistoryId, skipped_ids: [] });
    else if (result.filtered) await saveIntegrationSettings(ctx, { skipped_ids: [...skippedIds].slice(-3000) });

    result.message = `${mode === "incremental" ? "Checked new mail" : `First sync (${mode})`}: ${result.processed} new message${result.processed === 1 ? "" : "s"} saved` +
      (result.enquiries ? `, ${result.enquiries} enquir${result.enquiries === 1 ? "y" : "ies"} created` : "") +
      (result.review ? `, ${result.review} need review` : "") +
      (result.filtered ? `, ${result.filtered} skipped by your email filters` : "") +
      (result.partial ? `. ${todo.length - parsed.length} more will be fetched on the next sync${rateLimited ? " (Gmail asked us to slow down)" : ""}.` : ".");
    await finishSyncLog(ctx, logId, result.partial ? "partial" : "success", result.processed, result.message);
    if (result.processed) {
      await logIntegration(ctx, { action: "email.synced", entityType: "integration", entityId: ctx.integration.id, summary: result.message });
    }
    return result;
  } catch (e) {
    await finishSyncLog(ctx, logId, "error", result.processed, `Gmail sync failed: ${errMessage(e)}`);
    throw e;
  }
}

// ------------------------------------------------------------------------------------------------
// One message
// ------------------------------------------------------------------------------------------------

interface ThreadRow {
  id: string; subject: string | null; classification: Classification; state: string; participants: string[];
  message_count: number; last_message_at: string | null; last_inbound_at: string | null;
  customer_id: string | null; event_id: string | null; enquiry_id: string | null; extracted: Record<string, unknown> | null;
}

export async function ingestMessage(ctx: SyncContext, pm: ParsedMessage, cache: Map<string, SenderMatch>) {
  const db = ctx.db;
  const own = ownAddresses(ctx);
  const outbound = pm.labelIds.includes("SENT") || own.includes(pm.from.email);
  const res = { enquiryCreated: false, review: false, threadId: "", filtered: false, filterReason: "" };

  let { data: thread } = await db.from("email_threads")
    .select("id, subject, classification, state, participants, message_count, last_message_at, last_inbound_at, customer_id, event_id, enquiry_id, extracted")
    .eq("organisation_id", ctx.org.id).eq("gmail_thread_id", pm.threadId).maybeSingle() as { data: ThreadRow | null };

  // Replies that Gmail filed in a different thread still come back to the same conversation via In-Reply-To.
  if (!thread && pm.inReplyTo) {
    const { data: parent } = await db.from("email_messages").select("thread_id").eq("organisation_id", ctx.org.id)
      .eq("rfc_message_id", pm.inReplyTo.trim()).limit(1).maybeSingle();
    if (parent) {
      const { data: t } = await db.from("email_threads")
        .select("id, subject, classification, state, participants, message_count, last_message_at, last_inbound_at, customer_id, event_id, enquiry_id, extracted")
        .eq("id", parent.thread_id).maybeSingle();
      thread = (t as ThreadRow | null) ?? null;
    }
  }

  const bodyClean = stripQuoted(pm.text) || pm.text;
  const externalParty = outbound ? pm.to.find((a) => !own.includes(a.email)) ?? pm.to[0] ?? null : pm.from;

  // New conversation: only import it if it passes the organisation's email filters
  if (!thread) {
    const people = [externalParty?.email, !outbound && pm.replyTo && !own.includes(pm.replyTo.email) ? pm.replyTo.email : null]
      .filter((x): x is string => !!x);
    let knownPerson = false;
    for (const p of people) if ((await matchSender(ctx, p, cache)).customerId) { knownPerson = true; break; }
    const d = evaluateFilter(resolveFilter(gmailSettings(ctx)), {
      subject: pm.subject, from_email: pm.from.email, body: pm.text, headers: pm.headers, knownPerson,
    });
    if (!d.import) return { ...res, filtered: true, filterReason: d.reason };
  }

  if (!thread) {
    const created = outbound
      ? await createOutboundThread(ctx, pm, externalParty?.email ?? null, cache)
      : await createInboundThread(ctx, pm, bodyClean, cache);
    thread = created.thread;
    res.enquiryCreated = created.enquiryCreated;
    res.review = created.review;
  }
  res.threadId = thread.id;

  // insert the message (idempotent on gmail_message_id)
  const { error: mErr } = await db.from("email_messages").upsert({
    organisation_id: ctx.org.id,
    thread_id: thread.id,
    gmail_message_id: pm.gmailId,
    rfc_message_id: pm.messageId,
    reply_to: pm.replyTo?.email ?? null,
    direction: outbound ? "outbound" : "inbound",
    from_email: pm.from.email,
    from_name: pm.from.name,
    to_emails: pm.to.map((a) => a.email),
    cc_emails: pm.cc.map((a) => a.email),
    subject: pm.subject,
    snippet: bodyClean.replace(/\s+/g, " ").slice(0, 280),
    body_text: bodyClean.slice(0, 20000),
    sent_at: pm.sentAt,
    is_read: outbound || !pm.labelIds.includes("UNREAD"),
  }, { onConflict: "organisation_id,gmail_message_id", ignoreDuplicates: true });
  if (mErr) throw new Error(`Could not save email: ${mErr.message}`);

  // thread aggregates + state
  const participants = new Set(thread.participants);
  for (const a of [pm.from, ...pm.to, ...pm.cc]) if (a && !own.includes(a.email)) participants.add(a.email);
  const newer = !thread.last_message_at || pm.sentAt >= thread.last_message_at;
  const bulk = pm.headers.list_unsubscribe || (pm.headers.precedence ?? "").match(/bulk|list/i);
  let state = thread.state;
  if (thread.classification === "spam") state = "closed";
  else if (newer) state = outbound ? "awaiting_customer" : bulk ? "open" : "needs_reply";
  const patch: Record<string, unknown> = {
    message_count: thread.message_count + 1,
    participants: [...participants],
    state,
  };
  if (newer) patch.last_message_at = pm.sentAt;
  if (!outbound && (!thread.last_inbound_at || pm.sentAt > thread.last_inbound_at)) patch.last_inbound_at = pm.sentAt;
  if (!thread.customer_id && externalParty) {
    const m = await matchSender(ctx, externalParty.email, cache);
    if (m.customerId) patch.customer_id = m.customerId;
  }
  const { error: tErr } = await db.from("email_threads").update(patch).eq("id", thread.id);
  if (tErr) throw new Error(`Could not update email thread: ${tErr.message}`);

  // keep the enquiry's "last contact" current when we reply from Gmail directly
  if (outbound && thread.enquiry_id) {
    await db.from("enquiries").update({ last_contact_at: pm.sentAt }).eq("id", thread.enquiry_id).or(`last_contact_at.is.null,last_contact_at.lt.${pm.sentAt}`);
  }
  // A reply from the customer on an existing thread: tell the team
  if (!outbound && thread.message_count > 0 && thread.classification !== "spam" && !bulk) {
    await db.from("notifications").insert({
      organisation_id: ctx.org.id, type: "email.reply", title: `Reply from ${pm.from.name ?? pm.from.email}`,
      body: bodyClean.slice(0, 140), link: thread.event_id ? `/events/${thread.event_id}?tab=communication` : thread.enquiry_id ? `/enquiries/${thread.enquiry_id}` : "/settings/integrations/review",
      entity_type: "email_thread", entity_id: thread.id,
    });
    await logIntegration(ctx, {
      action: "email.received", entityType: "email_thread", entityId: thread.id,
      summary: `Email reply from ${pm.from.name ?? pm.from.email}: “${(pm.subject ?? "").slice(0, 80)}”`,
      customerId: thread.customer_id ?? (patch.customer_id as string | undefined) ?? null, eventId: thread.event_id, enquiryId: thread.enquiry_id,
    });
  }
  return res;
}

async function createOutboundThread(ctx: SyncContext, pm: ParsedMessage, counterpart: string | null, cache: Map<string, SenderMatch>) {
  const m = counterpart ? await matchSender(ctx, counterpart, cache) : null;
  const eventId = m && m.openEvents.length === 1 ? m.openEvents[0].id : null;
  const classification: Classification = eventId ? (m!.openQuoteEventIds.includes(eventId) ? "quote_discussion" : "existing_event") : "general_email";
  const { data, error } = await ctx.db.from("email_threads").insert({
    organisation_id: ctx.org.id, integration_id: ctx.integration.id, gmail_thread_id: pm.threadId, subject: pm.subject,
    customer_id: m?.customerId ?? null, event_id: eventId,
    classification, classification_confidence: eventId ? 0.8 : 0.7, classified_by: "rules",
    classification_reasons: [eventId ? "Sent by you to a customer with one open event" : "Conversation started by you"],
    state: "awaiting_customer", participants: counterpart ? [counterpart] : [], message_count: 0,
  }).select("id, subject, classification, state, participants, message_count, last_message_at, last_inbound_at, customer_id, event_id, enquiry_id, extracted").single();
  if (error) throw new Error(`Could not create email thread: ${error.message}`);
  return { thread: data as ThreadRow, enquiryCreated: false, review: false };
}

async function createInboundThread(ctx: SyncContext, pm: ParsedMessage, bodyClean: string, cache: Map<string, SenderMatch>) {
  const db = ctx.db;
  const base = classifyContextBase(ctx);
  // Website form notifications carry the customer in the body / Reply-To.
  const preliminary = await classifyEmail(
    { subject: pm.subject, from_email: pm.from.email, from_name: pm.from.name, to: pm.to.map((a) => a.email), body: pm.text, received_at: pm.sentAt, headers: pm.headers },
    base, { allowAI: false },
  );
  const customerEmail = preliminary.website_form
    ? (preliminary.extracted.email ?? (pm.replyTo && !ownAddresses(ctx).includes(pm.replyTo.email) ? pm.replyTo.email : null))
    : pm.from.email;
  const m = customerEmail ? await matchSender(ctx, customerEmail, cache) : null;

  const ctxFull: ClassifyContext = {
    ...base,
    known_customer: !!m?.customerId,
    customer_has_open_event: !!m?.openEvents.length,
    customer_has_open_quote: !!m?.openQuoteEventIds.length,
    known_supplier: m?.knownSupplier,
  };
  const gmailSpam = pm.labelIds.includes("SPAM");
  let c: ClassificationResult = preliminary.website_form ? preliminary
    : await classifyEmail(
      { subject: pm.subject, from_email: pm.from.email, from_name: pm.from.name, to: pm.to.map((a) => a.email), body: pm.text, received_at: pm.sentAt, headers: pm.headers },
      ctxFull, { allowAI: gmailSettings(ctx).ai_enabled !== false },
    );
  if (gmailSpam && c.classification !== "spam") {
    c = { ...c, classification: "spam", confidence: Math.max(c.confidence, 0.9), reasons: ["Gmail filed this message as spam", ...c.reasons] };
  }
  if (preliminary.website_form && customerEmail) c.extracted.email = customerEmail;

  // Link to an event when it is unambiguous
  let eventId: string | null = null;
  if (m && (c.classification === "existing_event" || c.classification === "quote_discussion")) {
    const quoted = m.openEvents.filter((e) => m.openQuoteEventIds.includes(e.id));
    if (c.classification === "quote_discussion" && quoted.length === 1) eventId = quoted[0].id;
    else if (m.openEvents.length === 1) eventId = m.openEvents[0].id;
    else if (m.openEvents.length > 1) c.reasons.push(`Customer has ${m.openEvents.length} open events — link this conversation to the right one`);
  }

  // Create an enquiry for (probable) new event enquiries
  let enquiryId: string | null = null;
  let enquiryCreated = false;
  const wantsEnquiry = c.classification === "event_enquiry" || (c.classification === "needs_review" && c.best_guess === "event_enquiry");
  if (wantsEnquiry) {
    const status = c.classification === "event_enquiry" && c.confidence >= AUTO_ENQUIRY_THRESHOLD ? "new" : "needs_review";
    // Don't create a duplicate if this person already has an open enquiry from the last 30 days
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const contactEmail = c.extracted.email ?? customerEmail;
    const { data: dup } = contactEmail
      ? await db.from("enquiries").select("id").eq("organisation_id", ctx.org.id).ilike("contact_email", likeExact(contactEmail))
          .in("status", ["new", "needs_review", "contacted", "qualified", "quote_required"]).gte("received_at", since).limit(1)
      : { data: [] as { id: string }[] };
    if (dup?.length) {
      enquiryId = dup[0].id;
      c.reasons.push("Attached to this person's open enquiry instead of creating a duplicate");
    } else {
      const x = c.extracted;
      const who = x.name ?? contactEmail ?? pm.from.email;
      const title = preliminary.website_form && pm.subject
        ? pm.subject.replace(/^(new\s+)?(website\s+)?(enquiry|inquiry|form submission|submission)\s*[:\-–—]\s*/i, "").trim() || `${x.event_type ?? "Website"} enquiry`
        : x.event_type ? `${x.event_type} enquiry — ${who}` : pm.subject?.slice(0, 120) || `Enquiry from ${who}`;
      const { data: enq, error } = await db.from("enquiries").insert({
        organisation_id: ctx.org.id,
        title: title.slice(0, 200),
        customer_id: m?.customerId ?? null,
        contact_id: m?.contactId ?? null,
        contact_name: x.name, contact_email: contactEmail, contact_phone: x.phone, company: x.company,
        event_type: x.event_type, event_date: x.event_date, guest_count: x.guest_count, budget: x.budget, venue: x.venue,
        message: bodyClean.slice(0, 5000),
        source: preliminary.website_form ? "website" : "email",
        status,
        classification: c.classification,
        classification_confidence: c.confidence,
        received_at: pm.sentAt,
        next_action: status === "new" ? "Reply to the enquiry" : "Check this email and confirm it's an enquiry",
        next_action_due: new Date(Math.max(Date.parse(pm.sentAt), Date.now()) + 4 * 3600000).toISOString(),
      }).select("id, number").single();
      if (error) throw new Error(`Could not create enquiry from email: ${error.message}`);
      enquiryId = enq.id;
      enquiryCreated = true;
      await db.from("notifications").insert({
        organisation_id: ctx.org.id, type: status === "new" ? "enquiry.new" : "enquiry.needs_review",
        title: status === "new" ? `New enquiry from ${who}` : `Enquiry needs review — ${who}`,
        body: bodyClean.slice(0, 140), link: `/enquiries/${enq.id}`, entity_type: "enquiry", entity_id: enq.id,
      });
      await logIntegration(ctx, {
        action: "enquiry.created", entityType: "enquiry", entityId: enq.id, enquiryId: enq.id, customerId: m?.customerId ?? null,
        summary: `Enquiry ENQ-${enq.number} created from email — ${who} (${c.provider === "ai" ? "AI" : "rules"}: ${c.classification.replace("_", " ")} ${Math.round(c.confidence * 100)}%)`,
        metadata: { reasons: c.reasons },
      });
    }
  }

  const { data, error } = await db.from("email_threads").insert({
    organisation_id: ctx.org.id, integration_id: ctx.integration.id, gmail_thread_id: pm.threadId, subject: pm.subject,
    customer_id: m?.customerId ?? null, event_id: eventId, enquiry_id: enquiryId,
    classification: c.classification, classification_confidence: c.confidence, classified_by: c.provider,
    classification_reasons: c.reasons.slice(0, 8),
    extracted: { ...c.extracted, website_form: !!c.website_form, best_guess: c.best_guess ?? null },
    state: c.classification === "spam" ? "closed" : "open", participants: [], message_count: 0,
  }).select("id, subject, classification, state, participants, message_count, last_message_at, last_inbound_at, customer_id, event_id, enquiry_id, extracted").single();
  if (error) throw new Error(`Could not create email thread: ${error.message}`);

  if (!enquiryCreated) {
    await logIntegration(ctx, {
      action: "email.classified", entityType: "email_thread", entityId: data.id, customerId: m?.customerId ?? null, eventId, enquiryId,
      summary: `Email from ${pm.from.name ?? pm.from.email} filed as ${c.classification.replace("_", " ")} (${Math.round(c.confidence * 100)}%)`,
      metadata: { reasons: c.reasons, provider: c.provider },
    });
  }
  return { thread: data as ThreadRow, enquiryCreated, review: c.classification === "needs_review" };
}
