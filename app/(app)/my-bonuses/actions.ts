"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { money } from "@/lib/format";
import { readBonusRates, type BonusKind } from "@/lib/bonuses/core";

type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const err = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /sales_bonuses/.test(m) && /does not exist|could not find/i.test(m) ? "Sales bonuses need the 0081 database update first: run supabase/migrations/0081_sales_bonuses.sql in Supabase (SQL editor)." : m;
};
const refresh = () => { revalidatePath("/my-bonuses"); revalidatePath("/wages"); revalidatePath("/invoices", "layout"); };

/** Credit an invoice to a team member as a new build or maintenance (or take it off them). */
export async function setInvoiceBonus(invoiceId: string, userId: string | null, kind: BonusKind): Promise<R<string>> {
  try {
    const { supabase, org, role, user, profile } = await requireOrg();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can credit sales.");
    if (!UUID.test(invoiceId)) throw new Error("Refresh and try again.");
    const { data: inv } = await supabase.from("invoices").select("id, number").eq("id", invoiceId).eq("organisation_id", org.id).maybeSingle();
    if (!inv) throw new Error("Invoice not found.");
    const { data: open } = await supabase.from("sales_bonuses").select("id, user_id, status").eq("organisation_id", org.id).eq("invoice_id", invoiceId);
    const existing = (open ?? []) as { id: string; user_id: string; status: string }[];
    if (existing.some((b) => b.status === "paid")) throw new Error("The bonus on this invoice has already been paid — undo the payment on the Wages page first.");
    if (!userId) {
      if (existing.length) await supabase.from("sales_bonuses").delete().eq("organisation_id", org.id).eq("invoice_id", invoiceId);
      refresh();
      return { ok: true, data: "No sales bonus on this invoice." };
    }
    if (!UUID.test(userId)) throw new Error("Choose who made the sale.");
    const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const rates = readBonusRates(o?.settings)[userId];
    if (!rates) throw new Error("That person has no bonus rates — set them on the Wages page.");
    const rate = kind === "build" ? rates.build : kind === "maintenance" ? rates.maintenance : 0;
    if (!rate) throw new Error("That person has no bonus for this kind of work.");
    await supabase.from("sales_bonuses").delete().eq("organisation_id", org.id).eq("invoice_id", invoiceId);
    const { error } = await supabase.from("sales_bonuses").insert({ organisation_id: org.id, user_id: userId, invoice_id: invoiceId, kind, rate, created_by: user.id });
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "invoice.bonus_set", entityType: "invoice", entityId: invoiceId,
      summary: `${actorName(profile)} credited invoice ${inv.number} as a ${kind === "build" ? "new website build" : kind} (${rate}% bonus)` });
    refresh();
    return { ok: true, data: `Credited — ${rate}% bonus once it's paid.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Owners and admins: a team member's bonus rates (blank/0 = none). */
export async function saveBonusRates(userId: string, build: number, maintenance: number): Promise<R> {
  try {
    const { supabase, org, role } = await requireOrg();
    if (role !== "owner" && role !== "admin") throw new Error("Only owners and admins can set bonus rates.");
    if (!UUID.test(userId)) throw new Error("Refresh and try again.");
    const ok = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
    if (!ok(build) || !ok(maintenance)) throw new Error("Rates are a % from 0 to 100.");
    const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const b = (settings.bonuses && typeof settings.bonuses === "object" ? settings.bonuses : {}) as Record<string, unknown>;
    const people = { ...((b.people && typeof b.people === "object" ? b.people : {}) as Record<string, unknown>) };
    if (!build && !maintenance) delete people[userId]; else people[userId] = { build, maintenance };
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, bonuses: { ...b, people } } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Owners and admins: pay the chosen bonuses (each for invoices the customer has paid in full), with the bank description. */
export async function payBonuses(ids: string[], paidOn: string, reference: string): Promise<R<string>> {
  try {
    const { supabase, org, role, user, profile } = await requireOrg();
    if (role !== "owner" && role !== "admin") throw new Error("Only owners and admins can pay bonuses.");
    if (!DATE.test(paidOn)) throw new Error("Choose the day it was paid.");
    const ref = reference.trim().slice(0, 140);
    if (!ref) throw new Error("Add the bank description, so it matches the transfer.");
    const { loadBonuses } = await import("@/lib/bonuses/server");
    const all = (await loadBonuses(supabase, org.id)) ?? [];
    const pick = all.filter((b) => ids.includes(b.id) && b.status === "open" && b.figures.paidInFull);
    if (!pick.length) throw new Error("Choose bonuses for invoices that have been paid.");
    for (const b of pick) {
      const { error } = await supabase.from("sales_bonuses").update({ status: "paid", amount_paid: b.figures.full, paid_on: paidOn, reference: ref, paid_by: user.id }).eq("id", b.id).eq("organisation_id", org.id).eq("status", "open");
      if (error) throw new Error(error.message);
    }
    const total = pick.reduce((a, b) => a + b.figures.full, 0);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "bonus.paid", entityType: "user", entityId: pick[0].user_id,
      summary: `${actorName(profile)} paid ${money(total, org.currency)} in sales bonuses (${pick.length}) — "${ref}"` });
    refresh();
    return { ok: true, data: `Marked ${money(total, org.currency)} paid (${pick.length} bonus${pick.length === 1 ? "" : "es"}).` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function undoBonusPayment(id: string): Promise<R> {
  try {
    const { supabase, org, role } = await requireOrg();
    if (role !== "owner" && role !== "admin") throw new Error("Only owners and admins can change bonus payments.");
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("sales_bonuses").update({ status: "open", amount_paid: null, paid_on: null, reference: null, paid_by: null }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}
