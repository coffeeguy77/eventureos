import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAnswers, QUESTIONS, qText } from "./core";

const full = () => Object.fromEntries(QUESTIONS.map((q) => [q.key, q.kind === "choice" ? q.options![0] : q.kind === "yesno" ? "yes" : "Something"]));

test("a complete application passes", () => {
  const r = cleanAnswers(full(), "Acme");
  assert.equal(r.ok, true);
});
test("missing answers, made-up options and an unticked box are refused", () => {
  assert.match((cleanAnswers({ ...full(), why: "" }, "Acme") as { error: string }).error, /Why Acme/);
  assert.equal(cleanAnswers({ ...full(), budget: "A million" }, "Acme").ok, false);
  assert.equal(cleanAnswers({ ...full(), agree: "" }, "Acme").ok, false);
});
test("optional answers can be blank and the business name fills in", () => {
  const r = cleanAnswers({ ...full(), partners: "", questions: "" }, "Acme");
  assert.ok(r.ok && !("partners" in r.answers));
  assert.equal(qText("Why {business}?", "Acme"), "Why Acme?");
});
