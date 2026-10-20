import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAddress, parseWooOrderEmail } from "./woo-email";

// Shaped like WooCommerce's admin emails (made-up people and addresses)
const S = 'style="color:#636363;border:1px solid #e5e5e5"';
const wrap = (heading: string, intro: string, rows: string, foot: string, extra = "", addresses = "") => `<html><body><table><tr><td><h1 ${S}>${heading}</h1></td></tr></table>
<div ${S}><p>${intro}</p><h2 ${S}><a class="link" href="https://shop.example/wp-admin/post.php?post=1">[Order #1]</a> (<time datetime="2026-10-18T07:45:34+11:00">18 October 2026</time>)</h2>
<div ${S}><table class="td" ${S}><thead><tr><th class="td" scope="col" ${S}>Product</th><th class="td" scope="col" ${S}>Quantity</th><th class="td" scope="col" ${S}>Price</th></tr></thead>
<tbody>${rows}</tbody><tfoot>${foot}</tfoot></table></div>${extra}
<table id="addresses"><tr>${addresses}</tr></table></div></body></html>`;
const coffee = (name: string, sku: string, size: string, grind: string, qty: number, price: string) => `<tr class="order_item"><td class="td" ${S}>${name} (#${sku})<ul class="wc-item-meta"><li><strong class="wc-item-meta-label" style="float:left">Choose Size:</strong> <p>${size}</p></li><li><strong class="wc-item-meta-label">Choose Grind:</strong> <p>${grind}</p></li></ul></td><td class="td" ${S}>${qty}</td><td class="td" ${S}><span class="woocommerce-Price-amount amount"><span class="woocommerce-Price-currencySymbol">&#36;</span>${price}</span></td></tr>`;
const foot = (rows: [string, string][]) => rows.map(([k, v]) => `<tr><th class="td" scope="row" colspan="2" ${S}>${k}:</th><td class="td" ${S}>${v}</td></tr>`).join("");
const amt = (n: string) => `<span class="woocommerce-Price-amount amount"><span>&#36;</span>${n}</span>`;
const addr = (title: string, lines: string[]) => `<td valign="top" width="50%"><h2 ${S}>${title}</h2><address class="address">${lines.join("<br/>")}</address></td>`;

test("a coffee order: items, sizes, grinds, shipping and the address", () => {
  const html = wrap("New Order: #54715", "You’ve received the following order from Jane Citizen:",
    coffee("Parliament | Cafe Blend", "ID-parliament-cafe-blend", "1kg", "Whole Beans", 2, "136.00") + coffee("Decaf", "ID-decaf", "200g", "Espresso", 1, "17.00"),
    foot([["Subtotal", amt("153.00")], ["Shipping", "Free shipping"], ["Payment method", "PayPal"], ["Total", amt("153.00")], ["Note", "Leave at the back door"]]), "",
    addr("Billing address", ["Jane Citizen", "12 Example Street", "Bonython Australian Capital Territory 2905", '<a href="tel:0400000000">0400000000</a>', '<a href="mailto:jane@example.com">jane@example.com</a>'])
    + addr("Shipping address", ["Jane Citizen", "Example Pty Ltd", "Unit 3", "12 Example Street", "Bonython Australian Capital Territory 2905"]));
  const o = parseWooOrderEmail("[Shop]: New order #54715", html)!;
  assert.equal(o.number, 54715);
  assert.equal(o.date, "2026-10-18");
  assert.equal(o.kind, "one_off");
  assert.equal(o.customerName, "Jane Citizen");
  assert.deepEqual(o.items.map((i) => [i.name, i.sku, i.size, i.grind, i.qty, i.lineTotal]), [
    ["Parliament | Cafe Blend", "ID-parliament-cafe-blend", "1kg", "Whole Beans", 2, 136], ["Decaf", "ID-decaf", "200g", "Espresso", 1, 17],
  ]);
  assert.equal(o.subtotal, 153); assert.equal(o.total, 153); assert.equal(o.shipping, 0); assert.equal(o.pickup, false);
  assert.equal(o.paymentMethod, "PayPal"); assert.equal(o.note, "Leave at the back door");
  assert.equal(o.email, "jane@example.com"); assert.equal(o.phone, "0400000000");
  assert.deepEqual(o.shipping_address, { name: "Jane Citizen", company: "Example Pty Ltd", line1: "Unit 3", line2: "12 Example Street", suburb: "Bonython", state: "ACT", postcode: "2905", phone: null, email: null });
  assert.deepEqual(o.problems, []);
});

