/**
 * What the chef has (and hasn't) been told about. Each confirmed catering job keeps a fingerprint of what was last sent
 * (events.catering_sent = { sig, sent_at, changed_at? }); a different fingerprint means the job changed.
 * Pure — no database.
 */
import type { Delivery } from "./core";

export interface Sent { sig: string; sent_at: string; changed_at?: string | null }
export type ChangeKind = "new" | "changed" | "cancelled";
export interface KitchenChange { kind: ChangeKind; eventId: string; title: string; deliveries: Delivery[]; reason?: string }

export function readSent(v: unknown): Sent | null {
  const r = (v && typeof v === "object" && !Array.isArray(v) ? v : null) as Record<string, unknown> | null;
  return r && typeof r.sig === "string" && typeof r.sent_at === "string" ? { sig: r.sig, sent_at: r.sent_at, changed_at: typeof r.changed_at === "string" ? r.changed_at : null } : null;
}

/** A fingerprint of everything the kitchen cares about for one job: days, times, items, where, how many people, notes. */
export function signature(deliveries: Delivery[]): string {
  const parts = deliveries
    .map((d) => [d.date, d.time ?? "", d.items.map((i) => `${i.service_id ?? i.name.toLowerCase()}=${i.qty}`).sort().join(","), d.address ?? "", d.venue ?? "", d.guests ?? "", d.notes ?? ""].join("|"))
    .sort();
  let h = 5381;
  const s = parts.join("\n");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${parts.length}:${(h >>> 0).toString(36)}`;
}

/** Group deliveries by job. */
export function byJob(deliveries: Delivery[]) {
  const m = new Map<string, Delivery[]>();
  for (const d of deliveries) (m.get(d.event_id) ?? m.set(d.event_id, []).get(d.event_id)!).push(d);
  for (const list of m.values()) list.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99"));
  return m;
}

/**
 * Compare the jobs now with what was last sent.
 *  current: confirmed catering jobs coming up; sent: jobs that have a fingerprint saved (with their status now).
 */
export function diff(current: Map<string, Delivery[]>, sent: { id: string; title: string; status: string; sent: Sent | null }[]): KitchenChange[] {
  const out: KitchenChange[] = [];
  const known = new Map(sent.map((s) => [s.id, s]));
  for (const [id, list] of current) {
    const was = known.get(id)?.sent ?? null;
    if (!was) out.push({ kind: "new", eventId: id, title: list[0].customer ?? list[0].title, deliveries: list });
    else if (was.sig !== signature(list)) out.push({ kind: "changed", eventId: id, title: list[0].customer ?? list[0].title, deliveries: list });
  }
  for (const s of sent) {
    if (!s.sent || current.has(s.id)) continue;
    out.push({ kind: "cancelled", eventId: s.id, title: s.title, deliveries: [], reason: s.status === "cancelled" ? "The job was cancelled." : "The catering was taken off, or the job is no longer confirmed." });
  }
  return out;
}

const nice = (iso: string) => new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const fmtT = (t: string | null) => { if (!t) return "time TBC"; const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)}${h < 12 ? "am" : "pm"}`; };
const LABEL: Record<ChangeKind, string> = { new: "NEW", changed: "CHANGED", cancelled: "CANCELLED" };

/** Plain lines for the chef's email, one block per job. */
export function changeLines(c: KitchenChange): string[] {
  const first = c.deliveries[0];
  const head = `${LABEL[c.kind]} — ${c.title}${first?.event_number ? ` (${first.event_number})` : ""}`;
  if (c.kind === "cancelled") return [head, c.reason ?? ""];
  const lines = [head];
  for (const d of c.deliveries) lines.push(`${nice(d.date)}, ${fmtT(d.time)}: ${d.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}`);
  const where = [first?.venue, first?.address].filter(Boolean).join(", ");
  if (where) lines.push(`Where: ${where}`);
  if (first?.guests) lines.push(`Guests: ${first.guests}`);
  const notes = (first?.notes ?? "").split("\n").filter((l) => /dietary|gluten|vegan|vegetarian|allerg|halal|dairy|nut/i.test(l)).join(" ");
  if (notes) lines.push(`Notes: ${notes.slice(0, 300)}`);
  return lines;
}

export function changeSubject(changes: KitchenChange[]) {
  const n = (k: ChangeKind) => changes.filter((c) => c.kind === k).length;
  const bits = [n("new") && `${n("new")} new`, n("changed") && `${n("changed")} changed`, n("cancelled") && `${n("cancelled")} cancelled`].filter(Boolean);
  if (changes.length === 1) return `${changes[0].kind === "new" ? "New catering job" : changes[0].kind === "changed" ? "Catering changed" : "Catering cancelled"}: ${changes[0].title}`;
  return `Catering jobs: ${bits.join(", ")}`;
}
