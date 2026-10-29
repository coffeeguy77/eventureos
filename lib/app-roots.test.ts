import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { APP_ROOTS } from "./app-roots";
import { RESERVED } from "./short-links";

test("every section of the business app keeps the user's display settings (dark mode)", () => {
  const dirs = readdirSync("app/(app)", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual(dirs.filter((d) => !APP_ROOTS.has(d)), []);
});

test("no business can take an app section's address as its short link", () => {
  const dirs = readdirSync("app/(app)", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual(dirs.filter((d) => !RESERVED.includes(d)), []);
});
