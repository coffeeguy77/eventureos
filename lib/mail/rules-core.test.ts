import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRules, cleanTags, ruleSearch } from "./rules-core";

test("rules clean up", () => {
  const r = cleanRules([{ id: "abcd1", name: "", query: " catering \n quote ", tag: "Espresso bar<script>", since: "2099-01-01" }, { query: "" }], "2026-10-27");
  assert.equal(r.length, 1);
  assert.equal(r[0].query, "catering quote");
  assert.equal(r[0].name, "catering quote");
  assert.equal(r[0].tag, "Espresso bar script");
  assert.equal(r[0].since, "2026-10-27");
  assert.equal(ruleSearch("catering OR platter", "2026-10-01"), "(catering OR platter) after:2026/10/01 -in:sent -in:drafts -in:chats -in:spam -in:trash");
  assert.deepEqual(cleanTags("Coffee Van, coffee van, Events"), ["Coffee Van", "Events"]);
});
