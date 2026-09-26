import "server-only";
import { evaluateFilter, gmailQueryFor, resolveFilter } from "@/lib/integrations/email-filter";
import { classifyEmail, stripQuoted } from "@/lib/ai/classify";
import { getThread, listThreads, parseMessage, type ParsedMessage } from "@/lib/integrations/gmail";
import { classifyContextBase, gmailSettings, ownAddresses } from "@/lib/integrations/gmail-sync";
import { bestMatch, type MatchRecord } from "@/lib/integrations/matching";
import { errMessage, finishSyncLog, logIntegration, saveIntegrationSettings, startSyncLog, type SyncContext } from "@/lib/integrations/runtime";

/**
 * Historical import: scan N months of Gmail threads and produce IMPORT REVIEW candidates
 * (import_candidates, source 'gmail'). Nothing is created in the CRM here — a person confirms each one.
 *   kind 'contact'  — a person you've corresponded with who isn't a customer/contact yet (with a best-guess match)
 *   kind 'enquiry'  — a thread that looks like an event enquiry / quote conversation / booked event
 * Resumable: the Gmail page token is kept in integrations.settings.import_page_token.
 */

const THREADS_PER_RUN = 60;
const TIME_BUDGET_MS = 45_000;

export interface CustomerForMatch { id: string; name: string; company: string | null; email: string | null; phone: string | null; contacts: { email: string | null; phone: string | null; first_name: string; last_name: string | null }[] }

