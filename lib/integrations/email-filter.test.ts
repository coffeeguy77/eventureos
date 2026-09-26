import { evaluateFilter, resolveFilter, keywordRegex, subjectStartsWith, gmailQueryFor } from "./email-filter";
const f = resolveFilter({ filter_keywords: ["coffee cart", "coffee van", "hire", "event", "catering"], website_subject_patterns: ["Coffee Cart Hire Message From", "Coffee Van Hire Message From"] });
const cases: [string, Parameters<typeof evaluateFilter>[1], boolean][] = [
  ["form", { subject: "Coffee Cart Hire Message From Jane Smith", from_email: "noreply@beanculture.com.au", body: "Name: Jane\nEmail: j@x.com" }, true],
  ["form fwd", { subject: "Fwd: coffee cart hire message from   Bob", from_email: "x@y.com", body: "" }, true],
  ["kw", { subject: "Quote for our work Christmas party", from_email: "a@b.com", body: "We'd love a coffee van for 80 people" }, true],
  ["hiring", { subject: "Hiring your cart", from_email: "a@b.com", body: "" }, true],
  ["events plural", { subject: "Upcoming events", from_email: "a@b.com", body: "" }, true],
  ["newsletter", { subject: "Spring event sale", from_email: "news@nickscali.com.au", body: "Big event. Click to unsubscribe", headers: { list_unsubscribe: true } }, false],
  ["paypal", { subject: "Track your purchase", from_email: "service@paypal.com.au", body: "Hello Shaun, your order" }, false],
  ["gcal", { subject: "Invitation: Corporate event", from_email: "calendar-notification@google.com", body: "event" }, false],
  ["eventually", { subject: "Eventually", from_email: "a@b.com", body: "prevent" }, false],
  ["shire", { subject: "Shire council", from_email: "a@b.com", body: "" }, false],
  ["openai", { subject: "Steer your agent without starting over", from_email: "noreply@email.openai.com", body: "new event today" }, false],
  ["cal accept", { subject: "Accepted: Coffee Cart - We Are Living Dickson @ Sat Sep 26", from_email: "kudachoga0@gmail.com", body: "Kuda has accepted this invitation. Invitation from Google Calendar" }, false],
  ["cal reply human", { subject: "Re: Invitation: Coffee Cart - We Are Living Dickson", from_email: "gm@weareliving.com.au", body: "Can we add another barista for the coffee cart?" }, true],
  ["wp form", { subject: "Coffee Van Hire Message From Karen Shaw", from_email: "wordpress@beanculture.com.au", body: "From: Karen Shaw <k@x.com>" }, true],
  ["known", { subject: "hi", from_email: "a@b.com", body: "", knownPerson: true }, true],
];
let bad = 0;
for (const [n, m, want] of cases) { const d = evaluateFilter(f, m); const ok = d.import === want; if (!ok) bad++; console.log(ok ? "ok " : "BAD", n, "->", d.import, d.reason); }
console.log(subjectStartsWith("Coffee Cart Hire Message From X", "Coffee * Message From"), gmailQueryFor(f));
process.exit(bad);
