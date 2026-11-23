import { test } from "node:test";
import assert from "node:assert/strict";
import { detectProvider, missingRecords, relName, sameRecord, txtValue, type DnsRecord } from "./dns";

test("names and TXT values are normalised", () => {
  assert.equal(relName("webculture.au.", "webculture.au"), "");
  assert.equal(relName("_dmarc.webculture.au.", "webculture.au"), "_dmarc");
  assert.equal(txtValue('"v=DKIM1; k=rsa; p=abc" "def"'), "v=DKIM1; k=rsa; p=abcdef");
});

test("mail provider is recognised from MX hosts", () => {
  assert.equal(detectProvider(["smtp.google.com."]), "google");
  assert.equal(detectProvider(["x-com.mail.protection.outlook.com"]), "microsoft");
  assert.equal(detectProvider(["mx1.mailhost.net"]), "other");
  assert.equal(detectProvider([]), "none");
});

test("only missing records are copied, and the website address is left to EventureOS", () => {
  const found: DnsRecord[] = [
    { type: "MX", name: "", value: "smtp.google.com.", priority: 1 },
    { type: "TXT", name: "", value: "v=spf1 include:_spf.google.com -all" },
    { type: "TXT", name: "_dmarc", value: "v=DMARC1; p=none" },
    { type: "A", name: "", value: "35.213.165.118" },
    { type: "CNAME", name: "www", value: "old.host.com" },
  ];
  const existing: DnsRecord[] = [{ type: "MX", name: "", value: "smtp.google.com", priority: 1 }];
  const todo = missingRecords(found, existing);
  assert.deepEqual(todo.map((r) => `${r.type} ${r.name}`), ["TXT ", "TXT _dmarc"]);
  assert.equal(sameRecord({ type: "MX", name: "", value: "a.com", priority: 1 }, { type: "MX", name: "", value: "a.com", priority: 5 }), false);
});
