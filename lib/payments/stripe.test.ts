import { createHmac } from "node:crypto";
import { formEncode, keyMode, toCents, verifyWebhook } from "./stripe";
let fail = 0;
const ok = (name: string, cond: boolean) => { if (!cond) fail++; console.log(cond ? "ok  " : "FAIL", name); };

ok("form encode nested", formEncode({ mode: "payment", line_items: [{ quantity: 1, price_data: { unit_amount: 88000, product_data: { name: "Invoice INV-1" } } }], metadata: { invoice_id: "x" } })
  === "mode=payment&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=88000&line_items%5B0%5D%5Bprice_data%5D%5Bproduct_data%5D%5Bname%5D=Invoice%20INV-1&metadata%5Binvoice_id%5D=x");
ok("key live", keyMode("sk_live_51Habcdefghijk") === "live");
ok("restricted test", keyMode("rk_test_51Habcdefghijk") === "test");
ok("publishable rejected", keyMode("pk_live_51Habcdefghijk") === null);
ok("cents", toCents(880) === 88000 && toCents(19.99) === 1999 && toCents(0.1 + 0.2) === 30);

const secret = "whsec_test123";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const t = 1_800_000_000;
const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
ok("valid signature", (verifyWebhook<{ id: string }>(body, `t=${t},v1=${sig}`, secret, 300, t + 10)).id === "evt_1");
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
ok("wrong secret", throws(() => verifyWebhook(body, `t=${t},v1=${sig}`, "whsec_other", 300, t)));
ok("tampered body", throws(() => verifyWebhook(body + " ", `t=${t},v1=${sig}`, secret, 300, t)));
ok("too old", throws(() => verifyWebhook(body, `t=${t},v1=${sig}`, secret, 300, t + 301)));
ok("missing header", throws(() => verifyWebhook(body, null, secret)));
if (fail) process.exit(1);
