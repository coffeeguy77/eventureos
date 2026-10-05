import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gramsOf, slugify } from "./core";
import { copiedText, decode, grindName, splitDescription } from "./woo-text";
export { copiedText, decode, grindName, splitDescription };

/**
 * Moving a WooCommerce shop into EventureOS. Takes WooCommerce REST API (wc/v3) objects as WooCommerce returns them.
 * Safe to run again: everything is matched on its WooCommerce id (or email for customers) and updated, never duplicated.
 * Imported subscriptions are marked billing = 'woocommerce' — EventureOS never charges them.
 * Product text that's obviously been copied from another product is left out rather than published (see `copiedText`).
 */

type J = Record<string, unknown>;
const s = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : v === null || v === undefined ? "" : String(v).slice(0, max));
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const text = (html: unknown) => decode(s(html, 20000).replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|h\d|li)>/gi, "\n\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*(\n\s*)+/g, "\n\n").trim();
const isoDate = (v: unknown) => { const t = s(v, 40); return /^\d{4}-\d{2}-\d{2}/.test(t) ? (t.endsWith("Z") ? t : `${t}Z`) : null; };
const ymd = (v: unknown) => { const t = isoDate(v); return t ? t.slice(0, 10) : null; };

const isGrindAttr = (name: string) => /grind/i.test(name);
const isSizeAttr = (name: string) => /size|weight|amount/i.test(name);



async function existingMap(db: SupabaseClient, table: string, orgId: string, col = "woo_id") {
  const out = new Map<number, string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from(table).select(`id, ${col}`).eq("organisation_id", orgId).not(col, "is", null).range(from, from + 999);
    for (const r of (data ?? []) as unknown as J[]) out.set(Number(r[col]), r.id as string);
    if (!data || data.length < 1000) break;
  }
  return out;
}

/* ------------------------------------------------------------------ products */

