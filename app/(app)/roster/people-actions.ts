"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName } from "@/lib/activity";

export type PeopleResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function office() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can do this.");
  return ctx;
}
async function wrap(fn: () => Promise<string | void>): Promise<PeopleResult> {
  try { const m = await fn(); revalidatePath("/roster/setup"); revalidatePath("/roster/timesheets"); return { ok: true, message: m || undefined }; }
  catch (e) { const m = e instanceof Error ? e.message : String(e); return { ok: false, error: /staff_(qualifications|notes|bank_accounts)|roster_checklist|required_quals/.test(m) ? "Run the latest database update (0087_roster_extras.sql) first." : m }; }
}
async function mine(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, memberId: string) {
  if (!UUID.test(memberId)) throw new Error("Refresh and try again.");
  const { data } = await supabase.from("crew_members").select("id, name").eq("id", memberId).eq("organisation_id", orgId).maybeSingle();
  if (!data) throw new Error("That person is no longer on the team.");
  return data as { id: string; name: string };
}

// ---------------------------------------------------------------- qualifications and documents

/** A qualification / document (RSA, food safety, first aid, visa…) with an expiry date and optionally the file. */
export async function addQualification(form: FormData) {
  return wrap(async () => {
    const { supabase, org } = await office();
    const m = await mine(supabase, org.id, String(form.get("member") ?? ""));
    const name = String(form.get("name") ?? "").trim().slice(0, 80);
    if (!name) throw new Error("Name it, e.g. RSA or Food Safety Supervisor.");
    const expires = String(form.get("expires") ?? "");
    const reference = String(form.get("reference") ?? "").trim().slice(0, 80) || null;
    const { data: q, error } = await supabase.from("staff_qualifications").insert({ organisation_id: org.id, crew_member_id: m.id, name, reference, expires_on: DATE.test(expires) ? expires : null }).select("id").single();
    if (error) throw new Error(error.message);
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) throw new Error("Saved — but the file is over 10 MB, so it wasn't attached.");
      if (!/^(image\/(jpeg|png|heic|webp)|application\/pdf)$/.test(file.type)) throw new Error("Saved — attach a PDF or photo (JPG / PNG) for the file.");
      const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${org.id}/${m.id}/${q.id}.${ext}`;
      const { createServiceClient } = await import("@/lib/integrations/runtime");
      const { error: up } = await createServiceClient().storage.from("staff-docs").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
      if (up) throw new Error(`Saved — but the file didn't upload (${up.message}).`);
      await supabase.from("staff_qualifications").update({ file_path: path }).eq("id", q.id);
    }
    return `${name} added for ${m.name.split(" ")[0]}.`;
  });
}

export async function deleteQualification(id: string) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: q } = await supabase.from("staff_qualifications").select("file_path").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!q) return;
    if (q.file_path) { const { createServiceClient } = await import("@/lib/integrations/runtime"); await createServiceClient().storage.from("staff-docs").remove([q.file_path as string]); }
    await supabase.from("staff_qualifications").delete().eq("id", id);
    return "Removed.";
  });
}

/** Qualifications needed to work an area — the roster warns when someone without them is put there. */
export async function setAreaQuals(areaId: string, quals: string[]) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(areaId)) throw new Error("Refresh and try again.");
    const list = [...new Set(quals.map((q) => q.trim().slice(0, 80)).filter(Boolean))].slice(0, 10);
    const { error } = await supabase.from("roster_areas").update({ required_quals: list }).eq("id", areaId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    return list.length ? `Needs: ${list.join(", ")}.` : "No qualifications needed.";
  });
}

// ---------------------------------------------------------------- managers' private notes

export async function addStaffNote(memberId: string, body: string) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    const m = await mine(supabase, org.id, memberId);
    const text = body.trim().slice(0, 2000);
    if (!text) throw new Error("Write the note.");
    const { error } = await supabase.from("staff_notes").insert({ organisation_id: org.id, crew_member_id: m.id, body: text, author_id: user.id, author_name: actorName(profile) });
    if (error) throw new Error(error.message);
    return "Note saved — only managers can see it.";
  });
}

export async function deleteStaffNote(id: string) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    await supabase.from("staff_notes").delete().eq("id", id).eq("organisation_id", org.id);
  });
}

// ---------------------------------------------------------------- bank details (Wages → ABA file)

/** Bank details for someone paid through Wages (not Xero Payroll). Managers only; only the last digits are shown again. */
export async function saveBankAccount(memberId: string, v: { name: string; bsb: string; account: string } | null) {
  return wrap(async () => {
    const { supabase, org } = await office();
    const m = await mine(supabase, org.id, memberId);
    if (!v) { await supabase.from("staff_bank_accounts").delete().eq("crew_member_id", m.id).eq("organisation_id", org.id); return "Bank details removed."; }
    const bsb = v.bsb.replace(/\D/g, ""), account = v.account.replace(/\D/g, ""), name = v.name.trim().replace(/[^A-Za-z0-9 &'.,-]/g, "").slice(0, 32);
    if (bsb.length !== 6) throw new Error("The BSB is 6 digits.");
    if (account.length < 4 || account.length > 9) throw new Error("The account number is 4 to 9 digits.");
    if (!name) throw new Error("Add the name on the account.");
    const { error } = await supabase.from("staff_bank_accounts").upsert({ crew_member_id: m.id, organisation_id: org.id, account_name: name, bsb: `${bsb.slice(0, 3)}-${bsb.slice(3)}`, account_number: account, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return `Saved ${m.name.split(" ")[0]}'s bank details.`;
  });
}

// ---------------------------------------------------------------- checklists

export async function saveChecklist(v: { id: string | null; name: string; areaId: string | null; weekdays: number[]; dueBy: string | null; items: string[] }) {
  return wrap(async () => {
    const { supabase, org } = await office();
    const name = v.name.trim().slice(0, 80);
    if (!name) throw new Error("Name the checklist, e.g. Opening.");
    const items = v.items.map((x) => x.trim().slice(0, 200)).filter(Boolean).slice(0, 60);
    if (!items.length) throw new Error("Add at least one thing to tick off.");
    const row = { name, area_id: v.areaId && UUID.test(v.areaId) ? v.areaId : null, weekdays: [...new Set(v.weekdays.filter((d) => d >= 0 && d <= 6))], due_by: v.dueBy && /^\d{2}:\d{2}$/.test(v.dueBy) ? v.dueBy : null, items };
    if (!row.weekdays.length) throw new Error("Choose the days.");
    if (v.id) {
      if (!UUID.test(v.id)) throw new Error("Refresh and try again.");
      const { error } = await supabase.from("roster_checklists").update(row).eq("id", v.id).eq("organisation_id", org.id);
      if (error) throw new Error(error.message);
      return "Checklist saved.";
    }
    const { error } = await supabase.from("roster_checklists").insert({ ...row, organisation_id: org.id });
    if (error) throw new Error(error.message);
    return "Checklist added — it shows on the café iPad and in the staff app.";
  });
}

export async function archiveChecklist(id: string) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    await supabase.from("roster_checklists").update({ active: false }).eq("id", id).eq("organisation_id", org.id);
    return "Checklist removed.";
  });
}
