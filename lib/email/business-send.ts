import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigured, sendEmail } from "@/lib/email/send";

/**
 * Send an email as the business: from its connected Gmail when there is one (so it's in Sent and replies come
 * back to the business), otherwise through EventureOS email with the business as reply-to.
 */
export async function sendAsBusiness(db: SupabaseClient, orgId: string, m: { to: string[]; subject: string; html: string; text: string }): Promise<{ via: "gmail" | "email" }> {
  const { data: org } = await db.from("organisations").select("name, contact_email").eq("id", orgId).single();
  const name = (org?.name as string) ?? "";
  try {
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const ctx = await buildContext(db, "service", orgId, "gmail", null);
    const { buildRawMessage, sendGmail } = await import("@/lib/integrations/gmail-send");
    const { ownAddresses } = await import("@/lib/integrations/gmail-sync");
    const from = (ctx.integration.account_label ?? ownAddresses(ctx)[0] ?? "").toLowerCase();
    if (!from.includes("@")) throw new Error("no gmail");
    await sendGmail(ctx, buildRawMessage({ from, fromName: name, to: m.to, subject: m.subject, text: m.text, html: m.html }), null);
    return { via: "gmail" };
  } catch {
    if (!emailConfigured()) throw new Error("Gmail isn't connected and EventureOS email isn't set up.");
    for (const to of m.to) await sendEmail({ to, subject: m.subject, html: m.html, text: m.text, replyTo: (org?.contact_email as string) ?? undefined, fromName: name });
    return { via: "email" };
  }
}
