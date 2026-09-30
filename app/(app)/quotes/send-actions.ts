"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { defaultQuoteMessage, defaultQuoteSubject, quoteEmail } from "@/lib/email/quote-email";
import { appBaseUrl } from "@/lib/integrations/registry";
import { signatureForSend } from "@/lib/signatures/server";
import { fmtDate, money } from "@/lib/format";
import { publishQuote } from "./actions";
import type { ActionResult } from "@/components/quotes/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
const MAX_RECIPIENTS = 10;

export interface SuggestedRecipient { email: string; name: string | null; label: string }
export interface QuoteSendSetup {
  suggestions: SuggestedRecipient[];
  defaultTo: SuggestedRecipient[];
  subject: string;
  message: string;
  senderEmail: string;
  replyTo: string;
  businessName: string;
  brand: string | null;
  logoUrl: string | null;
  signature: { html: string; text: string } | null;
  needsPublish: boolean;
  nextVersion: number;
  currentVersion: number | null;
  total: string;
  validUntil: string | null;
  eventLine: string | null;
  title: string;
  quoteNumber: number;
  emailReady: boolean;
  deliveryTracking: boolean;
  previouslySentTo: string[];
}

async function load(quoteId: string) {
  if (!UUID.test(quoteId)) throw new Error("That quote link isn't valid.");
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("You don't have permission to send quotes.");
  const { supabase, org } = ctx;
  const { data: q, error } = await supabase.from("quotes")
    .select("id, number, title, status, expiry_date, current_version_id, has_unpublished_changes, customer_id, event_id, event:events(id, name, event_date, primary_contact_id), customer:customers(id, name, email, kind)")
    .eq("id", quoteId).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Couldn't load the quote: ${error.message}`);
  if (!q) throw new Error("That quote no longer exists, or you don't have access to it.");
  return { ...ctx, q: q as unknown as {
    id: string; number: number; title: string; status: string; expiry_date: string | null; current_version_id: string | null; has_unpublished_changes: boolean;
    customer_id: string; event_id: string;
    event: { id: string; name: string; event_date: string | null; primary_contact_id: string | null } | null;
    customer: { id: string; name: string; email: string | null; kind: string | null } | null;
  } };
}

const needsPublishing = (q: { current_version_id: string | null; has_unpublished_changes: boolean; status: string }) =>
  !q.current_version_id || q.has_unpublished_changes || q.status === "declined" || q.status === "expired";

