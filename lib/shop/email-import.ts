import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextDispatch, readShop, type Address } from "./core";
import { parseWooOrderEmail, type WooEmailAddress } from "./woo-email";
import { customerFor } from "./woo";

/**
 * Shop orders from WooCommerce's order emails in the business's Gmail ("[Shop]: New order #54715" and
 * "[Shop] New subscription renewal order (54718) …"). Each becomes a shop order to pack and post here.
 * Bookings (e.g. Bookly barista courses) and emailed gift cards in those emails are left out — they belong to the
 * booking system. Nothing is sent to customers, and WooCommerce itself is never changed.
 * Settings: organisations.settings.shop_import = { enabled, subjects: [...], since: "YYYY-MM-DD", skipped: [gmail ids] }.
 */
export interface ShopImportSettings { enabled: boolean; subjects: string[]; since: string | null; skipped: string[] }
export function readShopImport(settings: unknown, orgName: string): ShopImportSettings {
  const r = (((settings ?? {}) as Record<string, unknown>).shop_import ?? {}) as Record<string, unknown>;
  const subjects = (Array.isArray(r.subjects) ? r.subjects : []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 120)).slice(0, 6);
  return {
    enabled: r.enabled === true,
    subjects: subjects.length ? subjects : [`[${orgName}]: New order`, `[${orgName}] New subscription renewal order`],
    since: typeof r.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.since) ? r.since : null,
    skipped: (Array.isArray(r.skipped) ? r.skipped : []).filter((x): x is string => typeof x === "string").slice(-400),
  };
}

export interface ShopImportResult { found: number; imported: number; bookings: number; flagged: number; error?: string }

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const toAddress = (a: WooEmailAddress | null): Address | Record<string, never> => a
  ? { name: a.name, company: a.company, line1: a.line1, line2: a.line2, suburb: a.suburb, state: a.state, postcode: a.postcode, country: "AU", phone: a.phone }
  : {};