test("a subscription renewal with paid shipping", () => {
  const html = wrap("New subscription renewal order", "You have received a subscription renewal order from sam example. Their order is as follows:",
    coffee("Parliament | Cafe Blend", "ID-parliament-cafe-blend", "200g", "Whole Beans", 2, "30.60"),
    foot([["Subtotal", amt("30.60")], ["Shipping", `${amt("10.00")} <small class="shipped_via">via Flat Rate (Buy 2KG for Free Shipping)</small>`], ["Payment method", "Credit / Debit Card"], ["Total", amt("40.60")]]),
    `<div><h2>Subscription information</h2><table><thead><tr><th>ID</th><th>Start date</th><th>End date</th><th>Recurring total</th></tr></thead><tbody><tr><td><a href="#">#54511</a></td><td>24 August 2026</td><td>When cancelled</td><td>${amt("40.60")} every 4 weeks</td></tr></tbody></table></div>`,
    addr("Billing address", ["sam example", "Example Optometry", "61 Sample Circuit", "Kaleen Australian Capital Territory 2617", "0400000001", "sam@example.com"]) + addr("Shipping address", ["sam example", "Example Optometry", "61 Sample Circuit", "Kaleen Australian Capital Territory 2617"]));
  const o = parseWooOrderEmail("[Shop] New subscription renewal order (54718) - 19 October 2026", html)!;
  assert.equal(o.number, 54718);
  assert.equal(o.kind, "subscription_renewal");
  assert.equal(o.customerName, "sam example");
  assert.equal(o.shipping, 10);
  assert.equal(o.shippingMethod, "Flat Rate (Buy 2KG for Free Shipping)");
  assert.equal(o.subscriptionNumber, 54511);
  assert.equal(o.shipping_address?.company, "Example Optometry");
  assert.equal(o.shipping_address?.line1, "61 Sample Circuit");
});

test("a barista course booking is recognised and has nothing to post", () => {
  const row = `<tr><td class="td" ${S}>Barista Course<ul class="wc-item-meta"><li>Barista Appointment</li><li><strong>Date:</strong> <p>24 October 2026</p></li><li><strong>Time:</strong> <p>10:00 am</p></li><li><strong>Service:</strong> <p>Looking For Work Course (4hr)</p></li><li><strong>Number of Persons:</strong> <p>1</p></li></ul></td><td class="td">1</td><td class="td">${amt("0.00")}</td></tr>`;
  const html = wrap("New Order: #54726", "You’ve received the following order from Alex Example:", row,
    foot([["Subtotal", amt("0.00")], ["Discount", `-${amt("300.00")}`], ["Shipping", "Local pickup"], ["Total", amt("0.00")]]), "",
    addr("Billing address", ["Alex Example", "2/40 Example Street", "Phillip Australian Capital Territory 2606", "+61400000002", "alex@example.com"]));
  const o = parseWooOrderEmail("[Shop]: New order #54726", html)!;
  assert.equal(o.items.length, 0);
  assert.equal(o.bookingItems, 1);
  assert.equal(o.pickup, true);
  assert.equal(o.discount, 300);
});

test("parseAddress: other states, no company", () => {
  assert.deepEqual(parseAddress("Pat Example<br>5 Long Road<br>Wagga Wagga New South Wales 2650"), { name: "Pat Example", company: null, line1: "5 Long Road", line2: null, suburb: "Wagga Wagga", state: "NSW", postcode: "2650", phone: null, email: null });
  assert.equal(parseAddress("Kim<br>1 A St<br>Darwin Northern Territory 0800")?.state, "NT");
  assert.equal(parseAddress("Nobody"), null);
});

test("an emailed gift card is left out; stray email lines aren't a company", async () => {
  const { isGiftCardRow } = await import("./woo-email");
  assert.equal(isGiftCardRow("Barista Lesson Gift Card - 2 hours\nTo: a@b.co\nFrom: Me\nMessage: Hi\nAmount: $ 150.00"), true);
  assert.equal(isGiftCardRow("Parliament | Cafe Blend\nChoose Size: 1kg"), false);
  assert.equal(parseAddress("Jo Example<br>jo@example<br>4 Some Street<br>Unit 2<br>Kaleen Australian Capital Territory 2617")?.company, null);
});
