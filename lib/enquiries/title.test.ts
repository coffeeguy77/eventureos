import { test } from "node:test";
import assert from "node:assert/strict";
import { enquiryTitle, hiringFrom } from "./title";

const labels = ["Coffee Cart", "Equipment Hire", "Coffee Van", "Coffee Van"];

test("hiringFrom finds what they're hiring from the business's labels", () => {
  assert.equal(hiringFrom(["Enquiry", "Hi, we'd love a coffee van for our staff morning tea"], labels), "Coffee Van");
  assert.equal(hiringFrom(["Coffee cart hire for open day"], labels), "Coffee Cart");
  assert.equal(hiringFrom(["Could we book the van on Friday?"], labels), "Coffee Van");
  assert.equal(hiringFrom(["We'd like to hire equipment only"], labels), "Equipment Hire");
  assert.equal(hiringFrom(["Do you hire out things?"], labels), null);
  // the subject wins over the body
  assert.equal(hiringFrom(["Coffee cart booking", "last year we had your van"], labels), "Coffee Cart");
});

test("enquiryTitle: what | business, never the person when there's a business", () => {
  assert.equal(enquiryTitle({ hiring: "Coffee Van", company: "Canberra Girls Grammar", eventType: "Corporate", person: "HR Officer" }), "Coffee Van | Canberra Girls Grammar");
  assert.equal(enquiryTitle({ hiring: "Coffee Cart", customer: { name: "ACT Police", kind: "company" }, person: "Kellie Keys" }), "Coffee Cart | ACT Police");
  assert.equal(enquiryTitle({ hiring: "Coffee Cart", venue: "Salthouse Community Centre", person: "Anna Sanchez" }), "Coffee Cart | Salthouse Community Centre");
  assert.equal(enquiryTitle({ hiring: null, eventType: "Corporate", person: "Adrian White" }), "Corporate enquiry | Adrian White");
});