export async function importProducts(db: SupabaseClient, orgId: string, products: J[]) {
  const have = await existingMap(db, "shop_products", orgId);
  const out = { products: 0, updated: 0, skipped: 0, sizes: 0, held_back_text: [] as string[], subscription_plans: null as null | { discount: number; frequencies: { unit: string; count: number }[] } };
  let pos = 0;
  for (const p of products) {
    const name = decode(s(p.name, 120)).trim();
    const id = n(p.id);
    // Course products belong to Bookings; shop gift cards are handled by the gift card page
    if (!name || /barista/i.test(name) || /gift card/i.test(name)) { out.skipped++; continue; }
    const attrs = (p.attributes as J[] | undefined) ?? [];
    const grindAttr = attrs.find((a) => isGrindAttr(s(a.name)));
    const grinds = ((grindAttr?.options as string[] | undefined) ?? []).map(grindName);
    const variations = ((p._variations ?? p.variations_data ?? []) as J[]).filter((v) => typeof v === "object" && v);
    // Sizes: one variant per size (grind is a free choice)
    const bySize = new Map<string, { price: number; ids: number[] }>();
    for (const v of variations) {
      const va = (v.attributes as J[] | undefined) ?? [];
      const size = decode(s(va.find((a) => isSizeAttr(s(a.name)))?.option ?? "", 60)).trim() || "One size";
      const e = bySize.get(size) ?? { price: n(v.regular_price || v.price), ids: [] };
      e.ids.push(n(v.id));
      bySize.set(size, e);
    }
    if (!bySize.size) bySize.set("One size", { price: n(p.regular_price || p.price), ids: [] });
    const order = (l: string) => gramsOf(l) ?? 99999;
    const sizes = [...bySize.entries()].sort((a, b) => order(a[0]) - order(b[0]));
    const descRaw = text(p.description);
    const shortRaw = text(p.short_description);
    const split = splitDescription(descRaw);
    const copied = copiedText(name, descRaw);
    if (copied) out.held_back_text.push(name);
    const cats = ((p.categories as J[] | undefined) ?? []).map((c) => decode(s(c.name, 60))).filter((c) => !/uncategori[sz]ed/i.test(c));
    const plans = (((p.meta_data as J[] | undefined) ?? []).find((m) => m.key === "_bos4w_saved_subs")?.value as J[] | undefined) ?? null;
    if (plans?.length && !out.subscription_plans) out.subscription_plans = { discount: n(plans[0].subscription_discount), frequencies: plans.map((x) => ({ unit: s(x.subscription_period), count: n(x.subscription_period_interval) })) };
    const row = {
      organisation_id: orgId, woo_id: id, name, slug: slugify(s(p.slug) || name), kind: "coffee",
      category: cats[0] ?? null, short: copied ? null : shortRaw.slice(0, 400) || null,
      description: copied ? null : split.description?.slice(0, 8000) ?? null, best_for: split.bestFor?.slice(0, 120) ?? null,
      image_url: (((p.images as J[] | undefined) ?? [])[0]?.src as string | undefined)?.replace(/^http:/, "https:") ?? null,
      images: ((p.images as J[] | undefined) ?? []).map((i) => s(i.src).replace(/^http:/, "https:")).filter((u) => u.startsWith("https://")).slice(0, 8),
      grinds, subscribable: grinds.length > 0, featured: !!p.featured, status: p.status === "publish" ? "active" : "draft", position: n(p.menu_order) || pos++,
    };
    let pid = have.get(id);
    if (pid) {
      // Keep anything the office has written since; only fill blanks and refresh images/status
      const { data: cur } = await db.from("shop_products").select("short, description, best_for, tasting_notes, category").eq("id", pid).single();
      const patch: J = { name: row.name, image_url: row.image_url, images: row.images, grinds: row.grinds, status: row.status };
      for (const k of ["short", "description", "best_for", "category"] as const) if (!cur?.[k] && row[k]) patch[k] = row[k];
      await db.from("shop_products").update(patch).eq("id", pid);
      out.updated++;
    } else {
      let { data, error } = await db.from("shop_products").insert(row).select("id").single();
      if (error && /duplicate|unique/.test(error.message)) ({ data, error } = await db.from("shop_products").insert({ ...row, slug: `${row.slug}-${id}` }).select("id").single());
      if (error) throw new Error(`${name}: ${error.message}`);
      pid = data!.id as string;
      out.products++;
    }
    const { data: vs } = await db.from("shop_variants").select("id, label").eq("product_id", pid);
    for (const [i, [label, v]] of sizes.entries()) {
      const hit = (vs ?? []).find((x) => String(x.label).toLowerCase() === label.toLowerCase());
      const vr = { organisation_id: orgId, product_id: pid, label, grams: gramsOf(label), price: v.price, position: i, woo_ids: v.ids, active: true };
      if (hit) await db.from("shop_variants").update({ woo_ids: v.ids, grams: vr.grams }).eq("id", hit.id);
      else { await db.from("shop_variants").insert(vr); out.sizes++; }
    }
  }
  return out;
}

/** WooCommerce variation / product id → our variant (for orders and subscriptions). */
async function variantIndex(db: SupabaseClient, orgId: string) {
  const { data } = await db.from("shop_variants").select("id, label, product_id, woo_ids, product:shop_products(woo_id, name)").eq("organisation_id", orgId);
  const byWooVar = new Map<number, { id: string; product_id: string }>();
  const byProductSize = new Map<string, { id: string; product_id: string }>();
  for (const v of (data ?? []) as unknown as { id: string; label: string; product_id: string; woo_ids: number[]; product: { woo_id: number | null } | null }[]) {
    for (const w of v.woo_ids ?? []) byWooVar.set(Number(w), { id: v.id, product_id: v.product_id });
    if (v.product?.woo_id) byProductSize.set(`${v.product.woo_id}|${v.label.toLowerCase()}`, { id: v.id, product_id: v.product_id });
  }
  return (productId: number, variationId: number, size: string | null) => byWooVar.get(variationId) ?? (size ? byProductSize.get(`${productId}|${size.toLowerCase()}`) : undefined) ?? byProductSize.get(`${productId}|one size`) ?? null;
}

/* ------------------------------------------------------------------ customers */

const addr = (a: J | undefined | null) => {
  if (!a || !s(a.address_1).trim()) return null;
  return {
    name: [s(a.first_name), s(a.last_name)].filter(Boolean).join(" ").trim() || null, company: s(a.company, 120) || null,
    line1: decode(s(a.address_1, 200)).trim(), line2: decode(s(a.address_2, 200)).trim() || null, suburb: decode(s(a.city, 80)).trim() || "—",
    state: s(a.state, 20).toUpperCase() || "—", postcode: s(a.postcode, 10).trim() || "0000", country: (s(a.country, 2) || "AU").toUpperCase(), phone: s(a.phone, 40) || null,
  };
};

