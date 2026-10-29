import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDomain, dnsHost, findings, mailProvider, type Raw } from "./core";

const ours = { ips: ["203.0.113.10"], names: [{ ip: "203.0.113.10", name: "Liquid Web 1" }] };
const base: Raw = { domain: "client.com.au", a: ["203.0.113.10"], aaaa: [], wwwA: ["203.0.113.10"], wwwCname: [], ns: ["ns1.liquidweb.com"],
  mx: [{ exchange: "mail.client.com.au", priority: 0, ips: ["203.0.113.10"] }], spf: "v=spf1 a mx ~all", dmarc: "v=DMARC1; p=none",
  http: { ok: true, status: 200, finalUrl: "https://client.com.au/", ms: 600, server: "Apache", error: null },
  ssl: { validTo: "2027-01-01T00:00:00Z", issuer: "Let's Encrypt", error: null }, rdap: { expires: "2027-06-01T00:00:00Z", registrar: "VentraIP", status: [], error: null }, dnsError: null };
const now = new Date("2026-10-29T00:00:00Z");

test("all good on our server", () => {
  const f = findings(base, ours, now);
  assert.equal(f.filter((x) => x.level === "bad").length, 0);
  assert.ok(f.some((x) => /points to us — Liquid Web 1/.test(x.title)));
  assert.ok(f.some((x) => /Email is with our server/.test(x.title)));
});

test("moved away: website elsewhere, email at Google", () => {
  const f = findings({ ...base, a: ["198.51.100.7"], mx: [{ exchange: "aspmx.l.google.com", priority: 1, ips: ["142.250.1.1"] }] }, ours, now);
  assert.equal(f[0].level, "bad");
  assert.match(f[0].title, /no longer points to our server/);
  assert.ok(f.some((x) => x.title === "Email is with Google Workspace"));
});

test("email dropped: no MX, dead MX", () => {
  assert.ok(findings({ ...base, mx: [] }, ours, now).some((x) => x.level === "bad" && /bouncing/.test(x.title)));
  assert.ok(findings({ ...base, mx: [{ exchange: "mail.gone.com", priority: 0, ips: [] }] }, ours, now).some((x) => x.level === "bad" && /can't be found/.test(x.title)));
});

test("expired SSL and domain, LeadPages counts as ours", () => {
  const f = findings({ ...base, a: ["76.76.21.21"], ssl: { validTo: "2026-10-01T00:00:00Z", issuer: null, error: null }, rdap: { expires: "2026-10-20T00:00:00Z", registrar: null, status: [], error: null } }, ours, now);
  assert.ok(f.some((x) => /LeadPages \(Vercel\)/.test(x.title)));
  assert.ok(f.some((x) => x.level === "bad" && /SSL certificate expired/.test(x.title)));
  assert.ok(f.some((x) => x.level === "bad" && /registration expired/.test(x.title)));
});

test("names and typing", () => {
  assert.equal(cleanDomain(" https://www.Client.com.au/contact?x=1 "), "client.com.au");
  assert.equal(cleanDomain("not a domain"), null);
  assert.equal(dnsHost(["kate.ns.cloudflare.com"]), "Cloudflare");
  assert.equal(mailProvider([{ exchange: "client-com-au.mail.protection.outlook.com", priority: 0, ips: ["1.1.1.1"] }], ours)?.name, "Microsoft 365");
});