/** Everything the send dialog needs: who to send to, a default subject and message, the signature and totals. */
export async function quoteSendSetup(quoteId: string): Promise<ActionResult<QuoteSendSetup>> {
  try {
    const { supabase, org, user, profile, q } = await load(quoteId);
    const [{ data: contacts }, { data: versions }, { data: prev }, { data: o }] = await Promise.all([
      supabase.from("contacts").select("id, first_name, last_name, email, is_primary").eq("organisation_id", org.id).eq("customer_id", q.customer_id).not("email", "is", null),
      supabase.from("quote_versions").select("version_number, total").eq("quote_id", q.id).order("version_number", { ascending: false }).limit(1),
      supabase.from("email_send_recipients").select("email").eq("quote_id", q.id).eq("role", "to"),
      supabase.from("organisations").select("brand_colour, logo_url, contact_email").eq("id", org.id).single(),
    ]);

    // Suggestions: the event's contact first, then the client's email, then their other contacts
    const seen = new Set<string>();
    const suggestions: SuggestedRecipient[] = [];
    const push = (email: string | null | undefined, name: string | null, label: string) => {
      const e = (email ?? "").trim().toLowerCase();
      if (!EMAIL.test(e) || seen.has(e)) return;
      seen.add(e); suggestions.push({ email: e, name, label });
    };
    const cs = (contacts ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null; is_primary: boolean }[];
    const full = (c: { first_name: string | null; last_name: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;
    const eventContact = cs.find((c) => c.id === q.event?.primary_contact_id);
    if (eventContact) push(eventContact.email, full(eventContact), "Event contact");
    push(q.customer?.email, q.customer?.kind === "company" ? null : q.customer?.name ?? null, "Client email");
    for (const c of cs.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))) push(c.email, full(c), c.is_primary ? "Primary contact" : "Contact");

    const first = suggestions[0];
    const firstName = (first?.name ?? (q.customer?.kind === "company" ? null : q.customer?.name) ?? "").split(" ")[0] || null;
    const needsPublish = needsPublishing(q);
    const lastVersion = versions?.[0] as { version_number: number; total: number } | undefined;

    // The total the customer will see: the current version, or (if publishing) the draft's total
    let total = lastVersion ? Number(lastVersion.total) : 0;
    if (needsPublish) {
      const { data: snap } = await supabase.rpc("build_quote_snapshot", { qid: q.id });
      if (snap && typeof (snap as { total?: unknown }).total !== "undefined") total = Number((snap as { total: number }).total);
    }

    let signature: QuoteSendSetup["signature"] = null;
    try { const s = await signatureForSend(supabase, org.id, user.id, null); if (s) signature = { html: s.html, text: s.text }; } catch { /* no signature */ }

    const eventDate = q.event?.event_date ? fmtDate(q.event.event_date, "long") : null;
    const validUntil = q.expiry_date ? fmtDate(q.expiry_date, "long") : null;
    const orgRow = o as { brand_colour: string | null; logo_url: string | null; contact_email: string | null } | null;
    return {
      ok: true,
      data: {
        suggestions,
        defaultTo: first ? [first] : [],
        subject: defaultQuoteSubject({ businessName: org.name, quoteNumber: q.number, eventName: q.event?.name }),
        message: defaultQuoteMessage({
          firstName, eventName: q.event?.name ?? null, eventDate, validUntil,
          senderFirstName: profile.full_name?.split(" ")[0] ?? null,
          // An "update" only once the customer has actually been emailed an earlier version
          isUpdate: needsPublish && (prev ?? []).length > 0,
        }),
        senderEmail: profile.email,
        replyTo: profile.email,
        businessName: org.name,
        brand: orgRow?.brand_colour ?? null,
        logoUrl: orgRow?.logo_url ?? null,
        signature,
        needsPublish,
        nextVersion: (lastVersion?.version_number ?? 0) + 1,
        currentVersion: lastVersion?.version_number ?? null,
        total: money(total, org.currency, { cents: true }),
        validUntil,
        eventLine: q.event ? [q.event.name, eventDate].filter(Boolean).join(" · ") : null,
        title: q.title,
        quoteNumber: q.number,
        emailReady: emailConfigured(),
        deliveryTracking: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
        previouslySentTo: [...new Set(((prev ?? []) as { email: string }[]).map((r) => r.email))],
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't prepare the email." };
  }
}

export interface SendQuoteInput {
  recipients: { email: string; name?: string | null }[];
  subject: string;
  message: string;
  includeSignature: boolean;
  copyMe: boolean;
  saveContacts: boolean;
}
export interface SendQuoteResult { versionNumber: number; published: boolean; sent: string[]; failed: { email: string; error: string }[] }

/**
 * Email the quote. Publishes a new version first when the draft has changed (or it's never been sent),
 * then sends each recipient their own tracked link through Resend. Replies go to the sender.
 */
export async function sendQuoteEmail(quoteId: string, input: SendQuoteInput): Promise<ActionResult<SendQuoteResult>> {
  try {
    if (!emailConfigured()) throw new Error("Email sending isn't set up (RESEND_API_KEY is missing in Vercel).");
    // Validate before anything is published
    const seen = new Set<string>();
    const recipients: { email: string; name: string | null }[] = [];
    for (const r of input.recipients ?? []) {
      const email = String(r.email ?? "").trim().toLowerCase();
      if (!email) continue;
      if (!EMAIL.test(email) || email.length > 254) throw new Error(`“${email}” isn't a valid email address.`);
      if (seen.has(email)) continue;
      seen.add(email);
      const name = String(r.name ?? "").replace(/[\r\n<>"]+/g, " ").trim().slice(0, 120) || null;
      recipients.push({ email, name });
    }
    if (!recipients.length) throw new Error("Add at least one email address to send to.");
    if (recipients.length > MAX_RECIPIENTS) throw new Error(`You can send to up to ${MAX_RECIPIENTS} people at once.`);
    const subject = String(input.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
    if (!subject) throw new Error("Add a subject.");
    const message = String(input.message ?? "").replace(/\r\n/g, "\n").trim();
    if (!message) throw new Error("Add a message.");
    if (message.length > 5000) throw new Error("Please keep the message under 5,000 characters.");

    const { supabase, org, user, profile, q } = await load(quoteId);
    if (q.status === "accepted") throw new Error(`Quote Q-${q.number} has already been accepted.`);

    // 1. Publish if needed (publishQuote runs all the checks: items, names, expiry)
    let published = false;
    if (needsPublishing(q)) {
      const r = await publishQuote(q.id);
      if (!r.ok) throw new Error(r.error);
      published = true;
    }
    const { data: qv, error: qvErr } = await supabase.from("quotes").select("current_version_id, expiry_date, title").eq("id", q.id).single();
    if (qvErr) throw new Error(`Couldn't load the published quote: ${qvErr.message}`);
    if (!qv.current_version_id) throw new Error("The quote hasn't been published.");
    const { data: curRow, error: cvErr } = await supabase.from("quote_versions").select("id, version_number, total").eq("id", qv.current_version_id).single();
    if (cvErr) throw new Error(`Couldn't load the published quote: ${cvErr.message}`);
    const cur = curRow as { id: string; version_number: number; total: number };

    // 2. Signature and branding
    let sig: { html: string; text: string; version: number } | null = null;
    if (input.includeSignature) {
      const s = await signatureForSend(supabase, org.id, user.id, null).catch(() => null);
      if (s) sig = { html: s.html, text: s.text, version: s.version };
    }
    const { data: o } = await supabase.from("organisations").select("brand_colour, logo_url, contact_email").eq("id", org.id).single();
    const orgRow = o as { brand_colour: string | null; logo_url: string | null; contact_email: string | null } | null;
    const replyTo = profile.email || orgRow?.contact_email || null;

    // 3. Record the send and each recipient (with their own link)
    const { data: send, error: sErr } = await supabase.from("email_sends").insert({
      organisation_id: org.id, kind: "quote", quote_id: q.id, quote_version_id: cur.id, version_number: cur.version_number,
      subject, message, from_name: org.name, reply_to: replyTo, signature_version: sig?.version ?? null, sent_by: user.id,
    }).select("id").single();
    if (sErr) throw new Error(`Couldn't record the email: ${sErr.message}`);
    const all = [
      ...recipients.map((r) => ({ ...r, role: "to" as const })),
      ...(input.copyMe && !seen.has(profile.email.toLowerCase()) ? [{ email: profile.email.toLowerCase(), name: profile.full_name, role: "copy" as const }] : []),
    ];
    const rows = all.map((r) => ({
      organisation_id: org.id, send_id: send.id, quote_id: q.id, email: r.email, name: r.name, role: r.role, token: randomBytes(32).toString("hex"),
    }));
    const { data: inserted, error: rErr } = await supabase.from("email_send_recipients").insert(rows).select("id, email, role, token");
    if (rErr) throw new Error(`Couldn't record the recipients: ${rErr.message}`);

    // 4. Send, one email per recipient (each link is personal)
    const base = appBaseUrl();
    const common = {
      businessName: org.name, logoUrl: orgRow?.logo_url, brand: orgRow?.brand_colour, quoteNumber: q.number, title: (qv as { title: string }).title,
      eventLine: q.event ? [q.event.name, q.event.event_date ? fmtDate(q.event.event_date, "long") : null].filter(Boolean).join(" · ") : null,
      total: money(cur.total, org.currency, { cents: true }),
      validUntil: (qv as { expiry_date: string | null }).expiry_date ? fmtDate((qv as { expiry_date: string }).expiry_date, "long") : null,
      message, signatureHtml: sig?.html ?? null, signatureText: sig?.text ?? null,
    };
    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];
    for (const r of (inserted ?? []) as { id: string; email: string; role: "to" | "copy"; token: string }[]) {
      const m = quoteEmail({
        ...common, url: `${base}/q/${r.token}`,
        footer: r.role === "copy" ? `Your copy. Opening this link isn't counted as the customer viewing it.` : undefined,
      });
      try {
        const res = await sendEmail({ to: r.email, subject: r.role === "copy" ? `[Copy] ${subject}` : subject, html: m.html, text: m.text, replyTo, fromName: org.name });
        await supabase.from("email_send_recipients").update({ resend_id: res.id, status: "sent", status_at: new Date().toISOString() }).eq("id", r.id);
        if (r.role === "to") sent.push(r.email);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        await supabase.from("email_send_recipients").update({ status: "failed", status_at: new Date().toISOString(), error: msg }).eq("id", r.id);
        failed.push({ email: r.email, error: msg });
      }
    }

    // 5. Optionally remember new addresses as contacts on the client
    if (input.saveContacts && sent.length) {
      const { data: existing } = await supabase.from("contacts").select("email").eq("organisation_id", org.id).eq("customer_id", q.customer_id);
      const { data: cust } = await supabase.from("customers").select("email").eq("id", q.customer_id).single();
      const known = new Set([...(existing ?? []).map((c: { email: string | null }) => (c.email ?? "").toLowerCase()), (cust?.email ?? "").toLowerCase()]);
      const add = recipients.filter((r) => sent.includes(r.email) && !known.has(r.email)).map((r) => {
        const [first, ...rest] = (r.name ?? r.email.split("@")[0]).split(" ");
        return { organisation_id: org.id, customer_id: q.customer_id, first_name: first.slice(0, 80), last_name: rest.join(" ").slice(0, 80) || null, email: r.email, is_primary: false, created_by: user.id };
      });
      if (add.length) await supabase.from("contacts").insert(add);
    }

    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.emailed", entityType: "quote", entityId: q.id,
      customerId: q.customer_id, eventId: q.event_id,
      summary: sent.length
        ? `${actorName(profile)} emailed Quote Q-${q.number} (version ${cur.version_number}) to ${sent.join(", ")}${failed.length ? ` — failed for ${failed.map((f) => f.email).join(", ")}` : ""}`
        : `${actorName(profile)} tried to email Quote Q-${q.number} — it failed for ${failed.map((f) => f.email).join(", ")}`,
      metadata: { send_id: send.id, version: cur.version_number },
    });

    revalidatePath(`/quotes/${q.id}`);
    revalidatePath(`/events/${q.event_id}`);
    revalidatePath("/quotes");
    const toFailed = failed.filter((f) => recipients.some((r) => r.email === f.email));
    if (!sent.length && toFailed.length) {
      return { ok: false, error: `The email didn't send: ${toFailed[0].error}${published ? ` (version ${cur.version_number} was published)` : ""}` };
    }
    return { ok: true, data: { versionNumber: cur.version_number, published, sent, failed } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't send the quote." };
  }
}
