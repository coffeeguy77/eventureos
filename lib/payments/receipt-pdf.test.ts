import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReceiptPdf, gstInPayment, methodLabel } from "./receipt-pdf";

test("GST share and method labels", () => {
  assert.equal(gstInPayment(1626.25, 1626.25, 147.84), 147.84);
  assert.equal(gstInPayment(500, 1000, 90.91), 45.46);
  assert.equal(gstInPayment(100, 0, 0), 0);
  assert.equal(methodLabel("Stripe", "pi_123"), "Card (online)");
  assert.equal(methodLabel("bank_transfer", null), "Bank transfer");
});

test("builds a one-page receipt", async () => {
  const bytes = await buildReceiptPdf({
    org: { name: "Acme Coffee", abn: "12 345 678 901", address: "1 Main St\nCanberra ACT 2600", phone: "02 0000 0000", email: "hi@example.com", brand: "#E0457B" },
    customer: { name: "Example Pty Ltd", lines: ["Attn: Jo Citizen", "jo@example.com"] },
    receiptNo: "INV-1004-R1",
    invoice: { number: "INV-1004", issueDate: "2026-10-20", total: 1626.25, taxTotal: 147.84, currency: "AUD", reference: "PO 778", eventLabel: "Launch event · 30 October 2026" },
    payment: { amount: 1626.25, paidAt: "2026-10-21T06:06:26Z", method: "Stripe", reference: "pi_3USsgjCRf3rSBAVN1OZZEvkh" },
    paidBefore: 0, timezone: "Australia/Sydney", lines: [{ description: "Coffee Cart Hire\nSupply of cart", amount: null }, { description: "Barista — 4 hours", amount: null }],
  });
  assert.ok(bytes.length > 1000);
  if (process.env.OUT) (await import("node:fs")).writeFileSync(process.env.OUT, bytes);
});
