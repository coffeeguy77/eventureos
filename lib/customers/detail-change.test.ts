import { cleanSuggestion, looksLikeDetailChange, ruleExtract } from "./detail-change";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
eq("new address spotted", looksLikeDetailChange("Hi Shaun, just letting you know we've moved. Our new address is 5 Bunda St, Canberra ACT 2601"), true);
eq("please update phone", looksLikeDetailChange("Please update my mobile to 0412 345 678 thanks"), true);
eq("invoices sent to", looksLikeDetailChange("Invoices should be sent to accounts@acme.com.au from now on"), true);
eq("ordinary enquiry ignored", looksLikeDetailChange("Can we book the cart for 12 Nov at Parliament House? Address for the event is 1 Federation Mall"), false);
eq("signature ignored", looksLikeDetailChange("Thanks!\nKim\nPhone: 02 6230 2273\nCockington Green"), false);
eq("address extracted", ruleExtract("We've moved.\nOur new address is:\n5 Bunda St\nCanberra ACT 2601\nThanks").address, "5 Bunda St\nCanberra ACT 2601");
eq("phone extracted", ruleExtract("Please update my mobile to 0412 345 678 thanks").phone, "0412 345 678");
eq("same phone dropped", cleanSuggestion({ phone: "+61 412 345 678" }, { phone: "0412345678" }), {});
eq("bad email dropped, good address kept", cleanSuggestion({ email: "nope", address: "5 Bunda St\nCanberra ACT 2601" }, {}), { address: "5 Bunda St\nCanberra ACT 2601" });
if (fail) { console.error(`${fail} failed`); process.exit(1); }
