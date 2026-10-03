"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";

export type StarResult = { ok: true; message: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (xs: string[]) => [...new Set(xs.filter((x) => UUID.test(x)))].slice(0, 500);
const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const NEEDS_DB = "Run the 0046 database update in Supabase first.";

async function office() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can do that.");
  return ctx;
}
async function wrap(fn: () => Promise<string>): Promise<StarResult> {
  try { return { ok: true, message: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
const dbError = (m: string) => /starred_at|star_note|starred_by|delete_enquiries/.test(m) ? NEEDS_DB : m;

/** Star (or unstar) enquiries for the whole team. A note says what needs thinking about. */
export async function setStar(enquiryIds: string[], on: boolean, note?: string | null): Promise<StarResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    const list = ids(enquiryIds);
    if (!list.length) throw new Error("Choose at least one enquiry.");
    const patch: Record<string, unknown> = on
      ? { starred_at: new Date().toISOString(), starred_by: user.id, ...(note !== undefined ? { star_note: note?.trim().slice(0, 1000) || null } : {}) }
      : { starred_at: null, starred_by: null, star_note: null };
    let q = supabase.from("enquiries").update(patch).eq("organisation_id", org.id).in("id", list);
    // Starring again shouldn't reset when (or by whom) it was first starred
    if (on && note === undefined) q = q.is("starred_at", null);
    const { data, error } = await q.select("id");
    if (error) throw new Error(dbError(error.message));
    const done = (data ?? []).map((r) => r.id as string);
    if (done.length) {
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: on ? "enquiry.starred" : "enquiry.unstarred", entityType: "enquiry",
        entityId: done.length === 1 ? done[0] : null, enquiryId: done.length === 1 ? done[0] : null,
        summary: `${actorName(profile)} ${on ? "starred" : "unstarred"} ${done.length === 1 ? "this enquiry" : pl(done.length, "enquiry", "enquiries")}` });
    }
    revalidatePath("/enquiries");
    for (const id of list.slice(0, 20)) revalidatePath(`/enquiries/${id}`);
    return on ? (list.length === 1 ? "Starred." : `${pl(list.length, "enquiry", "enquiries")} starred.`) : (list.length === 1 ? "Star removed." : `Star removed from ${pl(list.length, "enquiry", "enquiries")}.`);
  });
}

/** Change just the "what to think about" note on a starred enquiry. */
export async function setStarNote(id: string, note: string): Promise<StarResult> {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("That enquiry link isn't valid.");
    const { error } = await supabase.from("enquiries").update({ star_note: note.trim().slice(0, 1000) || null }).eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(dbError(error.message));
    revalidatePath("/enquiries");
    revalidatePath(`/enquiries/${id}`);
    return "Note saved.";
  });
}

/**
 * Delete enquiries from EventureOS — for tests and mistakes. Not spam, not blocked, nothing changes in Gmail.
 * Enquiries already turned into an event are left alone.
 */
export async function deleteEnquiries(enquiryIds: string[]): Promise<StarResult> {
  return wrap(async () => {
    const { supabase, org, user, profile, role } = await office();
    if (!["owner", "admin", "manager"].includes(role)) throw new Error("Only owners, admins and managers can delete enquiries.");
    const list = ids(enquiryIds);
    if (!list.length) throw new Error("Choose at least one enquiry.");
    const [{ data: docs }, { data: names }] = await Promise.all([
      supabase.from("documents").select("storage_path").eq("organisation_id", org.id).in("enquiry_id", list),
      supabase.from("enquiries").select("number, title").eq("organisation_id", org.id).in("id", list).is("event_id", null),
    ]);
    const { data, error } = await supabase.rpc("delete_enquiries", { p_org: org.id, p_enquiry_ids: list });
    if (error) throw new Error(dbError(error.message));
    const n = (data as { enquiries: number }).enquiries;
    // Files that were attached to them
    const paths = (docs ?? []).map((d) => d.storage_path as string | null).filter((p): p is string => !!p && p.startsWith(`${org.id}/`));
    if (n && paths.length) await supabase.storage.from("documents").remove(paths).catch(() => undefined);
    if (n) {
      const what = n === 1 && names?.length === 1 ? `ENQ-${names[0].number} “${names[0].title}”` : pl(n, "enquiry", "enquiries");
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "enquiry.deleted", entityType: "enquiry", summary: `${actorName(profile)} deleted ${what}` });
    }
    revalidatePath("/enquiries");
    revalidatePath("/dashboard");
    const skipped = list.length - n;
    if (!n) throw new Error("Nothing was deleted — enquiries that have become events can't be deleted here.");
    return `${pl(n, "enquiry", "enquiries")} deleted from EventureOS. Gmail isn't touched.${skipped ? ` ${skipped} already turned into events ${skipped === 1 ? "was" : "were"} left alone.` : ""}`;
  });
}
