import { scoreSpam } from "./spam";
const kw = ["coffee cart", "coffee van", "hire", "event", "catering"];
const cases: [string, Parameters<typeof scoreSpam>[0], boolean][] = [
  ["seo pitch", { subject: "Quick question about your website", from_email: "raj@rankwebs.xyz", body: "Dear business owner, I came across your website. We offer SEO services to get you on the first page of Google. Reply STOP to unsubscribe." }, true],
  ["genuine cart", { subject: "Coffee cart for our conference", from_email: "amy@anu.edu.au", body: "Hi, we'd like a coffee cart on 22 October for about 150 people. Could you send a quote? https://anu.edu.au/event" , keywords: kw }, false],
  ["gmail spam", { subject: "Hello", from_email: "x@y.com", body: "hi", gmailSpam: true }, true],
  ["app dev", { subject: "Mobile app development proposal", from_email: "sales@devs.io", body: "We are an outsourcing company offering mobile app development and virtual assistant services. Kindly reply." }, true],
  ["crypto", { subject: "INVESTMENT OPPORTUNITY", from_email: "a@b.top", body: "Bitcoin crypto returns bit.ly/xyz https://bit.ly/abc" }, true],
  ["genuine with link", { subject: "Wedding 14th March", from_email: "kate@gmail.com", body: "Looking to hire a coffee van for our wedding on 14th March, about 90 guests. Venue: https://venue.com.au", keywords: kw }, false],
  ["classified spam but genuine words", { subject: "Coffee cart hire", from_email: "b@c.com", body: "Can we book a coffee cart for 50 people on Friday?", classifiedSpam: true, keywords: kw }, false],
  ["custom phrase", { subject: "Special offer", from_email: "a@b.com", body: "Our cheap coffee beans wholesale deal", extraPhrases: ["coffee beans wholesale", "special offer"] }, true],
];
let fail = 0;
for (const [name, input, want] of cases) {
  const r = scoreSpam(input);
  const ok = r.spam === want;
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", name, r.score, r.reasons.join(" | "));
}
if (fail) { console.error(`${fail} failed`); process.exit(1); }
