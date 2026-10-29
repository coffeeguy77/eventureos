import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanStored, formatAu, fromXeroParts } from "./phone-format";

test("Xero's boxes: a full number in the number box wins", () => {
  assert.equal(fromXeroParts({ PhoneAreaCode: "0476 804", PhoneNumber: "0476804565" }), "0476 804 565");
  assert.equal(fromXeroParts({ PhoneAreaCode: "0428", PhoneNumber: "0428623458" }), "0428 623 458");
  assert.equal(fromXeroParts({ PhoneCountryCode: "61", PhoneNumber: "61417671188" }), "0417 671 188");
  assert.equal(fromXeroParts({ PhoneAreaCode: "02", PhoneNumber: "6242 4677" }), "02 6242 4677");
  assert.equal(fromXeroParts({ PhoneAreaCode: "6242", PhoneNumber: "62427722" }), "6242 7722");
  assert.equal(fromXeroParts({ PhoneNumber: "0412 345 678" }), "0412 345 678");
});

test("stored numbers that were joined wrongly are fixed", () => {
  assert.deepEqual(cleanStored("+0476 804 0476804565"), ["0476 804 565"]);
  assert.deepEqual(cleanStored("+02 6273 0262735383"), ["02 6273 5383"]);
  assert.deepEqual(cleanStored("61 61417671188"), ["0417 671 188"]);
  assert.deepEqual(cleanStored("+61 02 6242 4677"), ["02 6242 4677"]);
  assert.deepEqual(cleanStored("6242 62427722"), ["6242 7722"]);
  assert.deepEqual(cleanStored("+Phone: 6260 6713\rMobile: 0422 891 024"), ["6260 6713", "0422 891 024"]);
  assert.deepEqual(cleanStored("0412 345 678"), ["0412 345 678"]);
  assert.equal(formatAu("1300123456"), "1300 123 456");
});

test("the other shapes found in the client list", () => {
  assert.deepEqual(cleanStored("04932019960412742504"), ["0493 201 996", "0412 742 504"]);
  assert.deepEqual(cleanStored("+61 02 610262733107"), ["02 6273 3107"]);
  assert.deepEqual(cleanStored("+61 (2) 0406 042 434"), ["0406 042 434"]);
  assert.deepEqual(cleanStored("+1300 996 1300996909"), ["1300 996 909"]);
  assert.deepEqual(cleanStored("+63 917 827 5455"), ["+639178275455"]);
  assert.deepEqual(cleanStored("0011+64 6421518125"), ["+646421518125"]);
  assert.deepEqual(cleanStored("Hummid 0432211802"), ["0432 211 802"]);
  assert.deepEqual(cleanStored("02 6201 7838  |  0477 37 9959"), ["02 6201 7838", "0477 379 959"]);
  assert.deepEqual(cleanStored("+(02) 6162 0261621886"), ["02 6162 1886"]);
});
