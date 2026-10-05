import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isShortLink, RESERVED } from "./short-links";

test("every top-level app route is reserved (so it can't be mistaken for a business)", () => {
  const app = join(__dirname, "..", "app");
  const dirs: string[] = [];
  for (const d of readdirSync(app)) {
    const p = join(app, d);
    if (!statSync(p).isDirectory() || d.startsWith("[")) continue;
    if (d.startsWith("(")) { for (const x of readdirSync(p)) if (statSync(join(p, x)).isDirectory()) dirs.push(x); }
    else dirs.push(d);
  }
  for (const d of dirs) assert.ok(RESERVED.includes(d), `app/${d} should be in RESERVED`);
});

test("short links", () => {
  assert.equal(isShortLink("/beanculture"), true);
  assert.equal(isShortLink("/beanculture/"), true);
  assert.equal(isShortLink("/dashboard"), false);
  assert.equal(isShortLink("/book/beanculture"), false);
  assert.equal(isShortLink("/Bean"), false);
});
