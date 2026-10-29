import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allocate, type Frequency, type Instalment } from "./plan";

/**
 * Payment plans: the instalments are charged to the customer's card on file on their day (8am–5pm the business's
 * time), each shared across the plan's invoices oldest first. A declined payment is retried once the next day;
 * then it's marked failed for the accounts person, with a note on the account.
 */
export async function createPlan(db: SupabaseClient, o: { orgId: string; customerId: string; invoiceIds: string[]; frequency: Frequency; schedule: Instalment[]; note: string | null; userId: string | null }) {
  const total = Math.round(o.schedule.reduce((a, x) => a + x.amount, 0) * 100) / 100;
  await db.from("payment_plans").update({ status: "cancelled" }).eq("organisation_id", o.orgId).eq("customer_id", o.customerId).eq("status", "active");
  const { data: plan, error } = await db.from("payment_plans").insert({ organisation_id: o.orgId, customer_id: o.customerId, invoice_ids: o.invoiceIds, total, frequency: o.frequency, note: o.note, ...(o.userId ? { created_by: o.userId } : {}) }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await db.from("payment_plan_instalments").insert(o.schedule.map((x) => ({ organisation_id: o.orgId, plan_id: plan.id, n: x.n, due_date: x.date, amount: x.amount })));
  if (e2) { await db.from("payment_plans").delete().eq("id", plan.id); throw new Error(e2.message); }
  return { id: plan.id as string, total };
}

export async function runPlanCharges(db: SupabaseClient) {
  const { data, error } = await db.from("payment_plan_instalments").select("id, organisation_id, plan_id, n, due_date, amount, status, attempts, plan:payment_plans(customer_id, invoice_ids, status), org:organisations(timezone, currency, status)")
    .in("status", ["scheduled", "failed"]).lt("attempts", 2).limit(100);
  if (error) return { skipped: error.message };
  let paid = 0, failed = 0;
  const { loadStripe } = await import("@/lib/payments/service");
  const { chargeCardOnFile } = await import("@/lib/payments/phone");
  for (const x of (data ?? []) as unknown as { id: string; organisation_id: string; plan_id: string; n: number; due_date: string; amount: number; status: string; attempts: number;
    plan: { customer_id: string; invoice_ids: string[]; status: string } | null; org: { timezone: string | null; currency: string | null; status: string } | null }[]) {
    if (!x.plan || x.plan.status !== "active" || x.org?.status !== "active") continue;
    const tz = x.org.timezone || "Australia/Sydney";
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
    const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
    if (x.due_date > today || hour < 8 || hour >= 17) continue;
    // a failed one is retried once, the next day
    if (x.status === "failed" && x.due_date >= today) continue;
    try {
      const cfg = await loadStripe(db, x.organisation_id);
      if (!cfg) throw new Error("Stripe isn't connected");
      // what's still owing on the plan's invoices, oldest first — the instalment is shared across them
      const { data: inv } = await db.from("invoices").select("id, balance, due_date").eq("organisation_id", x.organisation_id).in("id", x.plan.invoice_ids).gt("balance", 0).order("due_date", { ascending: true, nullsFirst: false });
      const parts = allocate(Number(x.amount), ((inv ?? []) as { id: string; balance: number }[]).map((i) => ({ id: i.id, balance: Number(i.balance) })));
      if (!parts.length) {
        await db.from("payment_plan_instalments").update({ status: "skipped", last_error: "Already paid" }).eq("id", x.id);
        continue;
      }
      const r = await chargeCardOnFile(db, x.organisation_id, cfg, { customerId: x.plan.customer_id, invoiceIds: [], currency: x.org.currency || "AUD", reason: `Payment plan ${x.n}`, email: null, amounts: parts });
      await db.from("payment_plan_instalments").update({ status: "paid", paid_at: now.toISOString(), stripe_payment: r.paymentId, attempts: x.attempts + 1, last_error: null }).eq("id", x.id);
      await db.from("collection_notes").insert({ organisation_id: x.organisation_id, customer_id: x.plan.customer_id, kind: "note", created_by: null,
        body: `Payment plan: instalment ${x.n} of ${Number(x.amount).toFixed(2)} charged to the card on file.` });
      const { count } = await db.from("payment_plan_instalments").select("id", { count: "exact", head: true }).eq("plan_id", x.plan_id).in("status", ["scheduled", "failed"]);
      if (!count) await db.from("payment_plans").update({ status: "completed" }).eq("id", x.plan_id);
      paid++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await db.from("payment_plan_instalments").update({ status: "failed", attempts: x.attempts + 1, last_error: msg }).eq("id", x.id);
      await db.from("collection_notes").insert({ organisation_id: x.organisation_id, customer_id: x.plan.customer_id, kind: "note", created_by: null,
        body: `Payment plan: instalment ${x.n} (${Number(x.amount).toFixed(2)}) couldn't be charged — ${msg}${x.attempts + 1 < 2 ? " Trying again tomorrow." : " Call them."}`,
        next_step: x.attempts + 1 < 2 ? null : "Payment plan instalment declined — call them", next_step_due: x.attempts + 1 < 2 ? null : today });
      failed++;
    }
  }
  return { paid, failed };
}
