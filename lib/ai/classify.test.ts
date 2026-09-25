/**
 * Run: npx tsx lib/ai/classify.test.ts
 * Plain asserts — no test framework. Exits non-zero on the first failure summary.
 */
import assert from "node:assert/strict";
import {
  classifyRules, classifyEmail, extractDate, extractGuests, extractBudget, stripQuoted, mergeAI,
  type ClassifyContext, type EmailInput, type ClassificationResult,
} from "./classify";
import { parseJSONObject, validateAIResult } from "./claude";

const TZ = "Australia/Sydney";
// Received Thursday 24 Sep 2026, 10am Sydney
const RECEIVED = "2026-09-24T00:00:00Z";
const base: ClassifyContext = { timezone: TZ, own_emails: ["info@beanculture.com.au", "@beanculture.com.au"] };

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failures.push(name); console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); });
}
const mail = (p: Partial<EmailInput> & { body: string; from_email: string }): EmailInput => ({ subject: "", received_at: RECEIVED, ...p });

async function main() {
  console.log("classify.ts");

  // ---- Demo data emails -------------------------------------------------------------------
  await test("demo: website form (Nina, corporate) → event_enquiry, extracts customer from body", () => {
    const r = classifyRules(mail({
      subject: "New website enquiry: Corporate coffee cart", from_email: "forms@beanculture.com.au", from_name: "Bean Culture Website",
      body: "Name: Nina Patel\nCompany: Barton Consulting\nEmail: nina.patel@example.com\nMessage: Interested in a recurring Friday coffee cart for our staff (~90). Can you send pricing?",
    }), base);
    assert.equal(r.classification, "event_enquiry");
    assert.ok(r.confidence >= 0.95);
    assert.equal(r.website_form, true);
    assert.equal(r.extracted.name, "Nina Patel");
    assert.equal(r.extracted.email, "nina.patel@example.com");
    assert.equal(r.extracted.company, "Barton Consulting");
    assert.equal(r.extracted.guest_count, 90);
    assert.equal(r.extracted.event_type, "Corporate");
  });

  await test("demo: website form (O'Connor engagement) → guests, budget, phone, type", () => {
    const r = classifyRules(mail({
      subject: "New website enquiry: Engagement party", from_email: "forms@beanculture.com.au",
      body: "Name: Daniel O'Connor\nEmail: d.oconnor@example.com\nPhone: 0488 555 204\nEvent: Engagement party\nGuests: 70\nBudget: $1,500\nMessage: Saturday afternoon, looking for a coffee cart 2–5pm.",
    }), base);
    assert.equal(r.classification, "event_enquiry");
    assert.equal(r.extracted.guest_count, 70);
    assert.equal(r.extracted.budget, 1500);
    assert.equal(r.extracted.phone, "0488 555 204");
    assert.equal(r.extracted.event_type, "Engagement");
    assert.equal(r.extracted.event_date, "2026-09-26", "Saturday after Thu 24 Sep");
  });

  await test("demo: SEO spam → spam", () => {
    const r = classifyRules(mail({ subject: "Boost your Google rankings today!!!", from_email: "growth@seo-blast.example", body: "We can get you to #1 on Google in 7 days guaranteed..." }), base);
    assert.equal(r.classification, "spam");
    assert.ok(r.confidence >= 0.8);
  });

  await test("demo: milk delivery schedule from non-customer → supplier", () => {
    const r = classifyRules(mail({ subject: "October milk delivery schedule", from_email: "orders@highland-dairy.example", from_name: "Highland Dairy Co", body: "Hi team, October deliveries move to Tuesdays and Fridays." }), base);
    assert.equal(r.classification, "supplier");
  });

  await test("demo: vague 'around Saturday' from unknown sender → needs_review (never auto-trusted)", () => {
    const r = classifyRules(mail({ subject: "Quick question about Saturday", from_email: "ethan.wright@example.com", from_name: "Ethan Wright", body: "Hey, are you guys around Saturday? Might need something for the team, not sure yet." }), base);
    assert.equal(r.classification, "needs_review");
    assert.ok(r.confidence < 0.6);
    assert.equal(r.best_guess, "event_enquiry");
  });

  await test("demo: wedding referral (Grace Bennett) → event_enquiry with guests + venue", () => {
    const r = classifyRules(mail({ subject: "Wedding coffee — Emma Smith recommended you!", from_email: "grace.bennett@example.com", from_name: "Grace Bennett", body: "Emma Smith said you were amazing. We're getting married in the new year — ~130 guests at Pialligo. Would love to know your availability and pricing." }), base);
    assert.equal(r.classification, "event_enquiry");
    assert.ok(r.confidence >= 0.75, `confidence ${r.confidence}`);
    assert.equal(r.extracted.guest_count, 130);
    assert.equal(r.extracted.venue, "Pialligo");
    assert.equal(r.extracted.event_type, "Wedding");
    assert.equal(r.extracted.name, "Grace Bennett");
  });

  await test("demo: tech conference 400 delegates at NCC → event_enquiry, Conference", () => {
    const r = classifyRules(mail({ subject: "Barista service for tech conference", from_email: "rachel.adams@example.com", body: "Hi, we're running a 2-day tech conference (400 delegates) at the NCC and need barista service at morning tea and lunch both days. Could you do two carts?" }), base);
    assert.equal(r.classification, "event_enquiry");
    assert.equal(r.extracted.guest_count, 400);
    assert.equal(r.extracted.event_type, "Conference");
    assert.equal(r.extracted.venue, "NCC");
  });

  await test("demo: charity breakfast for 150 → event_enquiry, Community", () => {
    const r = classifyRules(mail({ subject: "Charity breakfast — coffee", from_email: "peter.hughes@example.org", body: "Kate from the running club said you're great. Charity breakfast for 150, coffee from 7am?" }), base);
    assert.equal(r.classification, "event_enquiry");
    assert.equal(r.extracted.guest_count, 150);
    assert.equal(r.extracted.event_type, "Community");
  });

  await test("demo: Marcus reply about quote (known customer, open quote) → quote_discussion", () => {
    const r = classifyRules(mail({ subject: "Re: Quote Q-1008 — Display village launch", from_email: "marcus.chen@example.com", body: "Thanks Sarah. Two questions: can we add branded cups, and could Sunday finish at 2pm instead? If so I think we're good to approve." }),
      { ...base, known_customer: true, customer_has_open_quote: true, customer_has_open_event: true });
    assert.equal(r.classification, "quote_discussion");
  });

  await test("demo: Emma RSVP reply in tracked event thread → existing_event", () => {
    const r = classifyRules(mail({ subject: "Re: Coffee cart for our wedding", from_email: "emma.smith@example.com", body: "Hi Jess! RSVPs are in — we're at 100 confirmed. Could the cart be near the marquee entrance?\n\nOn Mon, 3 Aug 2026 at 10:00, Jess Harper <info@beanculture.com.au> wrote:\n> Hi Emma, here's the updated quote" }),
      { ...base, known_customer: true, known_thread: { classification: "existing_event", event_id: "e1" } });
    assert.equal(r.classification, "existing_event");
    assert.ok(r.confidence >= 0.9);
  });

  await test("demo: Kate parking logistics from customer with open event → existing_event", () => {
    const r = classifyRules(mail({ subject: "Parking for the cart", from_email: "kate.ellis@example.org", body: "We've reserved a spot beside the finish chute. Can you arrive by 6am?" }),
      { ...base, known_customer: true, customer_has_open_event: true });
    assert.equal(r.classification, "existing_event");
    assert.ok(r.confidence >= 0.8);
  });

  // ---- Realistic extra cases --------------------------------------------------------------
  await test("custom form subject pattern + WordPress sender → event_enquiry", () => {
    const r = classifyRules(mail({ subject: "[Bean Culture] Booking request", from_email: "wordpress@beanculture.com.au", body: "Your Name: Amy Lee\nYour Email: amy@example.com\nEvent Date: 14/11/2026\nNumber of Guests: 60\nMessage: Hi! Birthday brunch." }),
      { ...base, website_subject_patterns: ["Booking request"] });
    assert.equal(r.classification, "event_enquiry");
    assert.equal(r.extracted.email, "amy@example.com");
    assert.equal(r.extracted.event_date, "2026-11-14");
    assert.equal(r.extracted.guest_count, 60);
  });

  await test("Contact form notification with no customer details → needs_review, not discarded", () => {
    const r = classifyRules(mail({ subject: "Contact form", from_email: "noreply@squarespace.com", body: "You have a new submission. Message: hello" }), base);
    assert.equal(r.classification, "needs_review");
    assert.ok(r.reasons.length > 0);
  });

  await test("supplier tax invoice from non-customer → supplier", () => {
    const r = classifyRules(mail({ subject: "Tax Invoice 55821 from Canberra Cups", from_email: "accounts@canberracups.example", body: "Please find attached your invoice for 2,000 compostable cups. Amount due: $412.50. Payment due in 14 days." }), base);
    assert.equal(r.classification, "supplier");
  });

  await test("customer asking about THEIR invoice is not a supplier", () => {
    const r = classifyRules(mail({ subject: "Invoice INV-1008", from_email: "hannah@wellness.example", body: "Hi, sorry for the delay — paying the invoice amount due today." }),
      { ...base, known_customer: true, customer_has_open_event: true });
    assert.notEqual(r.classification, "supplier");
  });

  await test("phishing → spam", () => {
    const r = classifyRules(mail({ subject: "Your account suspended", from_email: "security@paypa1-alerts.example", body: "Dear Sir/Madam, verify your account now: click here http://a http://b http://c http://d" }), base);
    assert.equal(r.classification, "spam");
  });

  await test("newsletter with List-Unsubscribe → general_email", () => {
    const r = classifyRules(mail({ subject: "Spring industry update", from_email: "news@hospitality-weekly.example", body: "This month: trends in cafe equipment and staffing.", headers: { list_unsubscribe: true } }), base);
    assert.equal(r.classification, "general_email");
  });

  await test("relative date 'next Friday' 40th birthday → event_enquiry with resolved date", () => {
    const r = classifyRules(mail({ subject: "Coffee cart for 40th", from_email: "sam@example.com", from_name: "Sam Kerr", body: "Hi, could you do a coffee cart for my 40th next Friday? About 50 people at our home in Kingston. Budget around $900." }), base);
    assert.equal(r.classification, "event_enquiry");
    assert.equal(r.extracted.event_type, "Birthday");
    assert.equal(r.extracted.event_date, "2026-10-02", "Thu 24 Sep + 'next Friday' (1 day away) → Fri 2 Oct");
    assert.equal(r.extracted.guest_count, 50);
    assert.equal(r.extracted.budget, 900);
  });

  await test("existing customer asking about another event → event_enquiry", () => {
    const r = classifyRules(mail({ subject: "Another event", from_email: "olivia@example.net", body: "Loved working with you! We'd love to book you again for our Christmas party on 12 December, around 80 staff." }),
      { ...base, known_customer: true, customer_has_open_event: false });
    assert.equal(r.classification, "event_enquiry");
    assert.equal(r.extracted.event_date, "2026-12-12");
  });

  await test("personal note from unknown with no signals → needs_review", () => {
    const r = classifyRules(mail({ subject: "Hi", from_email: "someone@example.com", body: "Hey, give me a call when you can." }), base);
    assert.equal(r.classification, "needs_review");
  });

  await test("mail from own domain → general_email", () => {
    const r = classifyRules(mail({ subject: "Roster", from_email: "tom@beanculture.com.au", body: "Swapped shifts with Jess on Sunday." }), base);
    assert.equal(r.classification, "general_email");
  });

  // ---- Extraction helpers -----------------------------------------------------------------
  await test("extractDate handles absolute, AU day-first and relative forms", () => {
    const b = "2026-09-24"; // Thursday
    assert.equal(extractDate("on 2026-11-14", b), "2026-11-14");
    assert.equal(extractDate("on 14/11/2026", b), "2026-11-14");
    assert.equal(extractDate("Saturday 14th March", b), "2027-03-14");
    assert.equal(extractDate("November 3", b), "2026-11-03");
    assert.equal(extractDate("this Saturday", b), "2026-09-26");
    assert.equal(extractDate("tomorrow morning", b), "2026-09-25");
    assert.equal(extractDate("in 3 weeks", b), "2026-10-15");
    assert.equal(extractDate("no date here", b), null);
  });

  await test("received date is interpreted in the org timezone", () => {
    // 23 Sep 2026 20:00 UTC is already Thu 24 Sep in Sydney → 'tomorrow' = 25 Sep
    const r = classifyRules(mail({ subject: "Coffee tomorrow?", from_email: "a@example.com", received_at: "2026-09-23T20:00:00Z", body: "Can you do a coffee cart for our office event tomorrow for 30 people?" }), base);
    assert.equal(r.extracted.event_date, "2026-09-25");
  });

  await test("extractGuests / extractBudget", () => {
    assert.equal(extractGuests("around 1,200 attendees"), 1200);
    assert.equal(extractGuests("Guests: 85"), 85);
    assert.equal(extractGuests("party of 12"), 12);
    assert.equal(extractGuests("from 2pm to 5pm"), null);
    assert.equal(extractBudget("budget is 2.5k"), 2500);
    assert.equal(extractBudget("about $3,400 all up"), 3400);
  });

  await test("stripQuoted removes reply history", () => {
    const s = stripQuoted("Sounds great!\n\nOn Tue, 1 Sep 2026 at 9:00 am, Jess <jess@x.com> wrote:\n> old text\n> more");
    assert.equal(s, "Sounds great!");
  });

  // ---- AI layer ---------------------------------------------------------------------------
  await test("classifyEmail falls back to rules when the AI provider throws", async () => {
    const r = await classifyEmail(mail({ subject: "Wedding", from_email: "x@example.com", body: "Would love a coffee cart for our wedding on 3 April 2027, 120 guests." }), base,
      { ai: async () => { throw new Error("boom"); } });
    assert.equal(r.provider, "rules");
    assert.equal(r.classification, "event_enquiry");
    assert.ok(r.reasons.some((x) => x.includes("AI classification unavailable")));
  });

  await test("classifyEmail uses the AI result and fills gaps from rules; low AI confidence → needs_review", async () => {
    const ai = async (): Promise<ClassificationResult> => ({ classification: "event_enquiry", confidence: 0.5, reasons: ["AI: maybe"], extracted: { event_type: null, event_date: null, guest_count: null, budget: null, venue: null, name: "X", email: null, phone: null, company: null }, provider: "ai" });
    const r = await classifyEmail(mail({ subject: "Question", from_email: "x@example.com", body: "Coffee for 120 guests at our wedding?" }), base, { ai });
    assert.equal(r.provider, "ai");
    assert.equal(r.classification, "needs_review");
    assert.equal(r.extracted.guest_count, 120, "kept from rules");
    assert.equal(r.extracted.name, "X", "taken from AI");
  });

  await test("classifyEmail skips AI for website forms", async () => {
    let called = false;
    const r = await classifyEmail(mail({ subject: "New form submission", from_email: "forms@x.com", body: "Name: A\nEmail: a@b.com" }), base, { ai: async () => { called = true; throw new Error("x"); } });
    assert.equal(called, false);
    assert.equal(r.classification, "event_enquiry");
  });

  await test("AI JSON validation rejects bad output and accepts good output", () => {
    assert.throws(() => validateAIResult(parseJSONObject('{"classification":"lead","confidence":0.9}')));
    assert.throws(() => parseJSONObject("I think it's spam"));
    const ok = validateAIResult(parseJSONObject('Sure: {"classification":"spam","confidence":0.93,"reasons":["seo pitch"],"extracted":{"event_date":"2026-13-45","guest_count":"80","email":"not-an-email"}}'));
    assert.equal(ok.classification, "spam");
    assert.equal(ok.extracted.event_date, null);
    assert.equal(ok.extracted.guest_count, 80);
    assert.equal(ok.extracted.email, null);
    const merged = mergeAI(classifyRules(mail({ subject: "x", from_email: "a@b.com", body: "SEO backlinks guaranteed!!!" }), base), ok);
    assert.equal(merged.classification, "spam");
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main();
