import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvoicePdf, lineTaxMode } from "./document-pdf";

test("line amounts: GST inclusive, exclusive, or hidden when they don't add up", () => {
  assert.equal(lineTaxMode([{ amount: 110 }, { amount: 55 }], 150, 165), "inc");
  assert.equal(lineTaxMode([{ amount: 100 }, { amount: 50 }], 150, 165), "ex");
  assert.equal(lineTaxMode([{ amount: 10 }], 150, 165), null);
  assert.equal(lineTaxMode([{ amount: null }], 150, 165), null);
});

test("a paid tax invoice", async () => {
  const bytes = await buildInvoicePdf({
    org: { name: "Acme Coffee", abn: "12 345 678 901", address: "1 Main St\nCanberra ACT 2600", phone: "02 0000 0000", email: "hi@example.com", brand: "#E0457B" },
    billTo: { main: "Example Pty Ltd", sub: ["Attn: Jo Citizen", "jo@example.com"] },
    invoice: { number: "INV-1004", issueDate: "2026-10-12", dueDate: "2026-10-19", reference: "PO 778", eventLabel: "Launch · 22 October 2026", currency: "AUD", subtotal: 1478.41, taxTotal: 147.84, total: 1626.25, balance: 0, status: "paid" },
    lines: [{ description: "Coffee Cart Hire\nSupply of stainless steel coffee cart", quantity: 1, unit: 440, amount: 440 }, { description: "Barista Hire Per Hour", quantity: 4, unit: 296.5625, amount: 1186.25 }],
    lineTax: "inc", payments: [{ date: "2026-10-21T06:06:26Z", label: "Card (online)", amount: 1626.25 }], credits: [], payUrl: null,
  });
  assert.ok(bytes.length > 1000);
  if (process.env.OUT) (await import("node:fs")).writeFileSync(process.env.OUT, bytes);
});
