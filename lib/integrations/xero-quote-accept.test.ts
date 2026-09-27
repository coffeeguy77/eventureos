import { parseXeroAcceptance } from "./xero-quote-accept";
const cases: [string, Parameters<typeof parseXeroAcceptance>, ReturnType<typeof parseXeroAcceptance>][] = [
  ["IBM real subject", ["messaging-service@post.xero.com", "IBM Technology, Australia has accepted quote QU-0471 for 880.00 AUD"],
    { customer: "IBM Technology, Australia", quoteNumber: "QU-0471", amount: 880, currency: "AUD" }],
  ["thousands", ["messaging-service@post.xero.com", "National Press Club has accepted quote QU-0512 for 2,145.50 AUD"],
    { customer: "National Press Club", quoteNumber: "QU-0512", amount: 2145.5, currency: "AUD" }],
  ["from body", ["messaging-service@post.xero.com", "Quote accepted", "Hi Shaun,\n\nWoohoo!\n\nACME has accepted quote QU-0001 for 440.00 AUD"],
    { customer: "ACME", quoteNumber: "QU-0001", amount: 440, currency: "AUD" }],
  ["not from Xero", ["someone@gmail.com", "IBM Technology, Australia has accepted quote QU-0471 for 880.00 AUD"], null],
  ["customer reply", ["pcusch@au1.ibm.com", "Re: Quote QU-0471 from Bean Culture"], null],
  ["other Xero mail", ["messaging-service@post.xero.com", "Invoice INV-1234 from Bean Culture"], null],
];
let fail = 0;
for (const [name, args, want] of cases) {
  const got = parseXeroAcceptance(...args);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log("FAIL", name, got); } else console.log("ok  ", name);
}
if (fail) process.exit(1);
