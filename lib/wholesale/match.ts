import type { OmOrder } from "./ordermentum-email";
import { nameKey } from "./rules";

/** Which wholesale customer an order email is for: same name, the To block starting with their name, else their phone. Pure. */
export type MatchCustomer = { id: string; name: string; business_name: string | null; phone: string | null; delivery_weekday: number | null };

export function matchCustomer(o: Pick<OmOrder, "customerName" | "customerBlock" | "phone">, customers: MatchCustomer[]): MatchCustomer | null {
  const nk = nameKey(o.customerName);
  const exact = customers.find((c) => nameKey(c.name) === nk || (c.business_name && nameKey(c.business_name) === nk));
  if (exact) return exact;
  // The To block starts with the name (HTML can run the name into the address)
  const bk = nameKey(o.customerBlock);
  const starts = customers.filter((c) => [c.name, c.business_name].some((n) => n && nameKey(n).length >= 4 && bk.startsWith(nameKey(n))))
    .sort((a, b) => nameKey(b.name).length - nameKey(a.name).length);
  if (starts[0]) return starts[0];
  const ph = (o.phone ?? "").replace(/\D/g, "").replace(/^61/, "0");
  if (ph.length >= 8) return customers.find((c) => (c.phone ?? "").replace(/\D/g, "").replace(/^61/, "0").endsWith(ph.slice(-8))) ?? null;
  return null;
}

