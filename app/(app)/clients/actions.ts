"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";

export type Duplicate = { id: string; name: string; reason: string };
export type NewClientState = { error?: string; duplicates?: Duplicate[] } | undefined;

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^61(?=\d{9}$)/, "0");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Look for an existing client with the same email, phone or name before creating a new one. */
async function findDuplicates(
  supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string,
  v: { name: string; company: string | null; email: string | null; phone: string | null; contactEmail: string | null; contactPhone: string | null },
): Promise<Duplicate[]> {
  const found = new Map<string, Duplicate>();
  const add = (id: string, name: string, reason: string) => { if (!found.has(id)) found.set(id, { id, name, reason }); };

  const emails = [...new Set([v.email, v.contactEmail].filter(Boolean) as string[])];
  for (const email of emails) {
    const [cu, co] = await Promise.all([
      supabase.from("customers").select("id, name").eq("organisation_id", orgId).ilike("email", likeExact(email)).limit(5),
      supabase.from("contacts").select("customer:customers(id, name)").eq("organisation_id", orgId).ilike("email", likeExact(email)).limit(5),
    ]);
    if (cu.error || co.error) throw new Error(`Couldn't check for duplicates: ${(cu.error ?? co.error)!.message}`);
    for (const r of cu.data ?? []) add(r.id, r.name, `same email (${email})`);
    for (const r of (co.data ?? []) as unknown as { customer: { id: string; name: string } | null }[]) if (r.customer) add(r.customer.id, r.customer.name, `a contact has the same email (${email})`);
  }

  const phones = [...new Set([v.phone, v.contactPhone].map(digits).filter((p) => p.length >= 8))];
  if (phones.length) {
    // Phone numbers are stored in many formats, so compare digits only.
    const [cu, co] = await Promise.all([
      supabase.from("customers").select("id, name, phone").eq("organisation_id", orgId).not("phone", "is", null).limit(5000),
      supabase.from("contacts").select("phone, customer:customers(id, name)").eq("organisation_id", orgId).not("phone", "is", null).limit(5000),
    ]);
    if (cu.error || co.error) throw new Error(`Couldn't check for duplicates: ${(cu.error ?? co.error)!.message}`);
    for (const r of cu.data ?? []) if (phones.includes(digits(r.phone))) add(r.id, r.name, "same phone number");
    for (const r of (co.data ?? []) as unknown as { phone: string; customer: { id: string; name: string } | null }[]) {
      if (r.customer && phones.includes(digits(r.phone))) add(r.customer.id, r.customer.name, "a contact has the same phone number");
    }
  }

  const names = [...new Set([v.name, v.company].filter(Boolean) as string[])];
  for (const n of names) {
    const t = likeExact(n);
    const [byName, byCompany] = await Promise.all([
      supabase.from("customers").select("id, name").eq("organisation_id", orgId).ilike("name", t).limit(5),
      supabase.from("customers").select("id, name").eq("organisation_id", orgId).ilike("company", t).limit(5),
    ]);
    if (byName.error || byCompany.error) throw new Error(`Couldn't check for duplicates: ${(byName.error ?? byCompany.error)!.message}`);
    for (const r of [...(byName.data ?? []), ...(byCompany.data ?? [])]) add(r.id, r.name, "same name");
  }
  return [...found.values()];
}

export async function createClientRecord(_prev: NewClientState, form: FormData): Promise<NewClientState> {
  const { supabase, org, user, profile } = await requireOrg();
  const kind = form.get("kind") === "company" ? "company" : "individual";
  const name = str(form.get("name"));
  const company = str(form.get("company"));
  const email = str(form.get("email"))?.toLowerCase() ?? null;
  const phone = str(form.get("phone"));
  const firstName = str(form.get("contact_first_name"));
  const lastName = str(form.get("contact_last_name"));
  const contactEmail = str(form.get("contact_email"))?.toLowerCase() ?? null;
  const contactPhone = str(form.get("contact_phone"));
  if (!name) return { error: kind === "company" ? "Enter the company name." : "Enter the client’s name." };
  if (email && !EMAIL_RE.test(email)) return { error: "That email address doesn't look right." };
  if (contactEmail && !EMAIL_RE.test(contactEmail)) return { error: "The contact’s email address doesn't look right." };
  if (kind === "company" && !firstName && (contactEmail || contactPhone)) return { error: "Add the contact person’s first name." };

  if (form.get("confirm_new") !== "1") {
    const duplicates = await findDuplicates(supabase, org.id, { name, company, email, phone, contactEmail, contactPhone });
    if (duplicates.length) return { duplicates };
  }

  const tags = [...new Set(String(form.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean))];
  const { data, error } = await supabase.from("customers").insert({
    organisation_id: org.id, kind, name, company: company ?? (kind === "company" ? name : null), email, phone,
    address: str(form.get("address")), notes: str(form.get("notes")), tags, source: str(form.get("source")),
    created_by: user.id,
  }).select("id").single();
  if (error) return { error: `Couldn't create the client: ${error.message}` };

  // Every client gets a primary contact: the person themselves, or the named contact at a company.
  let cFirst = firstName;
  let cLast = lastName;
  if (!cFirst && kind === "individual") {
    const parts = name.split(/\s+/);
    cFirst = parts[0];
    cLast = parts.slice(1).join(" ") || null;
  }
  if (cFirst) {
    const { error: ctErr } = await supabase.from("contacts").insert({
      organisation_id: org.id, customer_id: data.id, first_name: cFirst, last_name: cLast,
      email: contactEmail ?? email, phone: contactPhone ?? phone, position: str(form.get("contact_position")),
      is_primary: true, created_by: user.id,
    });
    if (ctErr) return { error: `Created the client, but couldn't add the contact: ${ctErr.message}` };
  }

  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "customer.created", entityType: "customer", entityId: data.id, customerId: data.id,
    summary: `${actorName(profile)} added client ${name}${form.get("confirm_new") === "1" ? " (after reviewing possible duplicates)" : ""}`,
  });
  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}
