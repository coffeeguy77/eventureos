import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { BLEED, CARD_H, CARD_W, CARD_X, CARD_Y, MM, PAGE_H, PAGE_W, giftCardPdf } from "./card-pdf";

const F = new URL("../../public/fonts/cert/", import.meta.url);
const r = (n: string) => new Uint8Array(readFileSync(new URL(n, F)));
const fonts = { script: r("PinyonScript-Regular.ttf"), serifBold: r("PlayfairDisplay-Bold.ttf"), serifItalic: r("PlayfairDisplay-Italic.ttf"), sans: r("Barlow-Regular.ttf"), sansMedium: r("Barlow-Medium.ttf"), sansSemi: r("Barlow-SemiBold.ttf") };

test("the card is centred on the page, so front and back line up when printed double-sided", () => {
  assert.ok(Math.abs(CARD_X * 2 + CARD_W - PAGE_W) < 0.001);
  assert.ok(Math.abs(CARD_Y * 2 + CARD_H - PAGE_H) < 0.001);
  assert.ok(Math.abs(CARD_W / CARD_H - 1489 / 1056) < 0.0001);         // same shape as the on-screen card
  assert.ok(CARD_Y - BLEED > 10 * MM && CARD_X - BLEED > 10 * MM);      // room for home printers' unprintable edge + marks
});

test("two A4 landscape pages, front then back, even with a very long message and no artwork", async () => {
  const bytes = await giftCardPdf({ art: null, fonts, title: "Gift", back: { to: "A very long recipient name that keeps going", from: "Sam", message: "word ".repeat(60), value: "Home Barista Course (2hr)", valueNote: "$150 value", code: "GIFT-ABCD-1234", expires: "6 October 2029", business: "Test Coffee Co", redeem: "Book online and enter the code at checkout." } });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  for (const p of doc.getPages()) { const { width, height } = p.getSize(); assert.ok(Math.abs(width - PAGE_W) < 0.01 && Math.abs(height - PAGE_H) < 0.01); }
});