async function customerFor(db: SupabaseClient, orgId: string, cache: Map<string, string>, o: { email: string; name: string | null; phone: string | null; wooId?: number | null }) {
  const email = o.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const hit = cache.get(email);
  if (hit) return hit;
  const { data: found } = await db.from("shop_customers").select("id, name, phone, woo_id").eq("organisation_id", orgId).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (found) {
    const patch: J = {};
    if (!found.name && o.name) patch.name = o.name;
    if (!found.phone && o.phone) patch.phone = o.phone;
    if (!found.woo_id && o.wooId) patch.woo_id = o.wooId;
    if (Object.keys(patch).length) await db.from("shop_customers").update(patch).eq("id", found.id);
    cache.set(email, found.id as string);
    return found.id as string;
  }
  const { data: st } = await db.from("booking_students").select("id").eq("organisation_id", orgId).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  const { data, error } = await db.from("shop_customers").insert({ organisation_id: orgId, email, name: o.name, phone: o.phone, woo_id: o.wooId ?? null, student_id: st?.id ?? null, source: "woocommerce" }).select("id").single();
  if (error) throw new Error(`${email}: ${error.message}`);
  cache.set(email, data.id as string);
  return data.id as string;
}

export async function importCustomers(db: SupabaseClient, orgId: string, customers: J[]) {
  const cache = new Map<string, string>();
  let made = 0, addresses = 0;
  for (const c of customers) {
    const billing = c.billing as J | undefined;
    const email = s(c.email || billing?.email, 254);
    const name = [s(c.first_name || billing?.first_name), s(c.last_name || billing?.last_name)].filter(Boolean).join(" ").trim() || null;
    const id = await customerFor(db, orgId, cache, { email, name, phone: s(billing?.phone, 40) || null, wooId: n(c.id) || null });
    if (!id) continue;
    made++;
    const a = addr(c.shipping as J) ?? addr(billing);
    if (a) {
      const { data: ex } = await db.from("shop_addresses").select("id").eq("customer_id", id).eq("line1", a.line1).eq("postcode", a.postcode).maybeSingle();
      if (!ex) { await db.from("shop_addresses").insert({ organisation_id: orgId, customer_id: id, label: "Home", ...a }); addresses++; }
    }
  }
  return { customers: made, addresses };
}

/* ------------------------------------------------------------------ orders */

const ORDER_STATUS: Record<string, string> = { completed: "completed", processing: "paid", "on-hold": "on_hold", pending: "pending", cancelled: "cancelled", refunded: "refunded", failed: "failed" };

function lineItems(o: J, find: Awaited<ReturnType<typeof variantIndex>>) {
  return ((o.line_items as J[] | undefined) ?? []).map((l) => {
    const meta = ((l.meta_data as J[] | undefined) ?? []).filter((m) => !s(m.key).startsWith("_"));
    const size = decode(s(meta.find((m) => /size|amount|weight/i.test(s(m.key)))?.display_value ?? meta.find((m) => /size|amount|weight/i.test(s(m.key)))?.value ?? "", 60)) || null;
    const grindRaw = s(meta.find((m) => /grind/i.test(s(m.key)))?.display_value ?? meta.find((m) => /grind/i.test(s(m.key)))?.value ?? "", 60);
    const qty = Math.max(1, n(l.quantity));
    const v = find(n(l.product_id), n(l.variation_id), size);
    return {
      product_id: v?.product_id ?? null, variant_id: v?.id ?? null, woo_product_id: n(l.product_id) || null, woo_variation_id: n(l.variation_id) || null,
      name: decode(s(l.name, 160)).replace(/\s+-\s+.*$/, "").trim(), variant: size ?? "", grind: grindRaw ? grindName(grindRaw) : null, adjust: 0,
      grind_label: grindRaw ? grindName(grindRaw) : null, qty, unit_price: Math.round((n(l.total) / qty) * 100) / 100, list_price: Math.round((n(l.subtotal) / qty) * 100) / 100, line_total: n(l.total), kind: "coffee",
    };
  });
}

