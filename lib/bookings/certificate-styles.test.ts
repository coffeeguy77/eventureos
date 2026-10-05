import { test } from "node:test";
import assert from "node:assert/strict";
import { H, W, layout, readDesign, toSvg } from "./certificate";

const data = { name: "Alexandra Montgomery-Smithson", course: "Looking For Work Barista Course", date: "5 October 2026", hours: "4 hours", number: "BC-2026-00184",
  business: "Bean Culture", verifyUrl: "https://example.com/v", points: ["Espresso extraction", "Milk texturing", "Grinder calibration", "Workflow & service", "Cleaning & maintenance"] };

for (const style of ["latte", "botanical", "poster", "elegant"]) {
  test(`${style}: every word stays on the page, and the seal words go round the ring`, () => {
    const d = readDesign({ style, signerName: "Shaun Matthews", signerTitle: "Director", sealTop: "{business}", sealBottom: "Barista", eyebrow: "Barista training", photo: "https://x.test/p.jpg", panelTitle: "Barista training" });
    assert.equal(d.style, style);
    const items = layout(d, data, { logo: true });
    const texts = items.filter((i) => i.t === "text") as Extract<(typeof items)[number], { t: "text" }>[];
    for (const t of texts) { assert.ok(t.x >= 0 && t.x <= W && t.y > 0 && t.y < H, `${t.text} at ${t.x},${t.y}`); }
    assert.ok(texts.some((t) => t.text === data.name));
    assert.ok(texts.some((t) => t.rotate), "arc text is rotated");
    // The name sits above the bottom row
    const name = texts.find((t) => t.text === data.name)!, date = texts.find((t) => t.text === data.date)!;
    assert.ok(name.y < date.y - 80);
    assert.match(toSvg(items, {}), /^<svg/);
  });
}

test("older designs keep working and unknown styles fall back", () => {
  assert.equal(readDesign({ style: "nope" }).style, "swoosh");
  assert.equal(readDesign({}).tagline, "{business}");
  assert.equal(readDesign({ photo: "http://insecure" }).photo, null);
});
