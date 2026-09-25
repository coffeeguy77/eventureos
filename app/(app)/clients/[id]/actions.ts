"use server";

import { revalidatePath } from "next/cache";
import { requireOrg, canManage } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";

export type FormState = { error?: string } | undefined;

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const list = (v: FormDataEntryValue | null) =>
  [...new Set(String(v ?? "").split(/\n|,/).map((x) => x.trim()).filter(Boolean))];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function refresh(customerId: string) {
  revalidatePath(`/clients/${customerId}`);
  revalidatePath("/clients");
}

type Kind = "text" | "long" | "list" | "kind";
const FIELDS: [col: string, label: string, kind: Kind][] = [
  ["name", "name", "text"], ["company", "company", "text"], ["kind", "type", "kind"], ["email", "email", "text"],
  ["phone", "phone", "text"], ["address", "address", "text"], ["tags", "tags", "list"], ["notes", "notes", "long"],
];

/** Edit a customer's details. Every changed field is written to the audit trail as a before → after diff. */
export async function updateCustomerDetails(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, org, user, profile } = await requireOrg();
  const { data: before, error: e1 } = await supabase.from("customers").select("*").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (e1) return { error: `Couldn't load the client: ${e1.message}` };
  if (!before) return { error: "This client no longer exists." };

  const patch: Record<string, unknown> = {};
  const changes: Record<string, [unknown, unknown]> = {};
  for (const [col, label, kind] of FIELDS) {
    if (!form.has(col)) continue;
    const raw = form.get(col);
    let next: unknown = kind === "list" ? list(raw) : str(raw);
    if (col === "email" && next) next = String(next).toLowerCase();
    const prev: unknown = before[col];
    const same = kind === "list" ? JSON.stringify(prev ?? []) === JSON.stringify(next) : String(prev ?? "") === String(next ?? "");
    if (same) continue;
    patch[col] = next;
    const show = (v: unknown) =>
      kind === "list" ? ((v as string[] | null) ?? []).join(", ") || null
        : kind === "long" ? (v ? "updated" : null)
        : kind === "kind" ? (v === "company" ? "Company" : "Individual")
        : v;
    changes[label] = [show(prev), show(next)];
  }
  if ("name" in patch && !patch.name) return { error: "A client needs a name." };
  if (patch.kind && !["individual", "company"].includes(String(patch.kind))) return { error: "Choose individual or company." };
  if (patch.email && !EMAIL_RE.test(String(patch.email))) return { error: "That email address doesn't look right." };
  if (Object.keys(patch).length === 0) return undefined;

  const { error } = await supabase.from("customers").update(patch).eq("id", id).eq("organisation_id", org.id);
  if (error) return { error: `Couldn't save: ${error.message}` };

  const summary = Object.entries(changes)
    .map(([k, [a, b]]) => (a === "updated" || b === "updated" ? `updated ${k}` : `changed ${k} ${a ?? "—"} → ${b ?? "—"}`))
    .join(", ");
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "customer.updated", entityType: "customer", entityId: id, customerId: id,
    summary: `${actorName(profile)} ${summary} on ${String(patch.name ?? before.name)}`, changes,
  });
  refresh(id);
  return undefined;
}

const CONTACT_FIELDS: [col: string, label: string][] = [
  ["first_name", "first name"], ["last_name", "last name"], ["email", "email"], ["phone", "phone"], ["position", "position"],
];
const contactName = (c: { first_name: string; last_name: string | null }) => `${c.first_name} ${c.last_name ?? ""}`.trim();

