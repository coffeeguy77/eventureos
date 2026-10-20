/**
 * Reads WooCommerce's order emails to the shop owner ("[Shop]: New order #54715" and
 * "[Shop] New subscription renewal order (54718) - 19 October 2026") into an order.
 * Bookings sold through WooCommerce (e.g. Bookly barista courses: rows with "Service:", "Date:", "Time:",
 * "Number of Persons") are recognised and left out — those belong to the booking system.
 * Pure — no database. Works on the email's HTML (WooCommerce's standard email template).
 */

export interface WooEmailItem { name: string; sku: string | null; size: string | null; grind: string | null; options: Record<string, string>; qty: number; lineTotal: number }
export interface WooEmailAddress { name: string | null; company: string | null; line1: string; line2: string | null; suburb: string; state: string; postcode: string; phone: string | null; email: string | null }
export interface WooEmailOrder {
  number: number; date: string | null; kind: "one_off" | "subscription_first" | "subscription_renewal"; customerName: string | null;
  items: WooEmailItem[]; bookingItems: number; giftCardItems: number;
  subtotal: number | null; discount: number; shipping: number; shippingMethod: string | null; pickup: boolean; paymentMethod: string | null; total: number | null; note: string | null;
  subscriptionNumber: number | null; recurring: string | null;
  billing: WooEmailAddress | null; shipping_address: WooEmailAddress | null; email: string | null; phone: string | null;
  problems: string[];
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#039": "'", "#038": "&", "#8211": "–", "#8212": "—", "#8216": "‘", "#8217": "’", "#8220": "“", "#8221": "”", "#8230": "…", "#36": "$" };
const decode = (s: string) => s.replace(/&(#?\w+);/g, (m, k: string) => ENT[k.toLowerCase()] ?? (/^#\d+$/.test(k) ? String.fromCharCode(Number(k.slice(1))) : /^#x[0-9a-f]+$/i.test(k) ? String.fromCharCode(parseInt(k.slice(2), 16)) : m));
/** Tags out, entities decoded, spaces tidied. `<br>` becomes a line break. */
const text = (html: string) => decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
const money = (s: string | null | undefined) => { const m = (s ?? "").replace(/,/g, "").match(/-?\$?\s*(-?\d+(?:\.\d+)?)/); return m ? Math.abs(Number(m[1])) : null; };

const STATES: [RegExp, string][] = [
  [/^australian capital territory$|^act$/i, "ACT"], [/^new south wales$|^nsw$/i, "NSW"], [/^victoria$|^vic$/i, "VIC"], [/^queensland$|^qld$/i, "QLD"],
  [/^south australia$|^sa$/i, "SA"], [/^western australia$|^wa$/i, "WA"], [/^tasmania$|^tas$/i, "TAS"], [/^northern territory$|^nt$/i, "NT"],
];
const STATE_WORDS = "Australian Capital Territory|New South Wales|Victoria|Queensland|South Australia|Western Australia|Tasmania|Northern Territory|ACT|NSW|VIC|QLD|SA|WA|TAS|NT";

/** A row that's a booking (Bookly etc.), not something to post. */
export function isBookingRow(rowText: string) {
  return /\bService:/i.test(rowText) || /\bNumber of Persons\b/i.test(rowText) || (/\bDate:/i.test(rowText) && /\bTime:/i.test(rowText)) || /\bAppointment\b/i.test(rowText);
}

/** An emailed gift card / voucher (e.g. a barista lesson gift card) — nothing to post. */
export function isGiftCardRow(rowText: string) {
  return /\b(gift ?card|gift certificate|voucher)\b/i.test(rowText.split("\n")[0]) || (/\bTo:/.test(rowText) && /\bFrom:/.test(rowText) && /\bMessage:/.test(rowText));
}

/** "Name / company / street / street 2 / Suburb State Postcode / phone / email" → an address (WooCommerce's Australian format). */
export function parseAddress(block: string): WooEmailAddress | null {
  const lines = text(block).split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const email = lines.find((l) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l)) ?? null;
  const phone = lines.find((l) => l !== email && /^\+?[\d\s()-]{8,}$/.test(l)) ?? null;
  const rest = lines.filter((l) => l !== email && l !== phone && !l.includes("@"));
  const cityIdx = rest.findIndex((l) => new RegExp(`\\s(${STATE_WORDS})\\s+\\S+$`).test(l));
  if (cityIdx < 1) return null;
  const m = rest[cityIdx].match(new RegExp(`^(.*?)\\s+(${STATE_WORDS})\\s+(\\S+)$`))!;
  const state = STATES.find(([re]) => re.test(m[2]))?.[1] ?? m[2].toUpperCase();
  const before = rest.slice(0, cityIdx);
  const name = before[0] ?? null;
  let middle = before.slice(1);
  let company: string | null = null;
  // Company comes before the street: a middle line with no number when another line has one
  if (middle.length >= 2 && !/\d/.test(middle[0]) && middle.slice(1).some((l) => /\d/.test(l))) { company = middle[0]; middle = middle.slice(1); }
  if (!middle.length) return null;
  return { name, company, line1: middle[0], line2: middle.slice(1).join(", ") || null, suburb: m[1].trim(), state, postcode: m[3], phone, email };
}

export function parseWooOrderEmail(subject: string, html: string): WooEmailOrder | null {
  const renewal = /New subscription renewal order/i.test(subject);
  const num = Number((subject.match(/New order #?\s*(\d+)/i) ?? subject.match(/renewal order \((\d+)\)/i) ?? html.match(/Order #(\d+)/))?.[1]);
  if (!num) return null;
  const problems: string[] = [];
  const date = html.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  const customerName = decode(html.match(/following order from ([^<:]+):/i)?.[1] ?? html.match(/renewal order from ([^<.]+)\./i)?.[1] ?? "").trim() || null;

  // The order table: the first <table> with a Product / Quantity / Price head
  const tableStart = html.search(/<th[^>]*>\s*Product\s*<\/th>/i);
  const table = tableStart >= 0 ? html.slice(tableStart, html.indexOf("</table>", tableStart)) : "";
  const body = table.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
  const items: WooEmailItem[] = [];
  let bookingItems = 0, giftCardItems = 0;
  for (const row of body.split(/<\/tr>/i)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (cells.length < 3) continue;
    const rowText = text(cells.join("\n"));
    if (isBookingRow(rowText)) { bookingItems++; continue; }
    if (isGiftCardRow(rowText)) { giftCardItems++; continue; }
    const first = cells[0];
    const head = text(first.split(/<ul|<div|<dl|<table/i)[0]);
    const sku = head.match(/\(#([^)]+)\)\s*$/)?.[1] ?? null;
    const name = head.replace(/\s*\(#[^)]+\)\s*$/, "").trim();
    const options: Record<string, string> = {};
    for (const li of first.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const k = text(li[1].match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? "").replace(/:\s*$/, "");
      const v = text(li[1].replace(/<strong[^>]*>[\s\S]*?<\/strong>/i, ""));
      if (k) options[k] = v;
    }
    const pick = (re: RegExp) => Object.entries(options).find(([k]) => re.test(k))?.[1] ?? null;
    const qty = Math.round(Number(text(cells[1]).replace(/[^\d.]/g, ""))) || 0;
    const lineTotal = money(text(cells[2])) ?? 0;
    if (!name || qty <= 0) { problems.push(`couldn't read an item: ${rowText.slice(0, 80)}`); continue; }
    items.push({ name, sku, size: pick(/size|weight|amount/i), grind: pick(/grind/i), options, qty, lineTotal });
  }

  const foot: Record<string, string> = {};
  const tfoot = table.match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/i)?.[1] ?? "";
  for (const r of tfoot.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) foot[text(r[1]).replace(/:\s*$/, "").toLowerCase()] = r[2];
  const shipText = foot.shipping != null ? text(foot.shipping) : null;
  const shipping = shipText && /\$/.test(shipText) ? money(shipText) ?? 0 : 0;
  const pickup = !!shipText && /local pick ?up|pick ?up/i.test(shipText);
  const shippingMethod = shipText ? shipText.replace(/^\$?\s*[\d.,]+\s*(via\s+)?/i, "").trim() || shipText : null;

  const subBlock = html.match(/Subscription information[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? null;
  const subCells = subBlock ? [...subBlock.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => text(c[1])) : [];
  const subscriptionNumber = Number(subCells[0]?.replace(/\D/g, "")) || null;

  const billingHtml = html.match(/Billing address\s*<\/h2>\s*<address[^>]*>([\s\S]*?)<\/address>/i)?.[1] ?? null;
  const shippingHtml = html.match(/Shipping address\s*<\/h2>\s*<address[^>]*>([\s\S]*?)<\/address>/i)?.[1] ?? null;
  const billing = billingHtml ? parseAddress(billingHtml) : null;
  const ship = shippingHtml ? parseAddress(shippingHtml) : null;
  // Phone / email can be links in the billing block
  const email = billing?.email ?? (billingHtml ? text(billingHtml).match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] ?? null : null);
  const phone = billing?.phone ?? null;

  if (!items.length && !bookingItems && !giftCardItems) problems.push("no items found");
  if (!pickup && items.length && !ship && !billing) problems.push("no delivery address");
  const subtotal = foot.subtotal != null ? money(text(foot.subtotal)) : null;
  const total = foot.total != null ? money(text(foot.total)) : null;
  const sum = Math.round(items.reduce((t, i) => t + i.lineTotal, 0) * 100) / 100;
  if (!bookingItems && !giftCardItems && subtotal != null && Math.abs(sum - subtotal) > 0.02) problems.push(`items add up to ${sum.toFixed(2)} but the subtotal is ${subtotal.toFixed(2)}`);

  return {
    number: num, date, kind: renewal ? "subscription_renewal" : subscriptionNumber ? "subscription_first" : "one_off", customerName,
    items, bookingItems, giftCardItems, subtotal, discount: foot.discount != null ? money(text(foot.discount)) ?? 0 : 0, shipping, shippingMethod, pickup,
    paymentMethod: foot["payment method"] != null ? text(foot["payment method"]) : null, total, note: foot.note != null ? text(foot.note).slice(0, 1000) : null,
    subscriptionNumber, recurring: subCells[3] ?? null,
    billing, shipping_address: ship, email, phone, problems,
  };
}
