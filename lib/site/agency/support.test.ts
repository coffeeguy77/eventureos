import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSupport, domainOf, isAgencyAccess, likeEscape, quoteMessage, ticketDescription } from "./support";

test("agency mode only with the Nerd Herd app", () => {
  assert.ok(isAgencyAccess(["crm", "nerdherd"]));
  assert.ok(!isAgencyAccess(["crm"]));
  assert.ok(!isAgencyAccess(null));
  assert.ok(!isAgencyAccess("nerdherd"));
});

test("web addresses reduce to a bare domain", () => {
  assert.equal(domainOf("https://www.Example.com.au/contact?x=1"), "example.com.au");
  assert.equal(domainOf("example.com.au"), "example.com.au");
  assert.equal(domainOf("http://shop.example.com:8080/"), "shop.example.com");
  assert.equal(domainOf("not a site"), null);
  assert.equal(domainOf(""), null);
});

test("support form: plain-English errors, tidy values", () => {
  const ok = { name: "Jo Bloggs", email: " Jo@Example.com ", subject: "Form   broken", details: "The contact form shows an error." };
  const r = checkSupport(ok);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.value.email, "jo@example.com"); assert.equal(r.value.subject, "Form broken"); }
  assert.match((checkSupport({ ...ok, name: "" }) as { error: string }).error, /name/);
  assert.match((checkSupport({ ...ok, email: "jo" }) as { error: string }).error, /email/);
  assert.match((checkSupport({ ...ok, subject: "" }) as { error: string }).error, /subject/);
  assert.match((checkSupport({ ...ok, details: "help" }) as { error: string }).error, /more/);
  assert.match((checkSupport({ ...ok, site: "nope" }) as { error: string }).error, /website/);
  assert.match((checkSupport({ ...ok, phone: "call me" }) as { error: string }).error, /phone/);
});

test("ticket description carries who lodged it", () => {
  const d = ticketDescription({ name: "Jo", email: "jo@x.com", phone: "", website: "x.com", subject: "s", details: "Broken." });
  assert.match(d, /^Broken\./);
  assert.match(d, /Email: jo@x\.com/);
  assert.match(d, /Website: x\.com/);
  assert.doesNotMatch(d, /Phone:/);
});

test("like patterns are escaped; quote message keeps every answer", () => {
  assert.equal(likeEscape("a_b%c"), "a\\_b\\%c");
  const m = quoteMessage({ services: ["SEO", "Web hosting"], budget: "$5k–$10k", currentSite: "x.com", message: "Hi" });
  assert.match(m, /^Hi/);
  assert.match(m, /Interested in: SEO, Web hosting/);
  assert.match(m, /Budget: \$5k–\$10k/);
  assert.equal(quoteMessage({}), "");
});
