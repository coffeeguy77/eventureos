import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allocate, stepDays, type Frequency } from "@/lib/accounts/plan";
import { createCheckout, createSetupCheckout, createStripeCustomer, getSetupIntent, toCents, type CheckoutSession } from "./stripe";
import type { StripeConfig } from "./service";

/**
 * Starting a payment plan with the card taken on Stripe's page — over the phone by the team, or by the customer
 * themselves ("pay in 4" on an overdue statement):
 *  - first payment now: the card page takes instalment 1 (shared across the invoices, oldest first) and keeps the card;
 *  - first payment later (e.g. on payday): the card page just saves the card.
 * When Stripe confirms, the plan is created with the rest of the schedule, charged automatically on each day.
 */
const UUID = /^[0-9a-f-]{36}$/i;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export interface PlanSpec { customerId: string; invoiceIds: string[]; frequency: Frequency; start: string; amounts: number[]; firstNow: boolean; staffId: string | null; source: "phone" | "customer" }

function specMeta(p: PlanSpec): Record<string, string> {
  return {
    eventureos_plan: "1", eventureos_plan_c: p.customerId, eventureos_plan_i: p.invoiceIds.join(","), eventureos_plan_f: p.frequency, eventureos_plan_s: p.start,
    eventureos_plan_a: p.amounts.map((a) => a.toFixed(2)).join(","), eventureos_plan_first: p.firstNow ? "1" : "0", eventureos_plan_src: p.source, ...(p.staffId ? { eventureos_staff: p.staffId } : {}),
  };
}
function readSpec(m: Record<string, string> | null | undefined): PlanSpec | null {
  if (!m || m.eventureos_plan !== "1" || !UUID.test(m.eventureos_plan_c ?? "")) return null;
  const amounts = (m.eventureos_plan_a ?? "").split(",").map(Number).filter((x) => x > 0);
  const invoiceIds = (m.eventureos_plan_i ?? "").split(",").filter((x) => UUID.test(x));
  if (!amounts.length || !invoiceIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(m.eventureos_plan_s ?? "")) return null;
  return { customerId: m.eventureos_plan_c, invoiceIds, frequency: m.eventureos_plan_f === "weekly" ? "weekly" : "fortnightly", start: m.eventureos_plan_s, amounts,
    firstNow: m.eventureos_plan_first === "1", staffId: UUID.test(m.eventureos_staff ?? "") ? m.eventureos_staff : null, source: m.eventureos_plan_src === "customer" ? "customer" : "phone" };
}

export async function startPlanCheckout(db: SupabaseClient, orgId: string, cfg: StripeConfig, o: { spec: PlanSpec; currency: string; customerName: string; email: string | null; successUrl: string; cancelUrl: string }) {
  const p = o.spec;
  if (p.amounts.length > 40) throw new Error("That's too many payments for one plan (40 at most).");
  const { data: inv, error } = await db.from("invoices").select("id, number, balance, due_date, customer_id, status").eq("organisation_id", orgId).in("id", p.invoiceIds).order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const list = ((inv ?? []) as { id: string; number: string; balance: number; customer_id: string; status: string }[]).filter((i) => i.customer_id === p.customerId && Number(i.balance) > 0 && !["void", "draft", "paid"].includes(i.status));
  if (!list.length) throw new Error("Those invoices are already paid.");
  const meta = { eventureos_org_id: orgId, eventureos_customer: p.customerId, ...specMeta({ ...p, invoiceIds: list.map((i) => i.id) }) };
  const { data: card } = await db.from("customer_cards").select("stripe_customer").eq("organisation_id", orgId).eq("customer_id", p.customerId).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const key = `plan-${p.customerId}-${p.amounts.join("_")}-${p.start}-${p.firstNow ? 1 : 0}-${Math.floor(Date.now() / 60000)}`;
  if (p.firstNow) {
    const parts = allocate(p.amounts[0], list.map((i) => ({ id: i.id, balance: Number(i.balance) })));
    const s = await createCheckout(cfg.secretKey, {
      amountCents: toCents(p.amounts[0]), currency: o.currency, name: `Payment plan — payment 1 of ${p.amounts.length}`,
      description: `Invoice${list.length > 1 ? "s" : ""} ${list.map((i) => i.number).join(", ")} · then ${p.amounts.length - 1} ${p.frequency} payments`.slice(0, 300),
      email: o.email, successUrl: o.successUrl, cancelUrl: o.cancelUrl, idempotencyKey: key, account: cfg.account,
      metadata: { ...meta, eventureos_invoice_ids: parts.map((x) => x.id).join(","), eventureos_alloc: parts.map((x) => toCents(x.amount)).join(","), eventureos_save_card: "1",
        eventureos_consent: `Agreed to a payment plan (${p.amounts.length} ${p.frequency} payments) and to keep the card on file for it — ${p.source === "customer" ? "set up by the customer online" : "taken over the phone"}, ${new Date().toISOString().slice(0, 10)}` },
      saveCard: { customerId: (card?.stripe_customer as string | undefined) ?? null },
    });
    if (!s.url) throw new Error("Stripe didn't return a payment page.");
    return s.url;
  }
  const customer = (card?.stripe_customer as string | undefined) ?? (await createStripeCustomer(cfg.secretKey, { name: o.customerName, email: o.email, metadata: { eventureos_customer: p.customerId }, idempotencyKey: `cust-${p.customerId}`, account: cfg.account })).id;
  const s = await createSetupCheckout(cfg.secretKey, { customer, currency: o.currency, successUrl: o.successUrl, cancelUrl: o.cancelUrl, metadata: meta, idempotencyKey: key, account: cfg.account });
  if (!s.url) throw new Error("Stripe didn't return a card page.");
  return s.url;
}