export async function importShopOrderEmails(db: SupabaseClient, orgId: string, opts: { max?: number } = {}): Promise<ShopImportResult> {
  const res: ShopImportResult = { found: 0, imported: 0, bookings: 0, flagged: 0 };
  const { data: org } = await db.from("organisations").select("name, settings, timezone").eq("id", orgId).single();
  const cfg = readShopImport(org?.settings, (org?.name as string) ?? "");
  if (!cfg.enabled) return res;
  const shop = readShop(org?.settings);
  const tz = (org?.timezone as string) || "Australia/Sydney";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const back = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };

  const { buildContext } = await import("@/lib/integrations/sync-runner");
  const { listMessages, getMessage, parseMessage } = await import("@/lib/integrations/gmail");
  const ctx = await buildContext(db, "service", orgId, "gmail", null);

  // From a few days before the newest order read from email (else the start date set when it was switched on)
  const { data: last } = await db.from("shop_orders").select("created_at").eq("organisation_id", orgId).eq("source", "woocommerce").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const lastDay = last?.created_at ? String(last.created_at).slice(0, 10) : null;
  const since = lastDay && (!cfg.since || lastDay > cfg.since) ? back(lastDay, 3) : cfg.since ?? back(today, 7);
  const q = `subject:(${cfg.subjects.map((s) => `"${s.replace(/"/g, "")}"`).join(" OR ")}) after:${since.replace(/-/g, "/")}`;

  const ids: string[] = [];
  let page: string | undefined;
  do {
    const r = await listMessages(ctx, q, page, 100);
    for (const m of r.messages ?? []) ids.push(m.id);
    page = r.nextPageToken;
  } while (page && ids.length < 600);
  res.found = ids.length;
  const skipped = new Set(cfg.skipped);
  const todo = ids.filter((id) => !skipped.has(id)).reverse().slice(0, opts.max ?? 40); // oldest first
  if (!todo.length) return res;

  const { data: ps } = await db.from("shop_products").select("id, name, variants:shop_variants(id, label)").eq("organisation_id", orgId);
  const products = (ps ?? []) as { id: string; name: string; variants: { id: string; label: string }[] }[];
  const productFor = (name: string) => {
    const n = norm(name);
    return products.find((p) => norm(p.name) === n) ?? products.find((p) => norm(p.name) && (n.startsWith(norm(p.name)) || norm(name.split("|")[0]) === norm(p.name))) ?? null;
  };
  const cache = new Map<string, string>();
  const newlySkipped: string[] = [];

  for (const id of todo) {
    let pm;
    try { pm = parseMessage(await getMessage(ctx, id)); } catch { continue; }
    const o = pm.html ? parseWooOrderEmail(pm.subject ?? "", pm.html) : null;
    if (!o) { newlySkipped.push(id); continue; }
    if (!o.items.length) { newlySkipped.push(id); if (o.bookingItems) res.bookings++; continue; } // bookings / gift cards: the booking system's
    const { data: have } = await db.from("shop_orders").select("id").eq("organisation_id", orgId).eq("woo_id", o.number).maybeSingle();
    if (have) { newlySkipped.push(id); continue; }

    const flags = [...o.problems];
    if (o.bookingItems) flags.push(`${o.bookingItems} booking item${o.bookingItems === 1 ? "" : "s"} left for the booking system`);
    if (o.giftCardItems) flags.push(`${o.giftCardItems} emailed gift card${o.giftCardItems === 1 ? "" : "s"} left out`);
    const items = o.items.map((i) => {
      const p = productFor(i.name);
      const v = p && i.size ? p.variants.find((x) => norm(x.label) === norm(i.size!)) ?? null : null;
      const unit = Math.round((i.lineTotal / i.qty) * 100) / 100;
      const extra = Object.entries(i.options).filter(([k]) => !/size|weight|amount|grind/i.test(k)).map(([k, val]) => `${k} ${val}`).join("; ");
      return {
        product_id: p?.id ?? null, variant_id: v?.id ?? null, woo_product_id: null, woo_variation_id: null, sku: i.sku,
        name: i.name, variant: i.size ?? "", grind: i.grind, adjust: 0, grind_label: i.grind, qty: i.qty, unit_price: unit, list_price: unit, line_total: i.lineTotal, kind: "coffee",
        ...(extra ? { note: extra.slice(0, 300) } : {}),
      };
    });
    const email = o.email ?? o.billing?.email ?? null;
    const name = o.customerName ?? o.billing?.name ?? null;
    const phone = o.phone ?? o.billing?.phone ?? null;
    const customerId = email ? await customerFor(db, orgId, cache, { email, name, phone }).catch(() => null) : null;
    let subscriptionId: string | null = null;
    if (o.subscriptionNumber) {
      const { data: sub } = await db.from("shop_subscriptions").select("id").eq("organisation_id", orgId).eq("woo_id", o.subscriptionNumber).maybeSingle();
      subscriptionId = (sub?.id as string | undefined) ?? null;
    }
    const orderDay = o.date ?? pm.sentAt.slice(0, 10);
    const address = toAddress(o.shipping_address ?? o.billing);
    const post = !o.pickup;
    if (post && !("line1" in address)) flags.push("no delivery address");
    const row = {
      organisation_id: orgId, woo_id: o.number, woo_status: "processing", number: o.number, customer_id: customerId, subscription_id: subscriptionId,
      status: "paid", kind: o.kind, source: "woocommerce", email, name, phone,
      delivery: post ? "post" : "pickup", address, items,
      subtotal: o.subtotal ?? Math.round(items.reduce((t, i) => t + i.line_total, 0) * 100) / 100, discount: o.discount, shipping: o.shipping, total: o.total ?? 0, currency: "AUD",
      customer_note: o.note,
      office_note: [`From the WooCommerce order email${o.paymentMethod ? ` · paid by ${o.paymentMethod}` : ""}${o.shippingMethod ? ` · shipping: ${o.shippingMethod}` : ""}`, o.subscriptionNumber ? `WooCommerce subscription #${o.subscriptionNumber}${o.recurring ? ` (${o.recurring})` : ""}` : null, flags.length ? `Check: ${flags.join("; ")}` : null].filter(Boolean).join("\n").slice(0, 2000),
      dispatch_on: post ? nextDispatch(orderDay > today ? orderDay : today, shop, orderDay >= today ? shop.leadDays : 0) : null,
      paid_at: pm.sentAt, created_at: pm.sentAt,
    };
    let ins = await db.from("shop_orders").insert(row).select("id").single();
    if (ins.error && /number/.test(ins.error.message) && /duplicate|unique/i.test(ins.error.message)) {
      const { data: num } = await db.rpc("shop_next_order_number", { p_org: orgId });
      ins = await db.from("shop_orders").insert({ ...row, number: num as number, office_note: `WooCommerce order #${o.number}\n${row.office_note}`.slice(0, 2000) }).select("id").single();
    }
    if (ins.error) { console.error("[shop email import]", o.number, ins.error.message); continue; }
    res.imported++; if (flags.length) res.flagged++;
    await db.from("notifications").insert({
      organisation_id: orgId, type: "shop.order", title: `Shop order #${o.number} — ${name ?? "customer"}`.slice(0, 200),
      body: items.map((i) => `${i.qty} × ${i.name}${i.variant ? ` ${i.variant}` : ""}${i.grind_label ? ` (${i.grind_label})` : ""}`).join(", ").slice(0, 500),
      link: `/store/orders/${ins.data.id}`, entity_type: "shop_order", entity_id: ins.data.id,
    }).then(() => null, () => null);
  }

  if (newlySkipped.length) {
    // Remember emails with nothing to post so they aren't read again
    const { data: fresh } = await db.from("organisations").select("settings").eq("id", orgId).single();
    const settings = (fresh?.settings ?? {}) as Record<string, unknown>;
    const cur = (settings.shop_import ?? {}) as Record<string, unknown>;
    const list = [...new Set([...(Array.isArray(cur.skipped) ? (cur.skipped as string[]) : []), ...newlySkipped])].slice(-400);
    await db.from("organisations").update({ settings: { ...settings, shop_import: { ...cur, skipped: list } } }).eq("id", orgId);
  }
  return res;
}

/** Every business with shop order emails switched on (called from the frequent Gmail sync). */
export async function runShopEmailImports(db: SupabaseClient) {
  const { data } = await db.from("organisations").select("id").eq("settings->shop_import->>enabled", "true");
  const out: Record<string, ShopImportResult> = {};
  for (const o of (data ?? []) as { id: string }[]) {
    try { out[o.id] = await importShopOrderEmails(db, o.id); } catch (e) { out[o.id] = { found: 0, imported: 0, bookings: 0, flagged: 0, error: e instanceof Error ? e.message : String(e) }; }
  }
  return out;
}
