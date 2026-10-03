import { billToLines } from "./bill-to";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
eq("company with contact", billToLines({ name: "FlatRock Land Trust", company: "FlatRock Land Trust", contact: "Richard Stevenson", position: "Chair", email: "r@x.com", phone: "0421 691 368", address: "12 Smith St, Nicholls ACT 2913" }),
  { main: "FlatRock Land Trust", sub: ["Attn: Richard Stevenson, Chair", "12 Smith St", "Nicholls ACT 2913", "0421 691 368", "r@x.com"] });
eq("individual: no attn when same person", billToLines({ name: "Kim French", contact: "Kim French", email: "k@x.com" }), { main: "Kim French", sub: ["k@x.com"] });
eq("multi-line address kept", billToLines({ name: "A", address: "PO Box 1\nCanberra ACT 2601" })?.sub, ["PO Box 1", "Canberra ACT 2601"]);
eq("nothing", billToLines(null), null);
if (fail) { console.error(`${fail} failed`); process.exit(1); }
