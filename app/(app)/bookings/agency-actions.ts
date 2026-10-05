"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { createServiceClient } from "@/lib/integrations/runtime";
import { cleanPhone } from "@/lib/bookings/core";
import { addCaseManager, parseCaseManagerList, type CaseManagerInput } from "@/lib/bookings/agents";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_DB = "Run the 0052 database update (agency case managers) in Supabase first.";
const msg = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return /booking_case_manager|relation .* does not exist|schema cache/i.test(m) ? NEEDS_DB : m; };

async function manager() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can do that.");
  return ctx;
}
async function agencyOf(orgId: string, agencyId: string) {
  if (!UUID.test(agencyId)) throw new Error("Agency not found.");
  const { data } = await createServiceClient().from("booking_agencies").select("id, name, customer_id").eq("organisation_id", orgId).eq("id", agencyId).maybeSingle();
  if (!data) throw new Error("Agency not found.");
  return data as { id: string; name: string; customer_id: string | null };
}

export async function addCaseManagerOffice(agencyId: string, p: CaseManagerInput): Promise<Result> {
  try {
    const { org } = await manager();
    await agencyOf(org.id, agencyId);
    const r = await addCaseManager(createServiceClient(), org.id, agencyId, p, "office");
    if (!r.ok) return r;
    revalidatePath("/bookings/agencies");
    return { ok: true, data: `${r.data.name} added.` };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Paste from a spreadsheet or email signature list: one per line — name, email, phone, office. */
export async function importCaseManagersText(agencyId: string, text: string): Promise<Result<{ added: number; skipped: string[] }>> {
  try {
    const { org, user, profile, supabase } = await manager();
    const a = await agencyOf(org.id, agencyId);
    const { rows, skipped } = parseCaseManagerList(text.slice(0, 100_000));
    if (!rows.length) return { ok: false, error: "No names with email addresses found. Put one person per line: name, email, phone, office." };
    const db = createServiceClient();
    let added = 0;
    for (const r of rows.slice(0, 500)) { const x = await addCaseManager(db, org.id, agencyId, r, "import"); if (x.ok) added++; else skipped.push(`${r.name} — ${x.error}`); }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "agency.case_managers_imported", entityType: "booking_agency", entityId: agencyId, summary: `${actorName(profile)} imported ${added} case managers for ${a.name}` });
    revalidatePath("/bookings/agencies");
    return { ok: true, data: { added, skipped } };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** The contacts already on the agency's client record in the CRM. */
export async function importCaseManagersFromCrm(agencyId: string): Promise<Result<{ added: number; skipped: string[] }>> {
  try {
    const { org, user, profile, supabase } = await manager();
    const a = await agencyOf(org.id, agencyId);
    if (!a.customer_id) return { ok: false, error: "Link this agency to a client first (Client field above)." };
    const db = createServiceClient();
    const { data: contacts } = await db.from("contacts").select("first_name, last_name, email, phone, position").eq("organisation_id", org.id).eq("customer_id", a.customer_id).not("email", "is", null);
    let added = 0; const skipped: string[] = [];
    for (const c of (contacts ?? []) as { first_name: string | null; last_name: string | null; email: string; phone: string | null; position: string | null }[]) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      const x = await addCaseManager(db, org.id, agencyId, { name: name || c.email.split("@")[0], email: c.email, phone: c.phone, site: null }, "import");
      if (x.ok) added++; else skipped.push(`${name || c.email} — ${x.error}`);
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "agency.case_managers_imported", entityType: "booking_agency", entityId: agencyId, summary: `${actorName(profile)} imported ${added} case managers for ${a.name} from the CRM` });
    revalidatePath("/bookings/agencies");
    return { ok: true, data: { added, skipped } };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function updateCaseManager(id: string, p: { name: string; email: string; phone: string; site: string; active: boolean }): Promise<Result> {
  try {
    const { org } = await manager();
    if (!UUID.test(id)) throw new Error("Not found.");
    const { cleanEmail } = await import("@/lib/bookings/core");
    const email = cleanEmail(p.email), name = p.name.trim().replace(/\s+/g, " ").slice(0, 160);
    if (!email || name.length < 2) return { ok: false, error: "Enter a name and a valid email." };
    const { error } = await createServiceClient().from("booking_case_managers").update({ name, email, phone: cleanPhone(p.phone), site: p.site.trim().slice(0, 160) || null, active: p.active }).eq("id", id).eq("organisation_id", org.id);
    if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? "Another case manager at this agency already has that email." : msg(error) };
    // Signing someone off ends their sessions straight away
    if (!p.active) await createServiceClient().from("booking_case_manager_sessions").delete().eq("case_manager_id", id);
    revalidatePath("/bookings/agencies");
    return { ok: true, data: p.active ? "Saved." : "Removed from the list — they can't book or sign in." };
  } catch (e) { return { ok: false, error: msg(e) }; }
}
