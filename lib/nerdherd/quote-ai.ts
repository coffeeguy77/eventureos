import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaudeRaw } from "@/lib/ai/reply";
import { orgAiKey } from "@/lib/ai/key";
import { parseJSONObject } from "@/lib/ai/claude";
import { stripQuoted } from "@/lib/ai/classify";
import { cleanTasks, sumHours } from "./quotes";

/**
 * Claude reads the ticket (the client's emails, our replies and internal notes) and drafts the quote:
 * a client-friendly description, the steps of the work with hours for each, and notes for the staff.
 * The hours and notes are for the team only — they never reach the client.
 */
export interface QuoteDraft { title: string; description: string; tasks: { label: string; hours: number }[]; hours: number; notes: string }

const clip = (s: string | null | undefined, n: number) => { const t = stripQuoted(s ?? "").replace(/\n{3,}/g, "\n\n").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

export async function draftTicketQuote(db: SupabaseClient, org: { id: string; name: string }, ticketId: string, o: { variation: boolean; brief?: string | null; senderName: string }): Promise<QuoteDraft> {
  const { data: t } = await db.from("support_tickets").select("id, number, subject, description, kind, customers(name), websites(domain, platform)").eq("id", ticketId).eq("organisation_id", org.id).maybeSingle();
  if (!t) throw new Error("That ticket couldn't be found.");
  const [{ data: ups }, { data: prev }, { data: past }] = await Promise.all([
    db.from("support_ticket_updates").select("kind, body, author_name, created_at, public").eq("ticket_id", ticketId).in("kind", ["email_in", "email_out", "comment", "note"]).order("created_at").limit(60),
    db.from("support_ticket_quotes").select("seq, kind, title, description, hours, status").eq("ticket_id", ticketId).order("seq"),
    db.from("support_ticket_quotes").select("title, hours, support_ticket_quote_tasks(label, hours)").eq("organisation_id", org.id).in("status", ["paid", "completed"]).order("created_at", { ascending: false }).limit(8),
  ]);
  const site = t.websites as unknown as { domain: string; platform: string } | null;
  const convo = ((ups ?? []) as { kind: string; body: string | null; author_name: string | null; created_at: string }[])
    .map((u) => `--- ${u.kind === "email_in" ? `CLIENT (${u.author_name ?? "client"})` : u.kind === "note" ? `INTERNAL NOTE (${u.author_name ?? "staff"})` : `US (${u.author_name ?? org.name})`} · ${u.created_at.slice(0, 10)}\n${clip(u.body, 2500)}`)
    .join("\n\n").slice(-14000);
  const earlier = ((prev ?? []) as { seq: number; kind: string; title: string; description: string | null; hours: number; status: string }[]);
  const examples = ((past ?? []) as unknown as { title: string; hours: number; support_ticket_quote_tasks: { label: string; hours: number }[] }[])
    .map((p) => `• ${p.title}: ${Number(p.hours)} h (${p.support_ticket_quote_tasks.map((x) => `${x.label} ${Number(x.hours)}h`).join("; ")})`).join("\n");

  const system = `You help ${org.name}, an Australian web design, hosting and IT support agency, quote repair and change work on a support ticket.
Write for the CLIENT in the description: plain Australian English, friendly and clear, what we'll do and the outcome they get. No hours, no hourly rate, no prices, no internal jargon, no promises about things outside the work.
Break the work into practical steps (tasks) a technician will tick off. Give each task an honest hour estimate (quarter hours), including testing and any backup. Be realistic, not padded — but don't under-quote risky work.
${o.variation ? "This is a VARIATION: only the additional work the client has asked for that wasn't in the earlier quote(s). Don't repeat work already quoted." : ""}
Reply with ONLY a JSON object:
{"title":"short name for the work (max 80 chars)","description":"what the client reads — 2 to 6 short paragraphs or a short intro plus bullet lines starting with •","tasks":[{"label":"step the client may see ticked off (no hours in the text)","hours":number}],"notes":"for the staff only: assumptions, risks, what to check before sending, anything that could blow out the time"}`;
  const user = `TICKET #${t.number}: ${t.subject}
TYPE: ${t.kind}${site ? `\nWEBSITE: ${site.domain} (${site.platform})` : ""}
CLIENT: ${(t.customers as unknown as { name: string } | null)?.name ?? "unknown"}
${t.description ? `FIRST MESSAGE:\n${clip(t.description as string, 3000)}\n` : ""}
${earlier.length ? `EARLIER QUOTES ON THIS TICKET:\n${earlier.map((q) => `${q.kind === "variation" ? "Variation" : "Quote"} ${q.seq} (${q.status}): ${q.title} — ${clip(q.description, 600)}`).join("\n")}\n` : ""}
${examples ? `OUR RECENT PAID JOBS (to keep estimates consistent):\n${examples}\n` : ""}
${o.brief?.trim() ? `THE STAFF MEMBER SAYS: ${o.brief.trim().slice(0, 2000)}\n` : ""}
CONVERSATION (oldest first):
${convo || "(no messages yet — work from the subject and the staff member's note)"}`;

  const raw = await callClaudeRaw(await orgAiKey(org.id), system, user, 1800, 60000);
  const obj = parseJSONObject(raw);
  const tasks = cleanTasks(obj.tasks).map((x) => ({ ...x, hours: Math.max(0.25, Math.round(x.hours * 4) / 4) }));
  const description = typeof obj.description === "string" ? obj.description.trim().slice(0, 6000) : "";
  if (!description || !tasks.length) throw new Error("Claude didn't return a usable draft — try again, or add a note about what's needed.");
  return {
    title: (typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : t.subject as string).slice(0, 200),
    description, tasks, hours: sumHours(tasks),
    notes: typeof obj.notes === "string" ? obj.notes.trim().slice(0, 3000) : "",
  };
}
