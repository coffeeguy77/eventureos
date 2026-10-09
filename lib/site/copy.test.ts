import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdits, copyOf, editablePath } from "./copy";

test("page edits: allowed paths only, copy overrides, photos checked", () => {
  assert.ok(editablePath("copy:events.hero.kicker"));
  assert.ok(editablePath("events.images.hero"));
  assert.ok(editablePath("booking.landing.copy.ctaTitle"));
  assert.ok(!editablePath("booking.enabled"));
  assert.ok(!editablePath("events.packages"));
  const s = applyEdits({ events: { intro: "old", images: {} }, site: { nav: { shop: "Shop" } } }, [
    { path: "events.intro", value: " New intro " }, { path: "copy:events.how.title", value: "How it goes" }, { path: "events.images.hero", value: "https://x.example/a.jpg" },
  ]);
  assert.equal((s.events as { intro: string }).intro, "New intro");
  assert.equal(((s.site as { copy: Record<string, string> }).copy)["events.how.title"], "How it goes");
  assert.deepEqual((s.site as { nav: unknown }).nav, { shop: "Shop" });
  assert.equal(copyOf(s, "events")("how.title", "x"), "How it goes");
  assert.equal(copyOf(s, "events")("missing", "fallback"), "fallback");
  const r = applyEdits(s, [{ path: "copy:events.how.title", value: "" }]);
  assert.equal(copyOf(r, "events")("how.title", "default"), "default");
  assert.throws(() => applyEdits({}, [{ path: "events.images.hero", value: "javascript:alert(1)" }]));
  assert.throws(() => applyEdits({}, [{ path: "billing.plan", value: "free" }]));
});
