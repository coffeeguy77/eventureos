import "server-only";
import { appBaseUrl } from "@/lib/integrations/registry";
import { fmtDate } from "@/lib/format";
import { emailConfigured, sendEmail } from "./send";
import { portalInviteEmail } from "./templates";

/** Email someone a link to a booking in the business's client portal. Returns an error message instead of throwing. */
export async function sendPortalInvite(o: {
  org: { name: string; slug: string; brand_colour?: string | null; logo_url?: string | null; contact_email?: string | null };
  event: { id: string; name: string; event_date?: string | null };
  to: string; firstName: string; invitedBy: string | null; replyTo?: string | null;
}): Promise<string | null> {
  if (!emailConfigured()) return "email isn't set up (RESEND_API_KEY)";
  try {
    const url = `${appBaseUrl()}/p/${o.org.slug}/login?email=${encodeURIComponent(o.to)}&next=${encodeURIComponent(`/p/${o.org.slug}/events/${o.event.id}`)}`;
    const m = portalInviteEmail({
      businessName: o.org.name, inviterName: o.invitedBy, firstName: o.firstName, eventName: o.event.name,
      eventDate: o.event.event_date ? fmtDate(o.event.event_date, "long") : null, url, brand: o.org.brand_colour, logoUrl: o.org.logo_url,
    });
    await sendEmail({ to: o.to, ...m, replyTo: o.replyTo ?? o.org.contact_email ?? null, fromName: o.org.name });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
