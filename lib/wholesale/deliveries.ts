/**
 * Wholesale deliveries — the driver's week and the proof of each drop. Pure (used by the staff app, the office and tests).
 */

/** Monday–Sunday week containing `day` (YYYY-MM-DD). */
export function weekOf(day: string): { from: string; to: string } {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - back);
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { from, to: d.toISOString().slice(0, 10) };
}

export interface GeoFix { lat: number; lng: number; accuracy: number | null }

/** Clean a location sent from a phone. null when it's missing or nonsense. */
export function cleanGeo(v: unknown): GeoFix | null {
  if (!v || typeof v !== "object") return null;
  const g = v as Record<string, unknown>;
  const lat = Number(g.lat), lng = Number(g.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const acc = Number(g.accuracy);
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, accuracy: Number.isFinite(acc) && acc >= 0 ? Math.min(100000, Math.round(acc)) : null };
}

/** A Google Maps link to a point (for checking where a delivery was ticked off). */
export const mapPin = (g: { lat: number; lng: number }) => `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}`;

/** A Google Maps directions link to an address (for the driver). */
export const directionsTo = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

/** One-line customer address, or the order's own ship-to when it has one. */
export function deliveryAddress(shipTo: { text?: string } | null | undefined, c: { address1?: string | null; address2?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null } | null | undefined) {
  if (shipTo?.text?.trim()) return shipTo.text.trim();
  if (!c) return "";
  return [c.address1, c.address2, [c.suburb, c.state, c.postcode].filter(Boolean).join(" ")].filter((x) => x && String(x).trim()).join(", ");
}

/** How accurate the phone's location was, in words. */
export function accuracyWords(m: number | null | undefined) {
  if (m == null) return "accuracy unknown";
  if (m <= 30) return `within ${m} m`;
  if (m <= 200) return `within about ${Math.round(m / 10) * 10} m`;
  return `rough — within ${m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 50) * 50} m`}`;
}

export interface DeliveryLogRow { order_id: string; action: "delivered" | "undone"; at: string; by_name: string; lat: number | null; lng: number | null; accuracy_m: number | null; geo_error: string | null; note: string | null }

/** The delivery that currently stands for each order (the latest 'delivered' not followed by an 'undone'). */
export function standingDeliveries(rows: DeliveryLogRow[]): Map<string, DeliveryLogRow> {
  const out = new Map<string, DeliveryLogRow>();
  const byOrder = new Map<string, DeliveryLogRow[]>();
  for (const r of rows) byOrder.set(r.order_id, [...(byOrder.get(r.order_id) ?? []), r]);
  for (const [id, list] of byOrder) {
    const last = [...list].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    if (last?.action === "delivered") out.set(id, last);
  }
  return out;
}