export async function importOrders(db: SupabaseClient, orgId: string, orders: J[]) {
  const find = await variantIndex(db, orgId);
  const have = await existingMap(db, "shop_orders", orgId);
  const subs = await existingMap(db, "shop_subscriptions", orgId);
  const cache = new Map<string, string>();
  const out = { orders: 0, updated: 0, skipped: 0, numberClash: 0 };
  for (const o of orders) {
    const id = n(o.id);
    const status = ORDER_STATUS[s(o.status)] ?? null;
    if (!id || !status) { out.skipped++; continue; }
    const billing = o.billing as J | undefined;
    const email = s(billing?.email, 254);
    const name = [s(billing?.first_name), s(billing?.last_name)].filter(Boolean).join(" ").trim() || null;
    const customerId = email ? await customerFor(db, orgId, cache, { email, name, phone: s(billing?.phone, 40) || null, wooId: n(o.customer_id) || null }) : null;
    const items = lineItems(o, find);
    const shipLines = (o.shipping_lines as J[] | undefined) ?? [];
    const pickup = shipLines.some((x) => /local_pickup/.test(s(x.method_id)));
    const meta = (o.meta_data as J[] | undefined) ?? [];
    const subWoo = n(meta.find((m) => m.key === "_subscription_renewal")?.value) || n(meta.find((m) => m.key === "_subscription_parent")?.value) || 0;
    const row = {
      organisation_id: orgId, woo_id: id, woo_status: s(o.status, 30), number: n(o.number) || id, customer_id: customerId, subscription_id: subWoo ? subs.get(subWoo) ?? null : null,
      status, kind: s(o.created_via) === "subscription" ? "subscription_renewal" : "one_off", source: "woocommerce", email: email || null, name, phone: s(billing?.phone, 40) || null,
      delivery: pickup ? "pickup" : "post", address: addr(o.shipping as J) ?? addr(billing) ?? {}, items,
      subtotal: Math.round(items.reduce((a, i) => a + i.list_price * i.qty, 0) * 100) / 100, discount: n(o.discount_total), shipping: n(o.shipping_total), total: n(o.total), currency: s(o.currency, 3) || "AUD",
      coupon_code: (((o.coupon_lines as J[] | undefined) ?? [])[0]?.code as string | undefined)?.toUpperCase().slice(0, 40) ?? null,
      customer_note: s(o.customer_note, 1000) || null, paid_at: isoDate(o.date_paid_gmt ?? o.date_paid), shipped_at: isoDate(o.date_completed_gmt ?? o.date_completed),
      created_at: isoDate(o.date_created_gmt ?? o.date_created) ?? undefined,
    };
    const existing = have.get(id);
    if (existing) { await db.from("shop_orders").update(row).eq("id", existing); out.updated++; continue; }
    const { error } = await db.from("shop_orders").insert(row);
    if (error && /shop_orders_organisation_id_number_key|duplicate key.*number/.test(error.message)) {
      // An EventureOS order already has this number — keep the WooCommerce number in the note and take a new one
      const { data: num } = await db.rpc("shop_next_order_number", { p_org: orgId });
      const { error: e2 } = await db.from("shop_orders").insert({ ...row, number: num as number, office_note: `WooCommerce order #${row.number}` });
      if (e2) throw new Error(`Woo order ${id}: ${e2.message}`);
      out.numberClash++;
    } else if (error) throw new Error(`Woo order ${id}: ${error.message}`);
    out.orders++;
  }
  return out;
}

/* ------------------------------------------------------------------ subscriptions */

const SUB_STATUS: Record<string, string> = { active: "active", "on-hold": "paused", "pending-cancel": "active", pending: "pending", cancelled: "cancelled", expired: "cancelled", switched: "cancelled" };

