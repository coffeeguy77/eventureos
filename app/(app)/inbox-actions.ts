"use server";

import { revalidatePath } from "next/cache";
import { fillCustomerFromEnquiry } from "@/lib/customers/from-enquiry";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { buildRawMessage, sendGmail } from "@/lib/integrations/gmail-send";
import { replyTarget } from "@/lib/email/thread-reply";
import { ApiError, errMessage } from "@/lib/integrations/runtime";
import { buildContext } from "@/lib/integrations/sync-runner";
import { ownAddresses } from "@/lib/integrations/gmail-sync";
import { signatureForSend } from "@/lib/signatures/server";
import { textToHtml } from "@/lib/signatures/render";

export type ReplyState = { error?: string; ok?: boolean; sentTo?: string } | undefined;

/**
 * Reply to an email thread from EventureOS. The message is sent through the organisation's connected
 * Gmail account (so it also exists in Gmail's Sent folder and in the same Gmail thread), then stored
 * on the thread and logged.
 */
export async function sendReply(threadId: string, _prev: ReplyState, form: FormData): Promise<ReplyState> {
  const text = String(form.get("body") ?? "").trim();
  if (!text) return { error: "Write a message first." };
  if (text.length > 20000) return { error: "That message is too long to send from here — use Gmail." };

  const { supabase, org, user, profile } = await requireOrg();
  let ctx;
  try { ctx = await buildContext(supabase, "user", org.id, "gmail", user.id); }
  catch { return { error: "Gmail isn't connected. Connect it in Settings → Integrations to reply from EventureOS." }; }
  const from = ctx.integration.account_label ?? ctx.integration.external_account_id;
  if (!from) return { error: "The connected Gmail account has no address — reconnect Gmail." };

  const target = await replyTarget(supabase, org.id, threadId, ownAddresses(ctx));
  if (!target) return { error: "That conversation couldn't be found." };
  const { thread, to, subject, inReplyTo, references } = target;
  // Copied in: the job people in this conversation, minus anyone the sender took off
  const keepCc = new Set(form.getAll("cc").map((v) => String(v).toLowerCase()));
  const cc = form.has("cc_shown") ? target.cc.filter((e) => keepCc.has(e)) : target.cc;
  if (!to) return { error: "Couldn't work out who to reply to — reply from Gmail for this one." };
  const fromName = profile.full_name ? `${profile.full_name} · ${org.name}` : org.name;

  // The company signature (once published): full on our first signed email in this conversation, short after that.
  // Only this message is signed — earlier messages aren't quoted, so a thread never collects repeated signatures.
  let sig: Awaited<ReturnType<typeof signatureForSend>> = null;
  if (form.get("signature") !== "off") {
    try { sig = await signatureForSend(supabase, org.id, user.id, thread.id); }
    catch (e) { return { error: `Couldn't add your signature: ${errMessage(e)}. Untick “Add my signature” to send without it.` }; }
  }
  const bodyText = sig ? `${text}\n\n-- \n${sig.text}` : text;
  const bodyHtml = sig
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">${textToHtml(text)}<div style="margin-top:16px;">${sig.html}</div></div>`
    : null;

  let sent: Awaited<ReturnType<typeof sendGmail>>;
  let gmailThreadId: string | null = thread.gmail_thread_id;
  try {
    const raw = buildRawMessage({ from, fromName, to: [to], cc, subject, inReplyTo, references, text: bodyText, html: bodyHtml });
    try {
      sent = await sendGmail(ctx, raw, gmailThreadId);
    } catch (e) {
      // The thread may not exist in this Gmail account (e.g. demo data or a different mailbox) → start a new Gmail thread.
      if (gmailThreadId && e instanceof ApiError && (e.status === 404 || e.status === 400)) sent = await sendGmail(ctx, raw, null);
      else throw e;
    }
  } catch (e) {
    return { error: `Gmail didn't send the reply: ${errMessage(e)}` };
  }
  gmailThreadId = sent.threadId;
  const now = new Date().toISOString();

  const { error: mErr } = await supabase.from("email_messages").insert({
    organisation_id: org.id, thread_id: thread.id, gmail_message_id: sent.id, rfc_message_id: sent.messageId,
    direction: "outbound", from_email: from.toLowerCase(), from_name: fromName, to_emails: [to], cc_emails: cc, subject,
    snippet: text.replace(/\s+/g, " ").slice(0, 280), body_text: bodyText, body_html: bodyHtml, signature_version: sig?.version ?? null,
    sent_at: now, is_read: true, sent_by: user.id,
  });
  if (mErr) return { error: `Sent from Gmail, but couldn't save it here: ${mErr.message}. It will appear after the next sync.` };
  // A saved draft has now been used (or replaced by what was sent) — clear it
  const { data: exRow } = await supabase.from("email_threads").select("extracted").eq("id", thread.id).maybeSingle();
  const ex = (exRow?.extracted ?? null) as Record<string, unknown> | null;
  const { error: uErr } = await supabase.from("email_threads").update({
    gmail_thread_id: gmailThreadId, state: "awaiting_customer", last_message_at: now, message_count: thread.message_count + 1,
    ...(ex && "reply_draft" in ex ? { extracted: Object.fromEntries(Object.entries(ex).filter(([k]) => k !== "reply_draft")) } : {}),
  }).eq("id", thread.id);
  if (uErr) return { error: `Sent, but couldn't update the conversation: ${uErr.message}` };

  if (thread.enquiry_id) {
    const { data: enq } = await supabase.from("enquiries").select("status, number").eq("id", thread.enquiry_id).maybeSingle();
    const patch: Record<string, unknown> = { last_contact_at: now };
    if (enq?.status === "new" || enq?.status === "needs_review") patch.status = "contacted";
    await supabase.from("enquiries").update(patch).eq("id", thread.enquiry_id).eq("organisation_id", org.id);
    if (patch.status) {
      await logActivity(supabase, {
        orgId: org.id, actorId: user.id, action: "enquiry.status_changed", entityType: "enquiry", entityId: thread.enquiry_id,
        enquiryId: thread.enquiry_id, customerId: thread.customer_id, eventId: thread.event_id,
        summary: `ENQ-${enq!.number} marked Contacted after ${actorName(profile)} replied`,
        changes: { status: [enq!.status, "contacted"] },
      });
    }
  }

  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "email.sent", entityType: "email_thread", entityId: thread.id,
    eventId: thread.event_id, enquiryId: thread.enquiry_id, customerId: thread.customer_id,
    summary: `${actorName(profile)} replied to ${to} — “${subject.slice(0, 80)}” (sent via Gmail)`,
  });

  if (thread.event_id) revalidatePath(`/events/${thread.event_id}`);
  if (thread.enquiry_id) revalidatePath(`/enquiries/${thread.enquiry_id}`);
  if (thread.customer_id) revalidatePath(`/clients/${thread.customer_id}`);
  revalidatePath("/dashboard");
  return { ok: true, sentTo: to };
}

