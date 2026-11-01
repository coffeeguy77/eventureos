"use server";

import { timingSafeEqual } from "node:crypto";
import { kioskOrg } from "@/lib/roster/kiosk";
import { clockOff, clockOn, endBreak, openEntry, startBreak } from "@/lib/roster/clock";
import { pinHash } from "@/lib/roster/pin";

export type KioskResult = { ok: true; message: string; state?: "off" | "on" | "break" } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function kioskClock(slug: string, token: string, memberId: string, pin: string, what: "check" | "on" | "break" | "back" | "off", photo: string | null = null): Promise<KioskResult> {
  try {
    const k = await kioskOrg(slug, token);
    if (!k) return { ok: false, error: "This iPad link has been replaced — ask the office for the new one." };
    if (!UUID.test(memberId) || !/^\d{4}$/.test(pin)) return { ok: false, error: "Enter your 4-digit PIN." };
    const { data: m } = await k.db.from("crew_members").select("id, name, kiosk_pin_hash, on_roster, active").eq("id", memberId).eq("organisation_id", k.org.id).maybeSingle();
    if (!m?.active || !m.on_roster) return { ok: false, error: "You're not on the roster." };
    if (!m.kiosk_pin_hash || !same(m.kiosk_pin_hash as string, pinHash(k.org.id, memberId, pin))) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return { ok: false, error: m.kiosk_pin_hash ? "That PIN isn't right." : "You don't have a PIN yet — ask the office." };
    }
    const first = (m.name as string).split(" ")[0];
    if (what === "check") {
      const e = await openEntry(k.db, k.org.id, memberId);
      return { ok: true, message: `Hi ${first}`, state: !e ? "off" : e.break_started_at ? "break" : "on" };
    }
    const pic = photo && photo.length < 800_000 ? photo : null;
    const msg = what === "on" ? await clockOn(k.db, k.org, memberId, { source: "kiosk", where: null, photo: pic })
      : what === "off" ? await clockOff(k.db, k.org, memberId, { source: "kiosk", where: null, photo: pic })
      : what === "break" ? await startBreak(k.db, k.org.id, memberId) : await endBreak(k.db, k.org.id, memberId);
    return { ok: true, message: `${first}: ${msg}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Tick an item on today's checklist from the café iPad (no PIN needed). */
export async function kioskTick(slug: string, token: string, checklistId: string, item: number, done: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const k = await kioskOrg(slug, token);
    if (!k) return { ok: false, error: "This iPad link has been replaced — ask the office for the new one." };
    if (!UUID.test(checklistId)) return { ok: false, error: "Refresh and try again." };
    const { tickItem } = await import("@/lib/roster/checklists");
    await tickItem(k.db, k.org, checklistId, Number(item), null, !!done);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
