import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyHtml, personalise, render } from "./mailout";

test("first names fill in, or 'there' when unknown or odd", () => {
  assert.equal(personalise("Hi {first_name},", "sam"), "Hi Sam,");
  assert.equal(personalise("Hi {first_name},", null), "Hi there,");
  assert.equal(personalise("Hi {first_name},", "Stonemad Stonemasons Pty"), "Hi there,");
});

test("paragraphs, bullets and links become safe HTML", () => {
  const h = bodyHtml("One <b>\n\n• a\n• b\n\nSee https://webculture.au/website-maintenance.");
  assert.match(h, /<p[^>]*>One &lt;b&gt;<\/p>/);
  assert.match(h, /<ul[^>]*><li[^>]*>a<\/li><li[^>]*>b<\/li><\/ul>/);
  assert.match(h, /href="https:\/\/webculture.au\/website-maintenance"/);
});

test("every email names the sender and can be unsubscribed from", () => {
  const e = render({ subject: "Hi {first_name}", body: "Hello" }, { firstName: "Jo", unsubscribeUrl: "https://x/unsubscribe/t" }, { name: "Web Culture", address: "Mitchell ACT", phone: "02 6223 2222", email: "hello@webculture.au" });
  assert.equal(e.subject, "Hi Jo");
  assert.match(e.html, /Unsubscribe/);
  assert.match(e.text, /Unsubscribe: https:\/\/x\/unsubscribe\/t/);
  assert.match(e.html, /Web Culture, Mitchell ACT/);
});