export type DraftState = { ok: true; body: string; notes: string[] } | { ok: false; error: string };

/** Throw away a saved reply draft (e.g. one prepared overnight) without sending it. */
export async function discardSavedDraft(threadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) return { ok: false, error: "That conversation link isn't valid." };
  const { supabase, org, user, profile } = await requireOrg();
  const { data: t } = await supabase.from("email_threads").select("id, extracted, enquiry_id, event_id, customer_id").eq("id", threadId).eq("organisation_id", org.id).maybeSingle();
  if (!t) return { ok: false, error: "That conversation couldn't be found." };
  const ex = (t.extracted ?? {}) as Record<string, unknown>;
  if (!("reply_draft" in ex)) return { ok: true };
  const { error } = await supabase.from("email_threads").update({ extracted: Object.fromEntries(Object.entries(ex).filter(([k]) => k !== "reply_draft")) }).eq("id", t.id);
  if (error) return { ok: false, error: `Couldn't discard the draft: ${error.message}` };
  await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "email.draft_discarded", entityType: "email_thread", entityId: t.id,
    enquiryId: t.enquiry_id, eventId: t.event_id, customerId: t.customer_id, summary: `${actorName(profile)} discarded a saved reply draft` });
  if (t.enquiry_id) revalidatePath(`/enquiries/${t.enquiry_id}`);
  if (t.event_id) revalidatePath(`/events/${t.event_id}`);
  revalidatePath("/enquiries");
  return { ok: true };
}

