"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { createServiceClient } from "@/lib/integrations/runtime";
import { readDesign, type CertDesign } from "@/lib/bookings/certificate";
import { issueDue } from "@/lib/bookings/certificates";
import { cleanEmail } from "@/lib/bookings/core";
import { ensureStudent } from "@/lib/bookings/server";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_DB = "Run the 0050 database update (certificates) in Supabase first.";
const msg = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return /booking_certificate|relation .* does not exist|schema cache/i.test(m) ? NEEDS_DB : m; };

async function office() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can do that.");
  return ctx;
}

/** Save the certificate design. The first save also issues certificates to everyone whose class has already finished. */
export async function saveCertificateDesign(design: CertDesign, autoIssue: boolean): Promise<Result<{ issued: number }>> {
  try {
    const { supabase, org, user, profile } = await office();
    const clean = readDesign(design);
    const { data: existing, error: e1 } = await supabase.from("booking_certificate_templates").select("id").eq("organisation_id", org.id).eq("is_default", true).maybeSingle();
    if (e1) throw e1;
    const { error } = existing
      ? await supabase.from("booking_certificate_templates").update({ design: clean, auto_issue: autoIssue }).eq("id", existing.id)
      : await supabase.from("booking_certificate_templates").insert({ organisation_id: org.id, design: clean, auto_issue: autoIssue, is_default: true, created_by: user.id });
    if (error) throw error;
    let issued = 0;
    if (autoIssue) issued = await issueDue(createServiceClient(), org.id, 1500);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "certificate.design_saved", entityType: "booking_certificate_template", summary: `${actorName(profile)} updated the certificate design${issued ? ` — ${issued} certificates issued to past students` : ""}` });
    revalidatePath("/bookings/certificates");
    return { ok: true, data: { issued } };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** A certificate for someone the system has no booking for (e.g. did a course years ago). */
export async function issueManualCertificate(p: { studentId?: string | null; name: string; courseId: string; date: string; email?: string | null }): Promise<Result<{ token: string }>> {
  try {
    const { supabase, org, user, profile } = await office();
    const name = p.name.trim().replace(/\s+/g, " ").slice(0, 160);
    if (name.length < 2) throw new Error("Enter the person's name.");
    if (!UUID.test(p.courseId)) throw new Error("Choose the course.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error("Choose the date they did the course.");
    const { data: c } = await supabase.from("booking_courses").select("id, name, duration_minutes").eq("organisation_id", org.id).eq("id", p.courseId).single();
    if (!c) throw new Error("Course not found.");
    const db = createServiceClient();
    // Link it to their account (by email) so they can download it after signing in
    let studentId = p.studentId && UUID.test(p.studentId) ? p.studentId : null;
    if (!studentId && p.email?.trim()) {
      const email = cleanEmail(p.email);
      if (!email) throw new Error("That email doesn't look right.");
      studentId = await ensureStudent(db, org.id, { name, email, phone: null, source: "office" });
    }
    const { data: n, error: e1 } = await db.rpc("next_org_number", { org: org.id, counter_key: "certificate", start_at: 1001 });
    if (e1) throw e1;
    const { data, error } = await supabase.from("booking_certificates").insert({
      organisation_id: org.id, number: `C-${n}`, student_id: studentId, course_id: c.id, person_name: name,
      course_name: String(c.name).replace(/\s*\(\d+\s*hrs?\)\s*$/i, ""), completed_on: p.date, hours: Math.round((Number(c.duration_minutes) / 60) * 100) / 100, issued_by: user.id,
    }).select("verify_token").single();
    if (error) throw error;
    if (p.studentId && UUID.test(p.studentId)) await supabase.from("booking_students").update({ certificate_requested_at: null }).eq("id", p.studentId);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "certificate.issued", entityType: "booking_certificate", summary: `${actorName(profile)} issued a ${c.name} certificate to ${name}` });
    revalidatePath("/bookings/certificates");
    return { ok: true, data: { token: data.verify_token as string } };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function setCertificateStatus(id: string, status: "issued" | "revoked"): Promise<Result> {
  try {
    const { supabase, org, user, profile, role } = await office();
    if (!["owner", "admin", "manager"].includes(role)) throw new Error("Only owners, admins and managers can withdraw certificates.");
    const { data, error } = await supabase.from("booking_certificates").update({ status }).eq("organisation_id", org.id).eq("id", id).select("number, person_name").single();
    if (error) throw error;
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: `certificate.${status}`, entityType: "booking_certificate", entityId: id, summary: `${actorName(profile)} ${status === "revoked" ? "withdrew" : "restored"} certificate ${data.number} (${data.person_name})` });
    revalidatePath("/bookings/certificates");
    return { ok: true, data: status === "revoked" ? "Withdrawn — the QR code now shows it isn't valid." : "Restored." };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function renameCertificate(id: string, name: string): Promise<Result> {
  try {
    const { supabase, org } = await office();
    const n = name.trim().replace(/\s+/g, " ").slice(0, 160);
    if (n.length < 2) throw new Error("Enter the name.");
    const { error } = await supabase.from("booking_certificates").update({ person_name: n }).eq("organisation_id", org.id).eq("id", id);
    if (error) throw error;
    revalidatePath("/bookings/certificates");
    return { ok: true, data: "Name updated." };
  } catch (e) { return { ok: false, error: msg(e) }; }
}
