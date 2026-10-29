import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Follow up invoice …" reminders close themselves once the invoice is paid (or voided), so nobody chases a customer
 * who's already paid. Unpaid ones stay open and remind as set. Runs on every sync and straight after a card payment.
 */
export async function closePaidInvoiceTasks(db: SupabaseClient, orgId?: string, invoiceIds?: string[]) {
  let q = db.from("tasks").select("id, organisation_id, created_by, description, auto_key").like("auto_key", "invoice-follow-up:%").neq("status", "done").limit(500);
  if (orgId) q = q.eq("organisation_id", orgId);
  if (invoiceIds?.length) q = q.in("auto_key", invoiceIds.map((i) => `invoice-follow-up:${i}`));
  const { data: tasks, error } = await q;
  if (error || !tasks?.length) return 0;
  const byInv = new Map<string, typeof tasks>();
  for (const t of tasks) { const id = String(t.auto_key).split(":")[1]; if (/^[0-9a-f-]{36}$/i.test(id)) byInv.set(id, [...(byInv.get(id) ?? []), t]); }
  const { data: invs } = await db.from("invoices").select("id, number, status, balance").in("id", [...byInv.keys()]);
  let n = 0;
  for (const inv of (invs ?? []) as { id: string; number: string; status: string; balance: number }[]) {
    const done = inv.status === "paid" || inv.status === "void" || Number(inv.balance) <= 0;
    if (!done) continue;
    for (const t of byInv.get(inv.id) ?? []) {
      const note = `Closed automatically — invoice ${inv.number} was ${inv.status === "void" ? "voided" : "paid"}.`;
      const { error: e } = await db.from("tasks").update({ status: "done", completed_at: new Date().toISOString(), description: t.description ? `${t.description}\n\n${note}` : note }).eq("id", t.id);
      if (e) continue;
      n++;
      // take the reminder off the calendar too
      try { const { syncTaskReminder } = await import("./reminders"); await syncTaskReminder(db, t.organisation_id as string, (t.created_by as string) ?? "", t.id as string); } catch { /* the calendar sync tidies it */ }
    }
  }
  return n;
}
