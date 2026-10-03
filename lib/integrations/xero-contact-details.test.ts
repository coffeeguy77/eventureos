import { planContactFill, xeroAddress } from "./xero-contact-details";
let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "ok  " : "FAIL", n, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const x = {
  ContactID: "x", Name: "FlatRock Land Trust", FirstName: "Richard", LastName: "Stevenson", EmailAddress: "r@rps.com",
  Phones: [{ PhoneType: "MOBILE", PhoneNumber: "0421 691 368" }],
  Addresses: [{ AddressType: "POBOX", AddressLine1: "PO Box 9", City: "Canberra", Region: "ACT", PostalCode: "2601", Country: "Australia" },
              { AddressType: "STREET", AddressLine1: "12 Smith St", City: "Nicholls", Region: "ACT", PostalCode: "2913" }],
  ContactPersons: [{ FirstName: "Mary", LastName: "Bul", EmailAddress: "mary@rps.com" }, { FirstName: "Richard", LastName: "Stevenson", EmailAddress: "R@rps.com" }],
};
eq("street address preferred", xeroAddress(x), "12 Smith St\nNicholls ACT 2913");
eq("postal used when no street", xeroAddress({ ...x, Addresses: [x.Addresses[0]] }), "PO Box 9\nCanberra ACT 2601");
eq("empty address → null", xeroAddress({ ...x, Addresses: [{ AddressType: "STREET" }] }), null);
const plan = planContactFill({ id: "c", email: "r@rps.com", phone: null, address: null },
  [{ id: "k1", first_name: "Richard", last_name: "Stevenson", email: "r@rps.com", phone: null, is_primary: true }], x);
eq("fills blanks", plan.customer, { address: "12 Smith St\nNicholls ACT 2913", phone: "0421 691 368" });
eq("primary person's phone", plan.contactPhones, [{ id: "k1", phone: "0421 691 368" }]);
eq("only new people added", plan.addContacts.map((c) => c.email), ["mary@rps.com"]);
const keep = planContactFill({ id: "c", email: "a@b.com", phone: "02 6000 0000", address: "1 Here St" }, [], x);
eq("never overwrites", keep.customer, {});
eq("no people yet → main person becomes primary", keep.addContacts[0], { first_name: "Richard", last_name: "Stevenson", email: "r@rps.com", phone: "0421 691 368", is_primary: true });
if (fail) { console.error(`${fail} failed`); process.exit(1); }
