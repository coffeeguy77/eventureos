import { fromXeroParts } from "@/lib/phone-format";
/** Pure Xero contact helpers (no server imports, so they can be tested with tsx). */
export interface XeroPhone { PhoneType?: string; PhoneNumber?: string; PhoneAreaCode?: string; PhoneCountryCode?: string }
export interface XeroContact {
  ContactID: string; ContactStatus?: string; Name: string; FirstName?: string; LastName?: string; EmailAddress?: string;
  Phones?: XeroPhone[]; IsCustomer?: boolean; IsSupplier?: boolean; UpdatedDateUTC?: string;
  ContactPersons?: { FirstName?: string; LastName?: string; EmailAddress?: string; IncludeInEmails?: boolean }[];
}

export function contactPhone(c: XeroContact): string | null {
  const order = ["MOBILE", "DEFAULT", "DDI", "OFFICE"];
  const phones = (c.Phones ?? []).filter((p) => p.PhoneNumber?.trim());
  phones.sort((a, b) => order.indexOf(a.PhoneType ?? "") - order.indexOf(b.PhoneType ?? ""));
  const p = phones[0];
  if (!p) return null;
  // Xero's three boxes are often filled in oddly (the full number in one, part of it in another) — pick the real number
  return fromXeroParts(p);
}

export function contactPerson(c: XeroContact): string | null {
  const n = [c.FirstName, c.LastName].filter((x) => x?.trim()).join(" ").trim();
  return n || null;
}
