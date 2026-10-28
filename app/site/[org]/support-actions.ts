"use server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { checkSupport, domainOf, isAgencyAccess, likeEscape, ticketDescription } from "@/lib/site/agency/support";

export type SupportResult = { ok: true; number: number | null } | { ok: false; error: string };

/**
 * "Lodge a support request" on an agency's public website (businesses with Nerd Herd only) → a new support ticket,
 * the client's first message on it, and a notification for the team. Matches the client and their website when it can.
 */
export async function lodgeSupportTicket(slug: string, f: Record<string, string>): Promise<SupportResult> {
  if (typeof f?.website === "string" && f.website.trim()) return { ok: true, number: null }; // honeypot
  const c = checkSupport(f ?? {});
  if (!c.ok) return c;
  const v = c.value;
  try {
    const db = createServiceClient();
    const { data: org } = await db.from("organisations").select("id, app_access").eq("slug", String(slug)).eq("status", "active").maybeSingle();
    if (!org || !isAgencyAccess(org.app_access)) return { ok: false, error: "This form isn't available." };
    const orgId = org.id as string;
    const emailLike = likeEscape(v.email);

    // Light rate limit: no more than 5 requests an hour from one email address
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("support_tickets").select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId).eq("source", "portal").gte("created_at", since).ilike("description", `%Email: ${emailLike}%`);
    if ((count ?? 0) >= 5) return { ok: false, error: "You've sent several requests in the last hour. We've got them — please wait for a reply, or call us if it's urgent." };

    // The client, by their email (on the client record or one of its contacts)
    const [{ data: cust }, { data: contact }] = await Promise.all([
      db.from("customers").select("id").eq("organisation_id", orgId).ilike("email", emailLike).limit(1).maybeSingle(),
      db.from("contacts").select("customer_id").eq("organisation_id", orgId).ilike("email", emailLike).limit(1).maybeSingle(),
    ]);
    const customerId = (cust?.id as string | undefined) ?? (contact?.customer_id as string | undefined) ?? null;

    // Their website, if it's one we look after
    let websiteId: string | null = null;
    const dom = domainOf(v.website);
    if (dom) {
      const { data: sites } = await db.from("websites").select("id, domain, customer_id").eq("organisation_id", orgId).ilike("domain", `%${likeEscape(dom)}%`).limit(20);
      const hits = ((sites ?? []) as { id: string; domain: string; customer_id: string | null }[]).filter((s) => domainOf(s.domain) === dom);
      websiteId = (hits.find((s) => customerId && s.customer_id === customerId) ?? hits[0])?.id ?? null;
    }

    const { data: t, error } = await db.from("support_tickets").insert({
      organisation_id: orgId, source: "portal", status: "new", kind: "support", customer_id: customerId, website_id: websiteId,
      subject: v.subject.slice(0, 300), description: ticketDescription(v), created_by: null,
    }).select("id, number").single();
    if (error || !t) throw error ?? new Error("no ticket");

    await db.from("support_ticket_updates").insert({
      organisation_id: orgId, ticket_id: t.id, kind: "email_in", public: true, author_name: v.name, author_id: null, body: v.details,
    });
    await db.from("notifications").insert({
      organisation_id: orgId, type: "ticket.new", title: `New ticket #${t.number ?? ""} from ${v.name}`.slice(0, 200), body: v.subject.slice(0, 200),
      link: `/nerd-herd/tickets/${t.id}`, entity_type: "support_ticket", entity_id: t.id,
    });
    return { ok: true, number: (t.number as number | null) ?? null };
  } catch (e) {
    console.error("[site] support ticket", e);
    return { ok: false, error: "Couldn't lodge that just now — please try again, or email or call us." };
  }
}