export async function importSubscriptions(db: SupabaseClient, orgId: string, subs: J[], discountPercent: number) {
  const find = await variantIndex(db, orgId);
  const have = await existingMap(db, "shop_subscriptions", orgId);
  const cache = new Map<string, string>();
  const out = { subscriptions: 0, updated: 0, skipped: 0, unmatched_items: 0 };
  for (const sub of subs) {
    const id = n(sub.id);
    const billing = sub.billing as J | undefined;
    const email = s(billing?.email, 254);
    const name = [s(billing?.first_name), s(billing?.last_name)].filter(Boolean).join(" ").trim() || null;
    const customerId = email ? await customerFor(db, orgId, cache, { email, name, phone: s(billing?.phone, 40) || null, wooId: n(sub.customer_id) || null }) : null;
    if (!id || !customerId) { out.skipped++; continue; }
    let unit = s(sub.billing_period) === "month" ? "month" : "week";
    let count = Math.max(1, n(sub.billing_interval) || 1);
    if (s(sub.billing_period) === "day") { unit = "week"; count = Math.max(1, Math.round(count / 7)); }
    if (s(sub.billing_period) === "year") { unit = "month"; count = Math.min(26, count * 12); }
    count = Math.min(26, count);
    const status = SUB_STATUS[s(sub.status)] ?? "cancelled";
    const items = lineItems(sub, find);
    const parcelItems = items.filter((i) => i.variant_id).map((i) => ({ variant_id: i.variant_id, grind: i.grind, adjust: 0, qty: i.qty }));
    out.unmatched_items += items.length - parcelItems.length;
    const row = {
      organisation_id: orgId, customer_id: customerId, woo_id: id, woo_status: s(sub.status, 30), billing: "woocommerce", status,
      interval_unit: unit, interval_count: count, next_date: ymd(sub.next_payment_date_gmt ?? sub.next_payment_date), discount_percent: discountPercent,
      cancelled_at: status === "cancelled" ? isoDate(sub.cancelled_date_gmt ?? sub.end_date_gmt) : null,
      notes: [s(sub.status) === "pending-cancel" ? "Set to cancel at the end of the current period in WooCommerce." : null, s(sub.customer_note, 500) || null].filter(Boolean).join("\n") || null,
      created_at: isoDate(sub.start_date_gmt ?? sub.date_created_gmt ?? sub.date_created) ?? undefined,
    };
    let sid = have.get(id);
    if (sid) { await db.from("shop_subscriptions").update(row).eq("id", sid); out.updated++; }
    else {
      const { data, error } = await db.from("shop_subscriptions").insert(row).select("id").single();
      if (error) throw new Error(`Woo subscription ${id}: ${error.message}`);
      sid = data.id as string; out.subscriptions++;
    }
    const a = addr(sub.shipping as J) ?? addr(billing);
    const { data: parcels } = await db.from("shop_parcels").select("id").eq("subscription_id", sid);
    const parcel = { organisation_id: orgId, subscription_id: sid, label: "Home", delivery: "post", address: a ?? {}, items: parcelItems };
    if (parcels?.length) await db.from("shop_parcels").update({ address: parcel.address, items: parcel.items }).eq("id", parcels[0].id);
    else await db.from("shop_parcels").insert(parcel);
    // Link this subscription's past orders
    const orderIds = [n(sub.parent_id)].filter(Boolean);
    if (orderIds.length) await db.from("shop_orders").update({ subscription_id: sid }).eq("organisation_id", orgId).in("woo_id", orderIds);
  }
  return out;
}

/* ------------------------------------------------------------------ coupons */

export async function importCoupons(db: SupabaseClient, orgId: string, coupons: J[]) {
  const { data: prods } = await db.from("shop_products").select("id, woo_id").eq("organisation_id", orgId).not("woo_id", "is", null);
  const pmap = new Map((prods ?? []).map((p) => [Number(p.woo_id), p.id as string]));
  let made = 0, updated = 0;
  for (const c of coupons) {
    const code = s(c.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (code.length < 2) continue;
    const type = s(c.discount_type);
    const amount = n(c.amount);
    const kind = type === "percent" ? "percent" : amount > 0 ? "fixed" : c.free_shipping ? "free_shipping" : "fixed";
    const row = {
      organisation_id: orgId, code, woo_id: n(c.id) || null, description: decode(s(c.description, 200)) || null, kind, value: kind === "free_shipping" ? 0 : Math.min(kind === "percent" ? 100 : 100000, amount),
      applies_to: "all", product_ids: ((c.product_ids as number[] | undefined) ?? []).map((x) => pmap.get(Number(x))).filter(Boolean) as string[],
      min_spend: n(c.minimum_amount) || null, max_uses: n(c.usage_limit) || null, per_customer: n(c.usage_limit_per_user) || null, uses: n(c.usage_count),
      ends_on: ymd(c.date_expires_gmt ?? c.date_expires), active: s(c.status) === "publish" || !c.status,
    };
    const { data: ex } = await db.from("shop_coupons").select("id").eq("organisation_id", orgId).eq("code", code).maybeSingle();
    if (ex) { await db.from("shop_coupons").update(row).eq("id", ex.id); updated++; }
    else { const { error } = await db.from("shop_coupons").insert(row); if (error) throw new Error(`${code}: ${error.message}`); made++; }
  }
  return { coupons: made, updated };
}