/** AI draft for the reply box — never sent automatically. */
export async function draftReplyAction(threadId: string): Promise<DraftState> {
  try {
    const { supabase, org, profile } = await requireOrg();
    const { draftReply } = await import("@/lib/ai/reply");
    const r = await draftReply(supabase, { id: org.id, name: org.name, timezone: org.timezone, currency: org.currency }, threadId,
      profile.full_name?.split(" ")[0] ?? org.name);
    return { ok: true, body: r.body, notes: r.notes };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

export type SignaturePreviewState =
  | { ok: true; html: string; variant: "full" | "compact"; version: number }
  | { ok: false; reason: "unpublished" | "error"; message?: string; canEdit: boolean };

/** What signature a reply in this thread will get — shown under the reply box. */
export async function replySignaturePreview(threadId: string): Promise<SignaturePreviewState> {
  const { supabase, org, user, role } = await requireOrg();
  const canEdit = role === "owner" || role === "admin";
  try {
    const sig = await signatureForSend(supabase, org.id, user.id, threadId);
    if (!sig) return { ok: false, reason: "unpublished", canEdit };
    return { ok: true, html: sig.html, variant: sig.variant, version: sig.version };
  } catch (e) {
    return { ok: false, reason: "error", message: errMessage(e), canEdit };
  }
}

export type QuoteFromThreadState = { ok: true; url: string } | { ok: false; error: string };

/**
 * "Reply with quote": find (or create) the quote for this conversation's event — converting the enquiry
 * into an event first if needed — and return the quote builder link, set to send as a reply in this thread.
 */
export async function startQuoteFromThread(threadId: string): Promise<QuoteFromThreadState> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(threadId)) return { ok: false, error: "That conversation link isn't valid." };
    const { supabase, org, user, profile, role } = await requireOrg();
    if (role === "staff" || role === "customer") return { ok: false, error: "You don't have permission to create quotes." };
    const { data: thread } = await supabase.from("email_threads").select("id, subject, event_id, enquiry_id, classification")
      .eq("id", threadId).eq("organisation_id", org.id).maybeSingle();
    if (!thread) return { ok: false, error: "That conversation couldn't be found." };
    if (thread.classification === "spam") return { ok: false, error: "This conversation is marked as spam." };

    // 1. The event: the thread's own, or convert its enquiry (which moves the thread onto the new event)
    let eventId = thread.event_id as string | null;
    if (!eventId && thread.enquiry_id) {
      const { data: enq } = await supabase.from("enquiries").select("event_id").eq("id", thread.enquiry_id).maybeSingle();
      eventId = enq?.event_id ?? null;
      if (!eventId) {
        const { data, error } = await supabase.rpc("convert_enquiry_to_event", { p_enquiry_id: thread.enquiry_id, p_event_name: null });
        if (error) return { ok: false, error: `Couldn't turn the enquiry into an event: ${error.message}` };
        eventId = data as string;
        await fillCustomerFromEnquiry(supabase, org.id, thread.enquiry_id).catch(() => []);
      }
    }
    if (!eventId) return { ok: false, error: "Link this email to an enquiry or event first, then you can reply with a quote." };

    // 2. The quote: the newest one still being worked on, or a fresh draft
    const { data: ev } = await supabase.from("events").select("id, number, name, customer_id, status, enquiry_id").eq("id", eventId).maybeSingle();
    if (!ev) return { ok: false, error: "The event couldn't be found." };
    if (ev.status === "cancelled") return { ok: false, error: "This event is cancelled. Reopen it before quoting." };
    const { data: open } = await supabase.from("quotes").select("id").eq("event_id", ev.id).in("status", ["draft", "sent", "viewed"])
      .order("created_at", { ascending: false }).limit(1);
    let quoteId = open?.[0]?.id as string | undefined;
    if (!quoteId) {
      const { todayISO, addDaysISO } = await import("@/lib/format");
      const today = todayISO(org.timezone);
      const { data: q, error } = await supabase.from("quotes").insert({
        organisation_id: org.id, event_id: ev.id, customer_id: ev.customer_id, title: ev.name,
        status: "draft", issue_date: today, expiry_date: addDaysISO(today, 14), created_by: user.id,
      }).select("id, number").single();
      if (error) return { ok: false, error: `Couldn't create the quote: ${error.message}` };
      quoteId = q.id;
      await supabase.from("quote_sections").insert({ organisation_id: org.id, quote_id: q.id, title: "Services", position: 0 });
      await logActivity(supabase, {
        orgId: org.id, actorId: user.id, action: "quote.created", entityType: "quote", entityId: q.id,
        eventId: ev.id, customerId: ev.customer_id, enquiryId: ev.enquiry_id,
        summary: `${actorName(profile)} created Quote Q-${q.number} for EV-${ev.number} to reply to “${(thread.subject ?? "").slice(0, 60)}”`,
      });
    }
    if (thread.enquiry_id) revalidatePath(`/enquiries/${thread.enquiry_id}`);
    revalidatePath(`/events/${ev.id}`);
    return { ok: true, url: `/quotes/${quoteId}?reply=${thread.id}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}


/** Who a reply in this conversation goes to (shown above the reply box). */
export async function replyRecipients(threadId: string): Promise<{ to: string | null; cc: string[] }> {
  const { supabase, org, user } = await requireOrg();
  let own: string[] = [];
  try { own = ownAddresses(await buildContext(supabase, "user", org.id, "gmail", user.id)); } catch { /* Gmail not connected */ }
  const t = await replyTarget(supabase, org.id, threadId, own);
  return { to: t?.to ?? null, cc: t?.cc ?? [] };
}
