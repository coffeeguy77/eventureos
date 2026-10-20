import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOrdermentumEmail } from "./ordermentum-email";
import { matchCustomer, type MatchCustomer as Cust } from "./match";
import { deliveryDateFor, looksLikeCoffee, nameKey, weightFromName } from "./rules";
import { readWholesale } from "./settings";

/**
 * New orders from another ordering system's emails in the business's Gmail (Ordermentum: "Invoice - <Business> #OMI2706"
 * from notifications@ordermentum.com). Each email becomes a wholesale order on the right customer (a new customer is added,
 * flagged for a look, when the name isn't known). Safe to run again — an order number is only imported once.
 */
export interface EmailImportResult { found: number; imported: number; flagged: number; newCustomers: number; error?: string }

export async function importOrderEmails(db: SupabaseClient, orgId: string, opts: { max?: number } = {}): Promise<EmailImportResult> {
  const res: EmailImportResult = { found: 0, imported: 0, flagged: 0, newCustomers: 0 };
  const { data: org } = await db.from("organisations").select("settings, timezone").eq("id", orgId).single();
  const ws = readWholesale(org?.settings);
  if (!ws.emailImport.enabled) return res;
  const tz = (org?.timezone as string) || "Australia/Sydney";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const { buildContext } = await import("@/lib/integrations/sync-runner");
  const { listMessages, getMessage, parseMessage } = await import("@/lib/integrations/gmail");
  const ctx = await buildContext(db, "service", orgId, "gmail", null);

  // From a week before the newest order read from email (else the setting's start date, else 60 days back)
  const { data: last } = await db.from("wholesale_orders").select("order_date").eq("organisation_id", orgId).eq("source", "ordermentum").not("gmail_message_id", "is", null).order("order_date", { ascending: false }).limit(1).maybeSingle();
  const back = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
  const since = last?.order_date ? back(last.order_date as string, 7) : ws.emailImport.since ?? back(today, 60);
  const q = `from:${ws.emailImport.from} subject:"${ws.emailImport.subject.replace(/"/g, "")}" after:${since.replace(/-/g, "/")}`;

  const ids: string[] = [];
  let page: string | undefined;
  do {
    const r = await listMessages(ctx, q, page, 100);
    for (const m of r.messages ?? []) ids.push(m.id);
    page = r.nextPageToken;
  } while (page && ids.length < 1000);
  res.found = ids.length;
  if (!ids.length) return res;

  const { data: done } = await db.from("wholesale_orders").select("gmail_message_id").eq("organisation_id", orgId).in("gmail_message_id", ids);
  const seen = new Set(((done ?? []) as { gmail_message_id: string }[]).map((d) => d.gmail_message_id));
  const todo = ids.filter((id) => !seen.has(id)).reverse().slice(0, opts.max ?? 60); // oldest first

  const { data: cs } = await db.from("wholesale_customers").select("id, name, business_name, phone, delivery_weekday").eq("organisation_id", orgId);
  const customers = (cs ?? []) as Cust[];
  const { data: ps } = await db.from("wholesale_products").select("id, name, sku, tax_rate, weight_kg").eq("organisation_id", orgId);
  const products = (ps ?? []) as { id: string; name: string; sku: string | null; tax_rate: number; weight_kg: number | null }[];

  for (const id of todo) {
    let pm;
    try { pm = parseMessage(await getMessage(ctx, id)); } catch { continue; }
    const o = parseOrdermentumEmail(pm.subject, pm.text);
    if (!o) continue;
    // Already have this order (e.g. from the Ordermentum export)? Just remember the email.
    const { data: existing } = await db.from("wholesale_orders").select("id, gmail_message_id").eq("organisation_id", orgId).eq("number", o.orderNumber).maybeSingle();
    if (existing) { if (!existing.gmail_message_id) await db.from("wholesale_orders").update({ gmail_message_id: id }).eq("id", existing.id); continue; }

    const flags = [...o.problems];
    let cust = matchCustomer(o, customers);
    if (!cust) {
      const { data: nc, error } = await db.from("wholesale_customers").insert({
        organisation_id: orgId, name: o.customerName.slice(0, 200) || "Unknown customer", phone: o.phone, address1: o.customerBlock.replace(/\s*Phone:.*$/i, "").slice(0, 300) || null,
        source: "ordermentum", notes: "Added from an Ordermentum order email — check their details.",
      }).select("id, name, business_name, phone, delivery_weekday").single();
      if (error) { flags.push(`couldn't add the customer: ${error.message}`); }
      else { cust = nc as Cust; customers.push(cust); res.newCustomers++; flags.push("new customer — check their details"); }
    }
    const orderDate = o.orderDate ?? pm.sentAt.slice(0, 10);
    const deliveryDate = o.deliveryDate ?? deliveryDateFor(orderDate, cust?.delivery_weekday ?? ws.deliveryWeekday);
    const lines = o.lines.map((l, i) => {
      const p = products.find((x) => nameKey(x.name) === nameKey(l.name));
      return { organisation_id: orgId, product_id: p?.id ?? null, sku: p?.sku ?? null, name: l.name, quantity: l.quantity, unit_price: l.unit_price,
        tax_rate: p ? Number(p.tax_rate) : 0, line_total: l.line_total, weight_kg: p ? p.weight_kg : looksLikeCoffee(l.name) ? weightFromName(l.name) : null, position: i };
    });
    const subtotal = o.subtotal ?? lines.reduce((t, l) => t + l.line_total, 0);
    const { data: ins, error } = await db.from("wholesale_orders").insert({
      organisation_id: orgId, customer_id: cust?.id ?? null, number: o.orderNumber, invoice_number: o.invoiceNumber, source: "ordermentum",
      status: deliveryDate < today ? "delivered" : "placed", order_date: orderDate, delivery_date: deliveryDate,
      subtotal, freight: o.freight, gst: o.gst, discount: o.discount, total: o.total ?? subtotal + o.freight + o.gst,
      payment_status: "n/a", office_note: "Read from the Ordermentum order email (payment handled by Ordermentum)",
      needs_check: flags.length ? flags.join("; ").slice(0, 500) : null, gmail_message_id: id,
      ship_to: o.shipTo ? { text: o.shipTo } : null,
    }).select("id").single();
    if (error) { if (error.code !== "23505") console.error("[wholesale] import:", error.message); continue; }
    if (lines.length) await db.from("wholesale_order_lines").insert(lines.map((l) => ({ ...l, order_id: ins.id })));
    if (cust) await db.from("wholesale_customers").update({ last_order_at: pm.sentAt }).eq("id", cust.id);
    res.imported++; if (flags.length) res.flagged++;
    await db.from("notifications").insert({
      organisation_id: orgId, type: "wholesale.order", title: `Wholesale order ${o.orderNumber} — ${cust?.name ?? o.customerName}`.slice(0, 200),
      body: `${o.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")}`.slice(0, 500), link: `/wholesale/orders/${ins.id}`, entity_type: "wholesale_order", entity_id: ins.id,
    }).then(() => null, () => null);
  }
  return res;
}

/** Every business with order-email import switched on (called from the frequent Gmail sync). */
export async function runOrderEmailImports(db: SupabaseClient) {
  // Direct orders where the card payment was never finished: cancel after a day (they were never on a run sheet)
  await db.from("wholesale_orders").update({ status: "cancelled", office_note: "Card payment not finished" }).eq("status", "pending").lt("created_at", new Date(Date.now() - 86_400_000).toISOString()).then(() => null, () => null);
  const { data } = await db.from("organisations").select("id").eq("settings->wholesale->email_import->>enabled", "true");
  const out: Record<string, EmailImportResult> = {};
  for (const o of (data ?? []) as { id: string }[]) {
    try { out[o.id] = await importOrderEmails(db, o.id); } catch (e) { out[o.id] = { found: 0, imported: 0, flagged: 0, newCustomers: 0, error: e instanceof Error ? e.message : String(e) }; }
  }
  return out;
}
