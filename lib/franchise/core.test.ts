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

import { cleanQuestions, readQuestions } from "./core";
test("edited questions are validated and keep their keys", () => {
  const c = cleanQuestions([
    { key: "area", label: "Where?", kind: "text", section: "Plans", required: true },
    { label: "Do you own a van?", kind: "choice", options: ["Yes", "No", "", "Yes"], section: "Plans" },
    { label: "Do you own a van?", kind: "weird", section: "" },
  ]);
  assert.ok(c.ok);
  if (!c.ok) return;
  assert.deepEqual(c.questions.map((q) => q.key), ["area", "do_you_own_a_van", "do_you_own_a_van_3"]);
  assert.deepEqual(c.questions[1].options, ["Yes", "No"]);
  assert.equal(c.questions[2].kind, "text");
  assert.equal(c.questions[2].section, "Questions");
  assert.equal(cleanQuestions([{ label: "Pick", kind: "choice", options: ["Only one"] }]).ok, false);
  assert.equal(cleanQuestions([{ label: "" }]).ok, false);
});
test("saved questions replace the built-in set; answers follow the saved set", () => {
  const settings = { franchise: { questions: [{ key: "van", label: "Van?", kind: "yesno", section: "S", required: true }] } };
  assert.deepEqual(readQuestions(settings).map((q) => q.key), ["van"]);
  assert.equal(readQuestions({}).length, QUESTIONS.length);
  assert.equal(cleanAnswers({}, "Acme", readQuestions(settings)).ok, false);
  assert.equal(cleanAnswers({ van: "yes" }, "Acme", readQuestions(settings)).ok, true);
});
