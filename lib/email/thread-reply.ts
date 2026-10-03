import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { replySubject } from "@/lib/integrations/gmail-send";

/**
 * Everything needed to send a message as a reply in an existing email conversation:
 * who to send it to, the "Re:" subject, and the RFC 2822 threading headers Gmail needs
 * (https://developers.google.com/workspace/gmail/api/guides/threads).
 * Shared by plain replies and "reply with quote".
 */
export interface ReplyTarget {
  thread: {
    id: string; subject: string | null; gmail_thread_id: string | null; customer_id: string | null; event_id: string | null;
    enquiry_id: string | null; message_count: number;
  };
  /** The customer address to reply to, or null when it can't be worked out safely. */
  to: string | null;
  /** People on the job who are in this conversation (e.g. a colleague the client cc'd) — copied in on the reply */
  cc: string[];
  subject: string;
  inReplyTo: string | null;
  references: string[];
}

export async function replyTarget(supabase: SupabaseClient, orgId: string, threadId: string, own: string[]): Promise<ReplyTarget | null> {
  const { data: thread, error } = await supabase.from("email_threads")
    .select("id, subject, gmail_thread_id, customer_id, event_id, enquiry_id, message_count, extracted, participants")
    .eq("id", threadId).eq("organisation_id", orgId).maybeSingle();
  if (error || !thread) return null;

  const { data: msgs } = await supabase.from("email_messages")
    .select("direction, from_email, reply_to, rfc_message_id, sent_at, to_emails, cc_emails")
    .eq("thread_id", thread.id).order("sent_at", { ascending: true });
  const all = (msgs ?? []) as { direction: string; from_email: string; reply_to: string | null; rfc_message_id: string | null; sent_at: string; to_emails: string[] | null; cc_emails: string[] | null }[];
  const lastInbound = [...all].reverse().find((m) => m.direction === "inbound");
  const mine = own.map((a) => a.toLowerCase());

  // Website form notifications → the customer in the form; otherwise Reply-To / sender.
  const extracted = (thread.extracted ?? {}) as { website_form?: boolean; email?: string | null };
  let to: string | null = null;
  if (extracted.website_form) {
    to = extracted.email ?? null;
    if (!to && thread.enquiry_id) {
      const { data: enq } = await supabase.from("enquiries").select("contact_email").eq("id", thread.enquiry_id).maybeSingle();
      to = enq?.contact_email ?? null;
    }
  }
  to ??= lastInbound?.reply_to ?? lastInbound?.from_email ?? ((thread.participants ?? []) as string[]).find((p) => !mine.includes(p.toLowerCase())) ?? null;
  if (to && mine.includes(to.toLowerCase())) to = null;

  // Reply-all, but only to people on this job: everyone the job's contacts list and this conversation have in common
  let cc: string[] = [];
  if (thread.event_id) {
    const { data: jp } = await supabase.from("event_contacts").select("contact:contacts(email)").eq("organisation_id", orgId).eq("event_id", thread.event_id);
    const job = new Set(((jp ?? []) as unknown as { contact: { email: string | null } | null }[]).map((r) => r.contact?.email?.toLowerCase()).filter((e): e is string => !!e));
    const inThread = new Set([...((thread.participants ?? []) as string[]), ...(lastInbound?.to_emails ?? []), ...(lastInbound?.cc_emails ?? [])].map((e) => e.toLowerCase()));
    cc = [...job].filter((e) => inThread.has(e) && e !== to?.toLowerCase() && !mine.includes(e)).slice(0, 10);
  }

  return {
    thread: {
      id: thread.id, subject: thread.subject, gmail_thread_id: thread.gmail_thread_id, customer_id: thread.customer_id,
      event_id: thread.event_id, enquiry_id: thread.enquiry_id, message_count: thread.message_count,
    },
    to: to ? to.toLowerCase() : null,
    cc,
    subject: replySubject(thread.subject),
    inReplyTo: [...all].reverse().find((m) => m.rfc_message_id)?.rfc_message_id ?? null,
    references: all.map((m) => m.rfc_message_id).filter((x): x is string => !!x).slice(-10),
  };
}
