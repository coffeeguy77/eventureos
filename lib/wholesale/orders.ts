import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCheckout, toCents, type CheckoutSession } from "@/lib/payments/stripe";
import { loadStripe } from "@/lib/payments/service";
import { appBaseUrl } from "@/lib/integrations/registry";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { wholesaleLinkEmail, wholesaleOrderEmail } from "@/lib/email/templates";
import { fmtDate, money } from "@/lib/format";
import { WEEKDAYS, deliveryDateFor, orderTotals, priceFor, type GroupPrice } from "./rules";
import { readWholesale } from "./settings";

/**
 * Direct wholesale orders: the customer's ordering link (their prices), placing an order, card payment through the
 * business's Stripe, and the confirmation. Used by /order/[token] and the Stripe webhook.
 */

export interface WsCustomer {
  id: string; organisation_id: string; name: string; email: string | null; billing_email: string | null; price_group: string | null;
  payment_mode: "card" | "invoice"; payment_terms_days: number; delivery_weekday: number | null; min_order: number; active: boolean; order_token: string;
}
export interface WsOrg { id: string; name: string; slug: string; currency: string; timezone: string; brand_colour: string | null; logo_url: string | null; contact_email: string | null; settings: Record<string, unknown> | null }
export interface CatalogueItem { id: string; sku: string | null; name: string; description: string | null; category: string | null; price: number; tax_rate: number; min_qty: number }

const CUST_COLS = "id, organisation_id, name, email, billing_email, price_group, payment_mode, payment_terms_days, delivery_weekday, min_order, active, order_token";

export async function customerByToken(db: SupabaseClient, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data: c } = await db.from("wholesale_customers").select(CUST_COLS).eq("order_token", token).maybeSingle();
  if (!c) return null;
  const { data: org } = await db.from("organisations").select("id, name, slug, currency, timezone, brand_colour, logo_url, contact_email, settings").eq("id", c.organisation_id).single();
  return { customer: c as WsCustomer, org: org as WsOrg };
}

export async function catalogueFor(db: SupabaseClient, c: Pick<WsCustomer, "organisation_id" | "price_group">): Promise<CatalogueItem[]> {
  const [{ data: ps }, { data: gp }] = await Promise.all([
    db.from("wholesale_products").select("id, sku, name, description, category, unit_price, tax_rate, min_qty").eq("organisation_id", c.organisation_id).eq("active", true).order("category").order("position"),
    c.price_group ? db.from("wholesale_group_prices").select("product_id, price_group, unit_price").eq("organisation_id", c.organisation_id).eq("price_group", c.price_group) : Promise.resolve({ data: [] }),
  ]);
  const groups = ((gp ?? []) as GroupPrice[]).map((g) => ({ ...g, unit_price: Number(g.unit_price) }));
  return ((ps ?? []) as { id: string; sku: string | null; name: string; description: string | null; category: string | null; unit_price: number; tax_rate: number; min_qty: number }[])
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name, description: p.description, category: p.category, price: priceFor({ id: p.id, unit_price: Number(p.unit_price), tax_rate: Number(p.tax_rate) }, c.price_group, groups), tax_rate: Number(p.tax_rate), min_qty: p.min_qty }));
}

export const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Australia/Sydney" }).format(new Date());

export function orderLink(token: string) { return `${appBaseUrl()}/order/${token}`; }

export type PlaceResult = { ok: true; redirect?: string; number: string } | { ok: false; error: string };

