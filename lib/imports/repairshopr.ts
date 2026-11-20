import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages } from "@/lib/supabase/all-pages";

type Row = { name?: unknown; email?: unknown; phone?: unknown; created?: unknown };
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9@.']+/g, " ").trim();
/** RepairShopr shows phones as "Mobile 041-463-1463" / "Phone 026-112-8886": keep the first number, Australian style */
function phone(raw: string): string | null {
  const m = raw.match(/(\d[\d\s-]{6,}\d)/);
  if (!m) return null;
  const d = m[1].replace(/\D/g, "");
  if (/^04\d{8}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^0[2378]\d{8}$/.test(d)) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return d;
}
/** "Thu 03-20-25 04:45 PM" → 2025-03-20 */
function since(raw: string): string | null {
  const m = raw.match(/(\d\d)-(\d\d)-(\d\d)/);
  return m ? `20${m[3]}-${m[1]}-${m[2]}` : null;
}

/** Adds RepairShopr contacts Nerd Herd doesn't already have (matched on email, then name). Never changes existing customers. */
export async function importRepairShoprContacts(db: SupabaseClient, orgId: string, rows: Row[]) {
  const { data: have } = await allPages((a, b) => db.from("customers").select("name, company, email").eq("organisation_id", orgId).order("id").range(a, b));
  const emails = new Set<string>(), names = new Set<string>();
  for (const c of have ?? []) {
    if (c.email) emails.add(String(c.email).toLowerCase());
    for (const n of [c.name, c.company]) if (n) names.add(norm(String(n)));
  }
  const add: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const r of rows) {
    const name = str(r.name, 200), email = str(r.email, 254).toLowerCase();
    if (!name && !email) { skipped++; continue; }
    if ((email && emails.has(email)) || (name && names.has(norm(name)))) { skipped++; continue; }
    if (email) emails.add(email);
    if (name) names.add(norm(name));
    add.push({
      organisation_id: orgId, kind: "company", name: name || email, company: name || null, email: email || null, phone: phone(str(r.phone, 80)),
      source: "other", tags: ["RepairShopr contact"], customer_since: since(str(r.created, 40)) ?? new Date().toISOString().slice(0, 10),
      notes: "From the RepairShopr contact list (no tickets or invoices there). Added to Nerd Herd on 18 Nov 2026.",
    });
  }
  for (let i = 0; i < add.length; i += 200) {
    const { error } = await db.from("customers").insert(add.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  return { added: add.length, skipped };
}
