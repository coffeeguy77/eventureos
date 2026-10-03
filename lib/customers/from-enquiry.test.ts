import { clientAddressFromForm } from "./from-enquiry";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
eq("billing address used", clientAddressFromForm("Name: Kim\nBilling Address: 1 Gold Creek Rd, Nicholls ACT 2913\nVenue: Parliament House"), "1 Gold Creek Rd, Nicholls ACT 2913");
eq("venue/address is the event's, not the client's", clientAddressFromForm("Name: Kim\nAddress: South Jerra Playground, Tralee"), null);
eq("n/a ignored", clientAddressFromForm("Postal address: N/A"), null);
eq("no message", clientAddressFromForm(null), null);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
