import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { parseCsv } from "./server";

/** "Barista Training – Stage 3" etc. — certificates made with Google Forms before EventureOS. */
const courseName = (stage: string) => `Barista Training – Stage ${stage}`;
const tidyName = (n: string) => {
  const s = n.replace(/\s+/g, " ").trim();
  return s && (s === s.toLowerCase() || s === s.toUpperCase()) ? s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : s;
};
const auDate = (v: string) => { const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; };

interface Rec { email: string; name: string; stage: string; done: string; ref: string }

/** Read one form's responses (Timestamp, Email, Full Name, Date, Course, Merged Doc ID …). */
export function readResponses(csv: string, stage: string): Rec[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (pred: (h: string) => boolean) => head.findIndex(pred);
  const cTs = col((h) => h === "timestamp"), cEmail = col((h) => h.startsWith("email")), cName = col((h) => h.startsWith("full name")), cDate = col((h) => h === "date"), cId = col((h) => h.startsWith("merged doc id"));
  if (cEmail < 0 || cId < 0) throw new Error("This doesn't look like a certificate form export (no email or merged doc id column).");
  const out: Rec[] = [];
  for (const r of rows.slice(1)) {
    const email = (r[cEmail] ?? "").trim().toLowerCase().slice(0, 254), ref = (r[cId] ?? "").trim();
    if (!email || !ref || !/^[\w-]{10,120}$/.test(ref)) continue;
    const ts = auDate(r[cTs] ?? "");
    let done = ts ?? new Date().toISOString().slice(0, 10);
    const d = auDate(r[cDate] ?? "");
    // The "Date" answer is the course date — unless someone typed their birthday; then use when they filled the form
    if (d && d >= "2019-01-01" && (!ts || d <= ts)) done = d;
    out.push({ email, name: (tidyName(r[cName] ?? "") || email.split("@")[0]).slice(0, 160), stage, done, ref });
  }
  return out;
}

export async function importLegacyCertificates(db: SupabaseClient, orgId: string, recs: Rec[]) {
  // Students: reuse anyone already on file (same email), add the rest
  const byEmail = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("booking_students").select("id, email").eq("organisation_id", orgId).not("email", "is", null).range(from, from + 999);
    for (const s of (data ?? []) as { id: string; email: string }[]) byEmail.set(s.email.toLowerCase(), s.id);
    if (!data || data.length < 1000) break;
  }
  const latest = new Map<string, Rec>();
  for (const r of recs) { const p = latest.get(r.email); if (!p || r.done > p.done) latest.set(r.email, r); }
  const missing = [...latest.values()].filter((r) => !byEmail.has(r.email));
  let newStudents = 0;
  for (let i = 0; i < missing.length; i += 200) {
    const { data, error } = await db.from("booking_students").insert(missing.slice(i, i + 200).map((r) => ({ organisation_id: orgId, name: r.name, email: r.email, source: "certificates_import" }))).select("id, email");
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as { id: string; email: string }[]) { byEmail.set(s.email.toLowerCase(), s.id); newStudents++; }
  }

  // Certificates (one per form response), skipping any already imported
  const have = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("booking_certificates").select("legacy_ref").eq("organisation_id", orgId).not("legacy_ref", "is", null).range(from, from + 999);
    for (const c of (data ?? []) as { legacy_ref: string }[]) have.add(c.legacy_ref);
    if (!data || data.length < 1000) break;
  }
  const todo = recs.filter((r) => !have.has(r.ref));
  let newCerts = 0;
  for (let i = 0; i < todo.length; i += 200) {
    const rows = todo.slice(i, i + 200).map((r) => ({
      organisation_id: orgId, number: `BC-${r.done.slice(0, 4)}-L${createHash("md5").update(r.ref).digest("hex").slice(0, 8).toUpperCase()}`,
      student_id: byEmail.get(r.email) ?? null, person_name: r.name, course_name: courseName(r.stage), completed_on: r.done, attendee_index: 0,
      verify_token: randomBytes(16).toString("hex"), status: "issued", legacy_ref: r.ref,
    }));
    const { error } = await db.from("booking_certificates").insert(rows);
    if (error) throw new Error(error.message);
    newCerts += rows.length;
  }

  // Everyone with a certificate gets a job board profile (off until they switch it on)
  const ids = [...new Set(recs.map((r) => byEmail.get(r.email)).filter(Boolean) as string[])];
  let newProfiles = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const { data: ex } = await db.from("job_profiles").select("student_id").eq("organisation_id", orgId).in("student_id", chunk);
    const exists = new Set(((ex ?? []) as { student_id: string }[]).map((x) => x.student_id));
    const add = chunk.filter((id) => !exists.has(id)).map((id) => ({ organisation_id: orgId, student_id: id, status: "draft" }));
    if (add.length) { const { error } = await db.from("job_profiles").insert(add); if (error) throw new Error(error.message); newProfiles += add.length; }
  }
  return { responses: recs.length, newStudents, newCerts, newProfiles };
}

/** Certificates still waiting for their original file. */
export async function legacyWithoutFile(db: SupabaseClient, orgId: string, limit = 2000) {
  const { data } = await db.from("booking_certificates").select("legacy_ref").eq("organisation_id", orgId).not("legacy_ref", "is", null).is("file_path", null).limit(limit);
  return ((data ?? []) as { legacy_ref: string }[]).map((x) => x.legacy_ref);
}

/** Keep the original PDF (private storage) and attach it to its certificate. */
export async function saveLegacyFile(db: SupabaseClient, orgId: string, ref: string, bytes: Uint8Array) {
  if (!/^[\w-]{10,120}$/.test(ref)) throw new Error("Bad reference");
  if (bytes.length < 8 || !(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) throw new Error("Not a PDF");
  const { data: c } = await db.from("booking_certificates").select("id").eq("organisation_id", orgId).eq("legacy_ref", ref).maybeSingle();
  if (!c) throw new Error("No certificate with that reference");
  const path = `${orgId}/legacy/${ref}.pdf`;
  const { error } = await db.storage.from("certificates").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(error.message);
  await db.from("booking_certificates").update({ file_path: path }).eq("id", c.id);
  return path;
}
