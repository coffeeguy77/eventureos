import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/integrations/runtime";
import { TICKET_STATUS, type TicketStatus } from "@/lib/nerdherd/core";
import type { QuoteStatus } from "@/lib/nerdherd/quotes";
import { ClientTicket, type ClientQuote, type ClientUpdate } from "./client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your support ticket", robots: { index: false, follow: false } };

/**
 * The client's ticket (private link from our emails): progress, quotes to accept and pay, and replies.
 * Reads with the service role but ONLY client-safe columns — no hours, rates, Claude's notes or internal notes.
 * Each visit is logged so the team can see who opened the ticket and the quote.
 */
export default async function TicketLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{40,80}$/i.test(token)) notFound();
  const db = createServiceClient();
  const { data: l } = await db.from("support_ticket_links").select("token, organisation_id, ticket_id, email, name").eq("token", token).maybeSingle();
  if (!l) notFound();
  const [{ data: org }, { data: t }, { data: qs }, { data: ups }] = await Promise.all([
    db.from("organisations").select("name, slug, brand_colour, logo_url, currency, timezone, contact_phone").eq("id", l.organisation_id).single(),
    db.from("support_tickets").select("id, number, subject, status, created_at, websites(domain)").eq("id", l.ticket_id).single(),
    db.from("support_ticket_quotes").select("id, seq, kind, title, description, amount, status, accepted_at, paid_at, completed_at, invoices(pay_token, status), support_ticket_quote_tasks(id, label, done_at, position)").eq("ticket_id", l.ticket_id).in("status", ["sent", "accepted", "paid", "completed", "declined"]).order("seq"),
    db.from("support_ticket_updates").select("id, kind, body, author_name, author_id, created_at").eq("ticket_id", l.ticket_id).eq("public", true).in("kind", ["comment", "email_in", "email_out"]).order("created_at").limit(200),
  ]);
  if (!org || !t) notFound();

  // log the visit (and that the quotes on the page were seen)
  const now = new Date().toISOString();
  const who = l.name ? `${l.name}` : l.email;
  const shown = ((qs ?? []) as { id: string; status: string }[]).filter((q) => q.status === "sent" || q.status === "accepted");
  await Promise.all([
    db.from("support_ticket_views").insert([{ organisation_id: l.organisation_id, ticket_id: l.ticket_id, link_token: token, who, what: "ticket" }, ...shown.map((q) => ({ organisation_id: l.organisation_id, ticket_id: l.ticket_id, quote_id: q.id, link_token: token, who, what: "quote" }))]),
    db.from("support_ticket_links").update({ last_seen_at: now }).eq("token", token),
    ...shown.map(async (q) => {
      const { data: c } = await db.from("support_ticket_quotes").select("view_count, first_viewed_at").eq("id", q.id).single();
      const firstTime = !c?.first_viewed_at;
      await db.from("support_ticket_quotes").update({ view_count: Number(c?.view_count ?? 0) + 1, first_viewed_at: c?.first_viewed_at ?? now, last_viewed_at: now }).eq("id", q.id);
      if (firstTime) {
        const { alertStaff } = await import("@/lib/nerdherd/mail");
        await alertStaff(db, l.organisation_id, l.ticket_id, `${who} opened the quote`, ["They've seen it — the light stays red until it's paid."]);
      }
    }),
  ]).catch(() => undefined);

  const quotes: ClientQuote[] = ((qs ?? []) as unknown as { id: string; seq: number; kind: "quote" | "variation"; title: string; description: string | null; amount: number; status: QuoteStatus; invoices: { pay_token: string; status: string } | null; support_ticket_quote_tasks: { id: string; label: string; done_at: string | null; position: number }[] }[]).map((q) => ({
    id: q.id, seq: q.seq, kind: q.kind, title: q.title, description: q.description, amount: Number(q.amount), status: q.status,
    payUrl: q.invoices && q.invoices.status !== "void" && q.invoices.status !== "paid" ? `/pay/${q.invoices.pay_token}` : null,
    tasks: [...q.support_ticket_quote_tasks].sort((a, b) => a.position - b.position).map((x) => ({ id: x.id, label: x.label, done: !!x.done_at })),
  }));
  const updates: ClientUpdate[] = ((ups ?? []) as { id: string; kind: string; body: string | null; author_name: string | null; author_id: string | null; created_at: string }[])
    .filter((u) => u.body)
    .map((u) => ({ id: u.id, mine: u.kind === "email_in" || (u.kind === "comment" && !u.author_id), who: u.kind === "email_out" || u.author_id ? (u.author_name ?? org.name) : (u.author_name ?? "You"), body: u.kind === "email_out" ? u.body!.replace(/^(?:(?:Sent|Reminder sent|Work completed)[^\n]*\n\n)?To [^\n]*:\n\n/, "").replace(/\n\n\[[^\]]+\]$/, "") : u.body!, at: u.created_at }));
  const accent = /^#[0-9a-f]{6}$/i.test(org.brand_colour ?? "") ? org.brand_colour! : "#6028EC";
  const st = TICKET_STATUS[t.status as TicketStatus] ?? TICKET_STATUS.open;
  return (
    <ClientTicket token={token} business={org.name} logo={org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null} accent={accent} currency={org.currency} tz={org.timezone}
      number={t.number as number} subject={t.subject as string} status={st.label} done={t.status === "resolved" || t.status === "closed"} domain={(t.websites as unknown as { domain: string } | null)?.domain ?? null}
      name={l.name} quotes={quotes} updates={updates} portal={`/p/${org.slug}/login`} />
  );
}
