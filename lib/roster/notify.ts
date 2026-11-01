import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDate } from "@/lib/format";
import { rosterEmail } from "@/lib/email/templates";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/integrations/registry";

/** Email staff their shifts (published roster, a change, a removed shift). Never throws; returns how many were sent. */
export async function emailStaff(db: SupabaseClient, orgId: string, items: { memberId: string; subject: string; intro: string; lines: string[] }[], opts: { to?: string; strict?: boolean } = {}): Promise<number> {
  if (opts.strict && !emailConfigured()) throw new Error("Email isn't set up for sending yet.");
  if (!items.length || !emailConfigured()) return 0;
  const { data: org } = await db.from("organisations").select("name, slug, brand_colour, logo_url, contact_email").eq("id", orgId).single();
  const { data: people } = await db.from("crew_members").select("id, name, email").eq("organisation_id", orgId).in("id", [...new Set(items.map((i) => i.memberId))]);
  const byId = new Map(((people ?? []) as { id: string; name: string; email: string | null }[]).map((p) => [p.id, p]));
  let sent = 0;
  for (const i of items) {
    const p = byId.get(i.memberId);
    const to = opts.to || p?.email;
    if (!p || !to || !org) { if (opts.strict) throw new Error(`${p?.name ?? "They"} ha${p ? "s" : "ve"} no email address — add one, or type an address to send the test to.`); continue; }
    const m = rosterEmail({ businessName: org.name as string, firstName: p.name.split(" ")[0], subject: i.subject, intro: i.intro, lines: i.lines,
      url: `${appBaseUrl()}/crew/${org.slug}`, brand: org.brand_colour as string | null, logoUrl: org.logo_url as string | null });
    try { await sendEmail({ to, ...m, replyTo: (org.contact_email as string | null) ?? undefined, fromName: org.name as string, orgId }); sent++; } catch (e) { if (opts.strict) throw e; /* keep going */ }
  }
  return sent;
}

/** 6:30am, 3pm */
export const t12 = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`; };
/** Paid hours for a shift: its length less the unpaid break (e.g. 6:30–3pm with 30 min = 8 h). */
export const paidHours = (start: string, finish: string, brk: number) => {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let span = mins(finish) - mins(start);
  if (span <= 0) span += 1440;
  return Math.round(Math.max(0, span - (brk || 0)) / 60 * 100) / 100;
};
export const shiftLine = (s: { shift_date: string; start_time: string; finish_time: string; break_minutes: number; area?: string | null; notes?: string | null }) =>
  `${fmtDate(s.shift_date, "weekday")} ${t12(s.start_time)}–${t12(s.finish_time)}${s.area ? ` · ${s.area}` : ""} · ${paidHours(s.start_time, s.finish_time, s.break_minutes)} h paid${s.break_minutes ? ` (${s.break_minutes} min unpaid break)` : ""}${s.notes ? ` — Note: ${s.notes}` : ""}`;
