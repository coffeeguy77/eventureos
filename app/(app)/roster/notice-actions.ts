"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";

export type NoticeResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function office() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can post notices.");
  return ctx;
}
async function wrap(fn: () => Promise<string | void>): Promise<NoticeResult> {
  try { const m = await fn(); revalidatePath("/roster/notices"); return { ok: true, message: m || undefined }; }
  catch (e) { const m = e instanceof Error ? e.message : String(e); return { ok: false, error: /staff_notice/.test(m) ? "Run the latest database update (0086_breaks_notices.sql) first." : m }; }
}

/** Post a notice to everyone (no one chosen) or to chosen staff. Shows in their app with a red dot until read. */
export async function postNotice(input: { title: string; body: string; memberIds: string[]; needsOk: boolean; pinned: boolean; expiresOn: string | null; text: boolean }) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    const title = input.title.trim().slice(0, 200);
    if (!title) throw new Error("Give it a heading.");
    const ids = [...new Set(input.memberIds.filter((x) => UUID.test(x)))].slice(0, 500);
    if (ids.length) {
      const { data } = await supabase.from("crew_members").select("id").eq("organisation_id", org.id).in("id", ids);
      if ((data ?? []).length !== ids.length) throw new Error("Someone chosen is no longer on the team — refresh and try again.");
    }
    const { error } = await supabase.from("staff_notices").insert({
      organisation_id: org.id, title, body: input.body.trim().slice(0, 5000) || null, member_ids: ids, needs_ok: !!input.needsOk, pinned: !!input.pinned,
      expires_on: input.expiresOn && DATE.test(input.expiresOn) ? input.expiresOn : null, created_by: user.id,
    });
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "staff.notice_posted", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} posted a staff notice: ${title}` });
    let texted = "";
    if (input.text) {
      // a short text pointing to the app (Twilio) — only to people with a mobile
      let q = supabase.from("crew_members").select("id, name, phone").eq("organisation_id", org.id).eq("active", true);
      if (ids.length) q = q.in("id", ids);
      const { data: people } = await q;
      const { createServiceClient } = await import("@/lib/integrations/runtime");
      const { loadTwilio, sendSms, smsNumber } = await import("@/lib/sms/twilio");
      const cfg = await loadTwilio(createServiceClient(), org.id);
      if (!cfg) texted = " — not texted: Twilio isn't connected";
      else {
        const { appBaseUrl } = await import("@/lib/integrations/registry");
        let n = 0;
        for (const p of (people ?? []) as { name: string; phone: string | null }[]) {
          const to = p.phone ? smsNumber(p.phone) : null;
          if (!to) continue;
          try { await sendSms(cfg, to, `${org.name}: new notice — ${title}\nRead it: ${appBaseUrl()}/crew/${org.slug}/news`); n++; } catch { /* keep going */ }
        }
        texted = ` — texted ${n}`;
      }
    }
    return `Posted to ${ids.length ? `${ids.length} ${ids.length === 1 ? "person" : "people"}` : "everyone"}${texted}.`;
  });
}

export async function deleteNotice(id: string) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("staff_notices").delete().eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    return "Taken down.";
  });
}

export async function pinNotice(id: string, pinned: boolean) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    await supabase.from("staff_notices").update({ pinned }).eq("id", id).eq("organisation_id", org.id);
  });
}