/** Add a contact (contactId = null) or edit an existing one. */
export async function saveContact(customerId: string, contactId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, org, user, profile } = await requireOrg();
  const values: Record<string, string | null> = {};
  for (const [col] of CONTACT_FIELDS) values[col] = str(form.get(col));
  if (values.email) values.email = values.email.toLowerCase();
  if (!values.first_name) return { error: "A contact needs at least a first name." };
  if (values.email && !EMAIL_RE.test(values.email)) return { error: "That email address doesn't look right." };

  const { data: cust, error: cErr } = await supabase.from("customers").select("id, name").eq("id", customerId).eq("organisation_id", org.id).maybeSingle();
  if (cErr || !cust) return { error: "This client no longer exists." };

  if (!contactId) {
    const { count } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("customer_id", customerId);
    const makePrimary = form.get("is_primary") === "on" || !count;
    if (makePrimary) {
      const { error: unErr } = await supabase.from("contacts").update({ is_primary: false }).eq("organisation_id", org.id).eq("customer_id", customerId).eq("is_primary", true);
      if (unErr) return { error: `Couldn't update the primary contact: ${unErr.message}` };
    }
    const { data, error } = await supabase.from("contacts").insert({
      organisation_id: org.id, customer_id: customerId, ...values, is_primary: makePrimary, created_by: user.id,
    }).select("id").single();
    if (error) return { error: `Couldn't add the contact: ${error.message}` };
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "contact.created", entityType: "contact", entityId: data.id, customerId,
      summary: `${actorName(profile)} added contact ${contactName(values as { first_name: string; last_name: string | null })} to ${cust.name}${makePrimary ? " as primary" : ""}`,
    });
    refresh(customerId);
    return undefined;
  }

  const { data: before, error: bErr } = await supabase.from("contacts").select("*").eq("id", contactId).eq("organisation_id", org.id).eq("customer_id", customerId).maybeSingle();
  if (bErr || !before) return { error: "That contact no longer exists." };
  const patch: Record<string, unknown> = {};
  const changes: Record<string, [unknown, unknown]> = {};
  for (const [col, label] of CONTACT_FIELDS) {
    if (String(before[col] ?? "") === String(values[col] ?? "")) continue;
    patch[col] = values[col];
    changes[label] = [before[col] ?? null, values[col]];
  }
  if (Object.keys(patch).length === 0) return undefined;
  const { error } = await supabase.from("contacts").update(patch).eq("id", contactId).eq("organisation_id", org.id);
  if (error) return { error: `Couldn't save the contact: ${error.message}` };
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "contact.updated", entityType: "contact", entityId: contactId, customerId,
    summary: `${actorName(profile)} updated contact ${contactName({ ...before, ...patch } as { first_name: string; last_name: string | null })}`, changes,
  });
  refresh(customerId);
  return undefined;
}

export async function setPrimaryContact(customerId: string, contactId: string): Promise<FormState> {
  const { supabase, org, user, profile } = await requireOrg();
  const { data: rows, error } = await supabase.from("contacts").select("id, first_name, last_name, is_primary")
    .eq("organisation_id", org.id).eq("customer_id", customerId);
  if (error) return { error: `Couldn't load contacts: ${error.message}` };
  const target = rows?.find((r) => r.id === contactId);
  if (!target) return { error: "That contact no longer exists." };
  if (target.is_primary) return undefined;
  const prev = rows?.find((r) => r.is_primary);
  const { error: e1 } = await supabase.from("contacts").update({ is_primary: false }).eq("organisation_id", org.id).eq("customer_id", customerId).neq("id", contactId);
  if (e1) return { error: `Couldn't change the primary contact: ${e1.message}` };
  const { error: e2 } = await supabase.from("contacts").update({ is_primary: true }).eq("organisation_id", org.id).eq("id", contactId);
  if (e2) return { error: `Couldn't change the primary contact: ${e2.message}` };
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "contact.primary_changed", entityType: "contact", entityId: contactId, customerId,
    summary: `${actorName(profile)} made ${contactName(target)} the primary contact`,
    changes: { "primary contact": [prev ? contactName(prev) : null, contactName(target)] },
  });
  refresh(customerId);
  return undefined;
}

/** Managers only. Refuses (with a reason) when the contact is still linked to events or enquiries. */
export async function removeContact(customerId: string, contactId: string): Promise<FormState> {
  const { supabase, org, user, profile, role } = await requireOrg();
  if (!canManage(role)) return { error: "Only owners, admins and managers can remove contacts." };
  const { data: c, error } = await supabase.from("contacts").select("id, first_name, last_name, is_primary, portal_user_id")
    .eq("id", contactId).eq("organisation_id", org.id).eq("customer_id", customerId).maybeSingle();
  if (error || !c) return { error: "That contact no longer exists." };
  const [ev, enq] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("primary_contact_id", contactId),
    supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("contact_id", contactId),
  ]);
  if ((ev.count ?? 0) > 0) return { error: `${contactName(c)} is the primary contact on ${ev.count} event${ev.count === 1 ? "" : "s"}. Change the event contact first.` };
  if ((enq.count ?? 0) > 0) return { error: `${contactName(c)} is linked to ${enq.count} enquir${enq.count === 1 ? "y" : "ies"}, so they can't be removed.` };

  const { error: dErr } = await supabase.from("contacts").delete().eq("id", contactId).eq("organisation_id", org.id);
  if (dErr) return { error: `Couldn't remove the contact: ${dErr.message}` };
  if (c.is_primary) {
    // Promote the longest-standing remaining contact so the client always has a primary
    const { data: next } = await supabase.from("contacts").select("id").eq("organisation_id", org.id).eq("customer_id", customerId).order("created_at").limit(1).maybeSingle();
    if (next) await supabase.from("contacts").update({ is_primary: true }).eq("id", next.id).eq("organisation_id", org.id);
  }
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "contact.removed", entityType: "contact", entityId: contactId, customerId,
    summary: `${actorName(profile)} removed contact ${contactName(c)}${c.portal_user_id ? " (their portal access ends)" : ""}`,
  });
  refresh(customerId);
  return undefined;
}