/** Place an order from the ordering link. Card customers go to Stripe; account customers' orders go straight through. */
export async function placeOrder(db: SupabaseClient, token: string, items: { product_id: string; quantity: number }[], note: string | null): Promise<PlaceResult> {
  const found = await customerByToken(db, token);
  if (!found || !found.customer.active) return { ok: false, error: "This ordering link isn't active — please contact us." };
  const { customer: c, org } = found;
  const ws = readWholesale(org.settings);
  if (!ws.ordering) return { ok: false, error: `Online ordering isn't open yet — please contact ${org.name}.` };
  const cat = new Map((await catalogueFor(db, c)).map((p) => [p.id, p]));
  const lines = [];
  for (const it of items) {
    const q = Math.round(Number(it.quantity));
    if (!q) continue;
    const p = cat.get(String(it.product_id));
    if (!p) return { ok: false, error: "Something on your order isn't available any more — refresh the page and try again." };
    if (q < 0 || q > 1000) return { ok: false, error: `${p.name}: choose a number from ${p.min_qty} to 1,000.` };
    if (q < p.min_qty) return { ok: false, error: `${p.name}: the minimum is ${p.min_qty}.` };
    lines.push({ p, q });
  }
  if (!lines.length) return { ok: false, error: "Add something to your order first." };
  const goods = lines.reduce((t, l) => t + l.q * l.p.price, 0);
  if (c.min_order > 0 && goods < c.min_order) return { ok: false, error: `The minimum order is ${money(c.min_order, org.currency)} (before GST).` };
  const freight = ws.freight > 0 && !(ws.freeFreightOver > 0 && goods >= ws.freeFreightOver) ? ws.freight : 0;
  const t = orderTotals(lines.map((l) => ({ quantity: l.q, unit_price: l.p.price, tax_rate: l.p.tax_rate })), freight);
  const today = todayIn(org.timezone);
  const delivery = deliveryDateFor(today, c.delivery_weekday ?? ws.deliveryWeekday);

  const { data: seq, error: sErr } = await db.rpc("wholesale_next_seq", { p_org: org.id });
  if (sErr) return { ok: false, error: "Couldn't place the order — please try again." };
  const number = `W-${seq}`;
  const card = c.payment_mode === "card";
  const due = new Date(`${today}T00:00:00Z`); due.setUTCDate(due.getUTCDate() + (card ? 0 : c.payment_terms_days));
  const { data: order, error } = await db.from("wholesale_orders").insert({
    organisation_id: org.id, customer_id: c.id, number, seq, source: "eventureos", status: card ? "pending" : "placed",
    order_date: today, delivery_date: delivery, subtotal: t.subtotal, freight: t.freight, gst: t.gst, total: t.total,
    payment_mode: c.payment_mode, payment_status: "unpaid", due_date: due.toISOString().slice(0, 10), customer_note: note?.trim().slice(0, 1000) || null,
  }).select("id, view_token").single();
  if (error) return { ok: false, error: error.code === "23505" ? "Someone else just ordered — please press the button again." : "Couldn't place the order — please try again." };
  await db.from("wholesale_order_lines").insert(lines.map((l, i) => ({
    organisation_id: org.id, order_id: order.id, product_id: l.p.id, sku: l.p.sku, name: l.p.name, quantity: l.q, unit_price: l.p.price, tax_rate: l.p.tax_rate,
    line_total: Math.round(l.q * l.p.price * 100) / 100, position: i,
  })));

  if (!card) { await orderPlaced(db, org, order.id as string, "account"); return { ok: true, number }; }
  try {
    const cfg = await loadStripe(db, org.id);
    if (!cfg) throw new Error("card payments aren't set up");
    const cs = await createCheckout(cfg.secretKey, {
      amountCents: toCents(t.total), currency: org.currency, name: `${org.name} order ${number}`, email: c.billing_email || c.email,
      description: lines.map((l) => `${l.q} × ${l.p.name}`).join(", ").slice(0, 400),
      successUrl: `${orderLink(token)}?placed=${order.view_token}`, cancelUrl: `${orderLink(token)}?cancelled=1`,
      metadata: { eventureos_wholesale_order: order.id as string, eventureos_org_id: org.id }, idempotencyKey: `wholesale-${order.id}`, account: cfg.account,
    });
    if (!cs.url) throw new Error("Stripe didn't return a payment page");
    await db.from("wholesale_orders").update({ stripe_session_id: cs.id }).eq("id", order.id);
    return { ok: true, redirect: cs.url, number };
  } catch (e) {
    await db.from("wholesale_orders").update({ status: "cancelled", office_note: "Card payment page couldn't be opened" }).eq("id", order.id);
    return { ok: false, error: `Couldn't open the card payment page: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Card paid (Stripe webhook, or the return page if the webhook is slow). Safe to call twice. */
export async function settleWholesaleCheckout(db: SupabaseClient, orgId: string, orderId: string, s: (CheckoutSession & { id: string }) | null): Promise<string> {
  const { data: upd } = await db.from("wholesale_orders").update({ status: "placed", payment_status: "paid", paid_at: new Date().toISOString(), stripe_session_id: s?.id ?? undefined, stripe_payment_intent: s?.payment_intent ?? null })
    .eq("id", orderId).eq("organisation_id", orgId).eq("status", "pending").select("id, number");
  if (!upd?.length) return "already settled";
  const { data: org } = await db.from("organisations").select("id, name, slug, currency, timezone, brand_colour, logo_url, contact_email, settings").eq("id", orgId).single();
  await orderPlaced(db, org as WsOrg, orderId, "card");
  return `wholesale order ${upd[0].number} paid`;
}

export async function settleFromReturn(db: SupabaseClient, orgId: string, viewToken: string) {
  const { data: o } = await db.from("wholesale_orders").select("id, status, stripe_session_id").eq("organisation_id", orgId).eq("view_token", viewToken).maybeSingle();
  if (!o || o.status !== "pending" || !o.stripe_session_id) return;
  try {
    const cfg = await loadStripe(db, orgId);
    if (!cfg) return;
    const { getCheckoutSession } = await import("@/lib/payments/stripe");
    const s = await getCheckoutSession(cfg.secretKey, o.stripe_session_id as string, cfg.account);
    if (s.payment_status === "paid" && s.metadata?.eventureos_wholesale_order === o.id) await settleWholesaleCheckout(db, orgId, o.id as string, s as CheckoutSession & { id: string });
  } catch (e) { console.error("[wholesale] settle from return:", e); }
}

async function orderPlaced(db: SupabaseClient, org: WsOrg, orderId: string, how: "card" | "account") {
  const { data: o } = await db.from("wholesale_orders").select("number, total, delivery_date, due_date, customer:wholesale_customers(name, email, billing_email, order_token), lines:wholesale_order_lines(name, quantity, line_total, position)").eq("id", orderId).single();
  if (!o) return;
  const cust = o.customer as unknown as { name: string; email: string | null; billing_email: string | null; order_token: string } | null;
  const lines = ((o.lines ?? []) as { name: string; quantity: number; line_total: number; position: number }[]).sort((a, b) => a.position - b.position);
  const delivery = o.delivery_date ? fmtDate(o.delivery_date as string, "long") : "on the next run";
  await db.from("notifications").insert({
    organisation_id: org.id, type: "wholesale.order", title: `Wholesale order ${o.number} — ${cust?.name ?? ""}`.slice(0, 200),
    body: `${lines.map((l) => `${Number(l.quantity)} × ${l.name}`).join(", ")} · ${money(o.total, org.currency)}${how === "card" ? " paid by card" : " on account"}`.slice(0, 500),
    link: `/wholesale/orders/${orderId}`, entity_type: "wholesale_order", entity_id: orderId,
  }).then(() => null, () => null);
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "customer", actor_label: cust?.name ?? "Wholesale customer", action: "wholesale.order_placed", entity_type: "wholesale_order", entity_id: orderId,
    summary: `${cust?.name ?? "A customer"} placed wholesale order ${o.number} (${money(o.total, org.currency)}${how === "card" ? ", paid by card" : ", on account"}) for ${delivery}` }).then(() => null, () => null);
  const to = cust?.billing_email || cust?.email;
  if (to && cust && emailConfigured()) {
    const m = wholesaleOrderEmail({
      businessName: org.name, customerName: cust.name, number: o.number as string, delivery, lines: lines.map((l) => `${Number(l.quantity)} × ${l.name} — ${money(l.line_total, org.currency, { cents: true })}`),
      total: money(o.total, org.currency, { cents: true }), paidNote: how === "card" ? "Paid by card — thank you." : `On your account${o.due_date ? `, due ${fmtDate(o.due_date as string, "long")}` : ""}.`,
      url: orderLink(cust.order_token), brand: org.brand_colour, logoUrl: org.logo_url,
    });
    await sendEmail({ to, ...m, replyTo: org.contact_email, fromName: org.name }).catch((e) => console.error("[wholesale] confirmation email:", e));
  }
}

/** Email a customer their ordering link (only when the business clicks the button). */
export async function emailOrderingLink(db: SupabaseClient, customerId: string) {
  const { data: c } = await db.from("wholesale_customers").select("name, email, billing_email, order_token, delivery_weekday, organisation_id").eq("id", customerId).single();
  if (!c) throw new Error("Customer not found.");
  const to = c.email || c.billing_email;
  if (!to) throw new Error(`${c.name} has no email address.`);
  if (!emailConfigured()) throw new Error("Email isn't set up.");
  const { data: org } = await db.from("organisations").select("name, brand_colour, logo_url, contact_email, settings").eq("id", c.organisation_id).single();
  const ws = readWholesale(org?.settings);
  const m = wholesaleLinkEmail({ businessName: org!.name as string, customerName: c.name as string, deliveryDay: WEEKDAYS[(c.delivery_weekday as number | null) ?? ws.deliveryWeekday], url: orderLink(c.order_token as string), brand: org?.brand_colour as string | null, logoUrl: org?.logo_url as string | null });
  await sendEmail({ to: to as string, ...m, replyTo: org?.contact_email as string | null, fromName: org!.name as string });
  return to as string;
}
