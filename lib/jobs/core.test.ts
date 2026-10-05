import { test } from "node:test";
import assert from "node:assert/strict";
import { availabilitySummary, fillLetter, km, publicName, readAvailability, readJobSettings } from "./core";
import { welcomeLetterEmail } from "./emails";

test("employers see first name + last initial only", () => {
  assert.equal(publicName("Charlotte Anne Crosbie"), "Charlotte C.");
  assert.equal(publicName("Prince"), "Prince");
  assert.equal(publicName("Jo Smith", "  Jo the barista "), "Jo the barista");
  assert.equal(publicName("   "), "Barista");
});

test("availability is cleaned and summarised", () => {
  const a = readAvailability({ sat: ["am", "pm", "bogus"], sun: ["eve"], mon: [], xyz: ["am"] });
  assert.deepEqual(a, { sat: ["am", "pm"], sun: ["eve"] });
  assert.equal(availabilitySummary(a), "Weekends");
  assert.equal(availabilitySummary({}), "Availability not set");
  assert.equal(availabilitySummary(readAvailability({ mon: ["am"], tue: ["am"], wed: ["am"], thu: ["am"], fri: ["am"] })), "Weekdays");
  assert.equal(availabilitySummary(readAvailability({ mon: ["am"], sat: ["am"] })), "Mon, Sat");
});

test("distance: Sydney CBD to Parramatta is about 20 km", () => {
  const d = km({ lat: -33.8688, lng: 151.2093 }, { lat: -33.8150, lng: 151.0011 });
  assert.ok(d > 18 && d < 22, String(d));
});

test("job settings defaults and limits", () => {
  const s = readJobSettings({}, "Bean Culture");
  assert.equal(s.name, "Bean Culture Barista Jobs");
  assert.equal(s.enabled, true);
  assert.equal(s.dailyLimit, 40);
  assert.equal(s.employerApproval, false);
  assert.equal(readJobSettings({ jobs: { batchSize: 9999, dailyLimit: 1 } }, "X").batchSize, 200);
  assert.equal(readJobSettings({ jobs: { dailyLimit: 1 } }, "X").dailyLimit, 10);
  assert.equal(readJobSettings({ jobs: { enabled: false } }, "X").enabled, false);
});

test("welcome letter: placeholders, pixel, unsubscribe link, escaping", () => {
  const body = fillLetter("Hi {first_name},\n\nWelcome to {business} <jobs>.", { first_name: "Sam", name: "Sam Lee", business: "Bean Culture" });
  assert.equal(body, "Hi Sam,\n\nWelcome to Bean Culture <jobs>.");
  const m = welcomeLetterEmail({ businessName: "Bean Culture", brand: "#FB6F92" }, { subject: "Hello", body, button: { label: "Set up", url: "https://x.test/api/jobs/c/abc" },
    pixel: "https://x.test/api/jobs/o/abc.gif", unsubscribe: "https://x.test/jobs/bc/unsubscribe?i=abc&x=1", board: "Bean Culture Barista Jobs" });
  assert.match(m.html, /<img src="https:\/\/x\.test\/api\/jobs\/o\/abc\.gif" width="1"/);
  assert.match(m.html, /<a href="https:\/\/x\.test\/jobs\/bc\/unsubscribe\?i=abc&amp;x=1"[^>]*>Unsubscribe<\/a>/);
  assert.match(m.html, /&lt;jobs&gt;/);
  assert.ok(!m.html.includes("<jobs>"));
  assert.match(m.text, /Set up: https:\/\/x\.test\/api\/jobs\/c\/abc/);
});

test("instagram usernames and websites are cleaned", async () => {
  const { cleanInstagram, cleanWebsite, readEquipment } = await import("./core");
  assert.equal(cleanInstagram("@bean.culture"), "bean.culture");
  assert.equal(cleanInstagram("https://www.instagram.com/beanculture/?hl=en"), "beanculture");
  assert.equal(cleanInstagram("not a username!"), null);
  assert.equal(cleanWebsite("beanculture.com.au"), "https://beanculture.com.au");
  assert.equal(cleanWebsite("nonsense"), null);
  assert.deepEqual(readEquipment([{ type: "machine", brand: " La Marzocco ", model: "Linea PB" }, { type: "toaster", brand: "x" }, { type: "grinder", brand: "" }]),
    [{ type: "machine", brand: "La Marzocco", model: "Linea PB" }]);
});
