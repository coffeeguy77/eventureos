"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { buildRawMessage, replySubject, sendGmail } from "@/lib/integrations/gmail-send";
import { ApiError, errMessage } from "@/lib/integrations/runtime";
import { buildContext } from "@/lib/integrations/sync-runner";
import { ownAddresses } from "@/lib/integrations/gmail-sync";

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
  const { data: thread, error: tErr } = await supabase.from("email_threads")
    .select("id, subject, gmail_thread_id, customer_id, event_id, enquiry_id, message_count, extracted, participants")
    .eq("id", threadId).eq("organisation_id", org.id).maybeSingle();
  if (tErr || !thread) return { error: "That conversation couldn't be found." };

  let ctx;
  try { ctx = await buildContext(supabase, "user", org.id, "gmail", user.id); }
  catch { return { error: "Gmail isn't connected. Connect it in Settings → Integrations to reply from EventureOS." }; }
  const own = ownAddresses(ctx);
  const from = ctx.integration.account_label ?? ctx.integration.external_account_id;
  if (!from) return { error: "The connected Gmail account has no address — reconnect Gmail." };

  const { data: msgs } = await supabase.from("email_messages")
    .select("direction, from_email, reply_to, rfc_message_id, sent_at")
    .eq("thread_id", thread.id).order("sent_at", { ascending: true });
  const all = (msgs ?? []) as { direction: string; from_email: string; reply_to: string | null; rfc_message_id: string | null; sent_at: string }[];
  const lastInbound = [...all].reverse().find((m) => m.direction === "inbound");

  // Who to reply to: website form notifications → the customer in the form; otherwise Reply-To / sender.
  const extracted = (thread.extracted ?? {}) as { website_form?: boolean; email?: string | null };
  let to: string | null = null;
  if (extracted.website_form) {
    to = extracted.email ?? null;
    if (!to && thread.enquiry_id) {
      const { data: enq } = await supabase.from("enquiries").select("contact_email").eq("id", thread.enquiry_id).maybeSingle();
      to = enq?.contact_email ?? null;
    }
  }
  to ??= lastInbound?.reply_to ?? lastInbound?.from_email ?? (thread.participants as string[]).find((p) => !own.includes(p)) ?? null;
  if (!to || own.includes(to.toLowerCase())) return { error: "Couldn't work out who to reply to — reply from Gmail for this one." };

  const references = all.map((m) => m.rfc_message_id).filter((x): x is string => !!x).slice(-10);
  const inReplyTo = [...all].reverse().find((m) => m.rfc_message_id)?.rfc_message_id ?? null;
  const subject = replySubject(thread.subject);
  const fromName = profile.full_name ? `${profile.full_name} · ${org.name}` : org.name;

  let sent: Awaited<ReturnType<typeof sendGmail>>;
  let gmailThreadId: string | null = thread.gmail_thread_id;
  try {
    const raw = buildRawMessage({ from, fromName, to: [to], subject, inReplyTo, references, text });
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
    direction: "outbound", from_email: from.toLowerCase(), from_name: fromName, to_emails: [to], subject,
    snippet: text.replace(/\s+/g, " ").slice(0, 280), body_text: text, sent_at: now, is_read: true, sent_by: user.id,
  });
  if (mErr) return { error: `Sent from Gmail, but couldn't save it here: ${mErr.message}. It will appear after the next sync.` };
  const { error: uErr } = await supabase.from("email_threads").update({
    gmail_thread_id: gmailThreadId, state: "awaiting_customer", last_message_at: now, message_count: thread.message_count + 1,
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
