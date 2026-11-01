import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDate } from "@/lib/format";
import { rosterEmail } from "@/lib/email/templates";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/integrations/registry";

/** Email staff their shifts (published roster, a change, a removed shift). Never throws; returns how many were sent. */
export async function emailStaff(db: SupabaseClient, orgId: string, items: { memberId: string; subject: string; intro: string; lines: string[] }[]): Promise<number> {
  if (!items.length || !emailConfigured()) return 0;
  const { data: org } = await db.from("organisations").select("name, slug, brand_colour, logo_url, contact_email").eq("id", orgId).single();
  const { data: people } = await db.from("crew_members").select("id, name, email").eq("organisation_id", orgId).in("id", [...new Set(items.map((i) => i.memberId))]);
  const byId = new Map(((people ?? []) as { id: string; name: string; email: string | null }[]).map((p) => [p.id, p]));
  let sent = 0;
  for (const i of items) {
    const p = byId.get(i.memberId);
    if (!p?.email || !org) continue;
    const m = rosterEmail({ businessName: org.name as string, firstName: p.name.split(" ")[0], subject: i.subject, intro: i.intro, lines: i.lines,
      url: `${appBaseUrl()}/crew/${org.slug}`, brand: org.brand_colour as string | null, logoUrl: org.logo_url as string | null });
    try { await sendEmail({ to: p.email, ...m, replyTo: (org.contact_email as string | null) ?? undefined, fromName: org.name as string, orgId }); sent++; } catch { /* keep going */ }
  }
  return sent;
}

export const shiftLine = (s: { shift_date: string; start_time: string; finish_time: string; break_minutes: number; area?: string | null; notes?: string | null }) =>
  `${fmtDate(s.shift_date, "weekday")} ${s.start_time.slice(0, 5)}–${s.finish_time.slice(0, 5)}${s.area ? ` · ${s.area}` : ""}${s.break_minutes ? ` · ${s.break_minutes} min break` : ""}${s.notes ? ` · ${s.notes}` : ""}`;