export async function loadCustomersForMatching(ctx: SyncContext): Promise<CustomerForMatch[]> {
  const out: CustomerForMatch[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await ctx.db.from("customers")
      .select("id, name, company, email, phone, contacts(email, phone, first_name, last_name)")
      .eq("organisation_id", ctx.org.id).order("created_at").range(from, from + 999);
    if (error) throw new Error(`Could not load customers: ${error.message}`);
    out.push(...((data ?? []) as unknown as CustomerForMatch[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const customerRecord = (c: CustomerForMatch): MatchRecord => ({
  name: c.name, company: c.company, email: c.email, phone: c.phone,
  emails: c.contacts.map((x) => x.email), phones: c.contacts.map((x) => x.phone),
});

export async function importGmailHistory(ctx: SyncContext, opts: { months?: number; restart?: boolean } = {}) {
  const started = Date.now();
  const s = gmailSettings(ctx);
  const months = Math.max(1, Math.min(36, opts.months ?? s.import_months ?? 12));
  const logId = await startSyncLog(ctx, "email_history_import");
  let scanned = 0, contacts = 0, enquiries = 0;
  try {
    const own = ownAddresses(ctx);
    const customers = await loadCustomersForMatching(ctx);
    const knownEmails = new Set<string>();
    for (const c of customers) for (const e of [c.email, ...c.contacts.map((x) => x.email)]) if (e) knownEmails.add(e.toLowerCase());

    const { data: tracked } = await ctx.db.from("email_threads").select("gmail_thread_id").eq("organisation_id", ctx.org.id).not("gmail_thread_id", "is", null);
    const trackedIds = new Set((tracked ?? []).map((t) => t.gmail_thread_id as string));

    // Gmail search operators: https://support.google.com/mail/answer/7190
    const filter = resolveFilter(s);
    const narrow = gmailQueryFor(filter);
    const q = `newer_than:${months}m -in:chats -in:drafts -in:spam -category:promotions -category:social -category:forums${narrow ? " " + narrow : ""}`;
    let pageToken: string | undefined = opts.restart ? undefined : s.import_page_token ?? undefined;
    const people = new Map<string, { name: string | null; email: string; phone: string | null; company: string | null; threads: number; first: string; last: string; subjects: string[] }>();
    let done = false;

    while (scanned < THREADS_PER_RUN && Date.now() - started < TIME_BUDGET_MS) {
      const page = await listThreads(ctx, q, pageToken, 20);
      for (const t of page.threads ?? []) {
        if (scanned >= THREADS_PER_RUN || Date.now() - started > TIME_BUDGET_MS) break;
        scanned++;
        if (trackedIds.has(t.id)) continue;
        const thread = await getThread(ctx, t.id, "full");
        const msgs = (thread.messages ?? []).map(parseMessage).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
        const firstIn = msgs.find((m) => !own.includes(m.from.email) && !m.labelIds.includes("SENT"));
        if (!firstIn) continue;
        if (!evaluateFilter(filter, { subject: firstIn.subject, from_email: firstIn.from.email, body: firstIn.text, headers: firstIn.headers,
          knownPerson: knownEmails.has(firstIn.from.email) || (!!firstIn.replyTo && knownEmails.has(firstIn.replyTo.email)) }).import) continue;
        const c = await classifyEmail(
          { subject: firstIn.subject, from_email: firstIn.from.email, from_name: firstIn.from.name, body: firstIn.text, received_at: firstIn.sentAt, headers: firstIn.headers },
          { ...classifyContextBase(ctx), known_customer: knownEmails.has(firstIn.from.email) },
          { allowAI: false }, // bulk scan: deterministic and free
        );
        if (c.classification === "spam" || firstIn.headers.list_unsubscribe) continue;
        const personEmail = c.website_form ? c.extracted.email : firstIn.from.email;
        if (!personEmail || own.includes(personEmail)) continue;
        const weReplied = msgs.some((m) => own.includes(m.from.email) || m.labelIds.includes("SENT"));

        // people we've actually talked to (or who sent an enquiry) → contact candidates
        if (!knownEmails.has(personEmail) && (weReplied || c.classification === "event_enquiry") && c.classification !== "supplier") {
          const p = people.get(personEmail) ?? { name: c.extracted.name ?? (c.website_form ? null : firstIn.from.name), email: personEmail, phone: c.extracted.phone, company: c.extracted.company, threads: 0, first: firstIn.sentAt, last: firstIn.sentAt, subjects: [] };
          p.threads++;
          p.last = msgs[msgs.length - 1].sentAt > p.last ? msgs[msgs.length - 1].sentAt : p.last;
          if (p.subjects.length < 5 && firstIn.subject) p.subjects.push(firstIn.subject);
          p.phone ??= c.extracted.phone; p.company ??= c.extracted.company; p.name ??= c.extracted.name;
          people.set(personEmail, p);
        }

        // enquiry / quote / booked-event conversations → enquiry candidates
        if (["event_enquiry", "quote_discussion", "existing_event"].includes(c.classification) || c.best_guess === "event_enquiry") {
          const incoming: MatchRecord = { name: c.extracted.name ?? firstIn.from.name, email: personEmail, phone: c.extracted.phone, company: c.extracted.company };
          const best = bestMatch(incoming, customers, customerRecord, 40);
          const quoteMentioned = msgs.some((m) => /\b(quote|quotation|proposal|invoice|deposit)\b/i.test(m.subject + " " + m.text));
          await upsertCandidate(ctx, "enquiry", t.id, {
            thread_id: t.id,
            subject: firstIn.subject,
            person: incoming,
            classification: c.classification, confidence: c.confidence, reasons: c.reasons, extracted: c.extracted, website_form: !!c.website_form,
            we_replied: weReplied, quote_mentioned: quoteMentioned,
            first_at: msgs[0].sentAt, last_at: msgs[msgs.length - 1].sentAt,
            messages: msgs.slice(-12).map((m) => payloadMessage(m, own)),
          }, best?.item.id ?? null, best ? best.score : null, best ? best.reasons : ["No existing customer matches — accepting creates a new one"]);
          enquiries++;
        }
      }
      pageToken = page.nextPageToken;
      if (!pageToken) { done = true; break; }
    }

    for (const p of people.values()) {
      const best = bestMatch({ name: p.name, email: p.email, phone: p.phone, company: p.company }, customers, customerRecord, 40);
      await upsertCandidate(ctx, "contact", p.email, p, best?.item.id ?? null, best?.score ?? null,
        best?.reasons ?? ["Not in your customers yet"]);
      contacts++;
    }

    await saveIntegrationSettings(ctx, { import_months: months, import_page_token: done ? null : pageToken ?? null, import_scanned: (opts.restart ? 0 : s.import_scanned ?? 0) + scanned, import_last_run_at: new Date().toISOString() });
    const msg = `Scanned ${scanned} Gmail conversation${scanned === 1 ? "" : "s"} from the last ${months} months: ${contacts} people and ${enquiries} enquiry conversation${enquiries === 1 ? "" : "s"} to review.` + (done ? " Import complete." : " Run it again to continue.");
    await finishSyncLog(ctx, logId, done ? "success" : "partial", scanned, msg);
    await logIntegration(ctx, { action: "import.gmail_scanned", entityType: "integration", entityId: ctx.integration.id, summary: msg });
    return { scanned, contacts, enquiries, done, message: msg };
  } catch (e) {
    await finishSyncLog(ctx, logId, "error", scanned, `Historical import failed: ${errMessage(e)}`);
    throw e;
  }
}

function payloadMessage(m: ParsedMessage, own: string[]) {
  const outbound = own.includes(m.from.email) || m.labelIds.includes("SENT");
  return {
    gmail_id: m.gmailId, rfc_message_id: m.messageId, direction: outbound ? "outbound" : "inbound",
    from_email: m.from.email, from_name: m.from.name, to: m.to.map((a) => a.email), subject: m.subject,
    sent_at: m.sentAt, body: (stripQuoted(m.text) || m.text).slice(0, 4000),
  };
}

/** Insert or refresh a pending candidate; resolved ones (merged / kept separate / ignored) are never reopened. */
export async function upsertCandidate(ctx: SyncContext, kind: "contact" | "enquiry" | "invoice", externalId: string, payload: unknown,
  suggestedCustomerId: string | null, score: number | null, reasons: string[]) {
  const source = ctx.integration.provider === "xero" ? "xero" : "gmail";
  const { data: existing } = await ctx.db.from("import_candidates").select("id, status")
    .eq("organisation_id", ctx.org.id).eq("source", source).eq("kind", kind).eq("external_id", externalId).maybeSingle();
  if (existing && existing.status !== "pending") return;
  const row = { payload, suggested_customer_id: suggestedCustomerId, score, reasons };
  const { error } = existing
    ? await ctx.db.from("import_candidates").update(row).eq("id", existing.id)
    : await ctx.db.from("import_candidates").insert({ organisation_id: ctx.org.id, source, kind, external_id: externalId, ...row });
  if (error) throw new Error(`Could not save import candidate: ${error.message}`);
}