/** Stripe confirmed the card (and the first payment, when there was one): set the plan up. */
export async function finishPlanCheckout(db: SupabaseClient, orgId: string, cfg: StripeConfig, s: CheckoutSession & { id: string; mode?: string; setup_intent?: string | null }): Promise<string> {
  const p = readSpec(s.metadata);
  if (!p) return "not a payment plan";
  // the card: saved from the setup (a payment's card is saved by the payment itself)
  if (s.mode === "setup" && s.setup_intent) {
    const si = await getSetupIntent(cfg.secretKey, s.setup_intent, cfg.account);
    const pm = typeof si.payment_method === "object" && si.payment_method ? si.payment_method : null;
    if (!si.customer || !pm?.id) throw new Error("Stripe didn't return the saved card");
    await db.from("customer_cards").update({ active: false }).eq("organisation_id", orgId).eq("customer_id", p.customerId).eq("active", true);
    await db.from("customer_cards").insert({ organisation_id: orgId, customer_id: p.customerId, stripe_customer: si.customer, payment_method: pm.id, brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null,
      exp_month: pm.card?.exp_month ?? null, exp_year: pm.card?.exp_year ?? null, consent: `Agreed to a payment plan (${p.amounts.length} ${p.frequency} payments) and to keep the card on file for it — ${p.source === "customer" ? "set up by the customer online" : "taken over the phone"}, ${new Date().toISOString().slice(0, 10)}`, added_by: p.staffId });
  }
  const { data: dupe } = await db.from("payment_plans").select("id").eq("organisation_id", orgId).eq("customer_id", p.customerId).eq("note", `stripe:${s.id}`).maybeSingle();
  if (dupe) return "plan already set up";
  const step = stepDays(p.frequency);
  const schedule = p.amounts.map((amount, i) => ({ n: i + 1, date: addDays(p.start, i * step), amount }));
  const { createPlan } = await import("@/lib/accounts/plans");
  const plan = await createPlan(db, { orgId, customerId: p.customerId, invoiceIds: p.invoiceIds, frequency: p.frequency, schedule, note: `stripe:${s.id}`, userId: p.staffId });
  if (p.firstNow) await db.from("payment_plan_instalments").update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment: s.payment_intent ?? s.id, attempts: 1 }).eq("plan_id", plan.id).eq("n", 1);
  const r2 = (n: number) => n.toFixed(2);
  await db.from("collection_notes").insert({ organisation_id: orgId, customer_id: p.customerId, kind: "plan", created_by: p.staffId,
    body: `Payment plan ${p.source === "customer" ? "set up by the customer online" : "set up over the phone"}: ${p.amounts.length} ${p.frequency} payments of ${r2(p.amounts[0])}${p.amounts.at(-1) !== p.amounts[0] ? ` (last ${r2(p.amounts.at(-1)!)})` : ""} from ${p.start}${p.firstNow ? " — the first was paid today" : ""}.` });
  return `payment plan set up (${p.amounts.length} payments)`;
}
