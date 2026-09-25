/** Run: npx tsx lib/integrations/matching.test.ts */
import assert from "node:assert/strict";
import { bestMatch, companySimilarity, domainStem, matchBand, nameSimilarity, normPhone, scoreMatch } from "./matching";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); }
}

console.log("matching.ts");

test("spec example: Gmail John Smith vs Xero ABC Pty Ltd, same email → 96%", () => {
  const r = scoreMatch(
    { name: "John Smith", company: "ABC Pty Ltd", email: "john@abc.com.au" },    // Xero contact (person from FirstName/LastName)
    { name: "John Smith", email: "john@abc.com.au" },                            // Gmail-created customer
  );
  assert.equal(r.score, 96);
  assert.ok(r.reasons.some((x) => x.includes("Same email")));
  assert.ok(r.reasons.some((x) => x.includes("@abc.com.au")));
  assert.equal(matchBand(r.score), "certain");
});

test("AU phone normalisation", () => {
  assert.equal(normPhone("0412 345 678"), "412345678");
  assert.equal(normPhone("+61 412 345 678"), "412345678");
  assert.equal(normPhone("61412345678"), "412345678");
  assert.equal(normPhone("(02) 6123 4567"), "261234567");
  assert.equal(normPhone("+61 2 6123 4567"), "261234567");
  assert.equal(normPhone("123"), null);
});

test("phone + name match without email → possible (40)", () => {
  const r = scoreMatch({ name: "Daniel O'Connor", phone: "+61 488 555 204" }, { name: "Daniel OConnor", phone: "0488 555 204" });
  assert.equal(r.score, 40);
  assert.ok(r.reasons.includes("Same phone number"));
});

test("company name variants", () => {
  assert.ok(companySimilarity("Barton Consulting Pty Ltd", "Barton Consulting") >= 0.98);
  assert.ok(companySimilarity("Molonglo Group", "Molonglo") >= 0.98);
  assert.ok(companySimilarity("Acme Events", "Zenith Catering") < 0.5);
  assert.equal(domainStem("mail.bartonconsulting.com.au"), "bartonconsulting");
});

test("name similarity tolerates order, initials, middle names", () => {
  assert.ok(nameSimilarity("Smith John", "John Smith") >= 0.95);
  assert.ok(nameSimilarity("John Paul Smith", "John Smith") >= 0.95);
  assert.ok(nameSimilarity("J Smith", "John Smith") >= 0.85);
  assert.ok(nameSimilarity("José García", "Jose Garcia") === 1);
  assert.ok(nameSimilarity("Emma Smith", "Grace Bennett") < 0.4);
});

test("free-mail domains never count as a company match", () => {
  const r = scoreMatch({ name: "Amy Lee", email: "amy@gmail.com" }, { name: "Bob Jones", email: "bob@gmail.com" });
  assert.equal(r.score, 0);
});

test("contact emails on a customer are checked too", () => {
  const r = scoreMatch({ name: "Wellness Co", email: "accounts@wellness.example" }, { name: "Hannah Brooks", company: "Wellness Co", email: "hannah@wellness.example", emails: ["accounts@wellness.example"] });
  assert.ok(r.score >= 80, `score ${r.score}`);
});

test("bestMatch picks the highest and respects the minimum", () => {
  const customers = [
    { id: "a", name: "Emma Smith", email: "emma.smith@example.com" },
    { id: "b", name: "Emma Smyth", email: "emma@other.example" },
  ];
  const hit = bestMatch({ name: "Emma Smith", email: "emma.smith@example.com" }, customers, (c) => c);
  assert.equal(hit?.item.id, "a");
  assert.equal(bestMatch({ name: "Zed Q", email: "z@q.example" }, customers, (c) => c), null);
});

test("similar name only → possible match, below auto-trust", () => {
  const r = scoreMatch({ name: "Priya Sharma", email: "p.sharma@work.example" }, { name: "Priya Sharma", email: "priya.sharma@example.com" });
  assert.equal(r.score, 20);
  assert.equal(matchBand(r.score), "none");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
