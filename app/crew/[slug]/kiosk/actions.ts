"use server";

import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { kioskOrg } from "@/lib/roster/kiosk";
import { clockOff, clockOn, endBreak, openEntry, startBreak } from "@/lib/roster/clock";
import { pinHash } from "@/lib/roster/pin";
import type { KioskPerson } from "@/lib/roster/kiosk-data";

export type KioskResult = { ok: true; message: string; state?: "off" | "on" | "break"; note?: string | null } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const REPLACED = "This iPad link has been replaced — ask the office for the new one.";

/**
 * PIN + action in one go (no separate PIN check first, so it's quick): clock on / start break / end break / clock off.
 * Clocking on returns the shift's note, shown as a pop-up.
 */
export async function kioskClock(slug: string, token: string, memberId: string, pin: string, what: "check" | "on" | "break" | "back" | "off", photo: string | null = null): Promise<KioskResult> {
  try {
    const k = await kioskOrg(slug, token);
    if (!k) return { ok: false, error: REPLACED };
    if (!UUID.test(memberId) || !/^\d{4}$/.test(pin)) return { ok: false, error: "Enter your 4-digit PIN." };
    const { data: m } = await k.db.from("crew_members").select("id, name, kiosk_pin_hash, on_roster, active").eq("id", memberId).eq("organisation_id", k.org.id).maybeSingle();
    if (!m?.active || !m.on_roster) return { ok: false, error: "You're not on the roster." };
    if (!m.kiosk_pin_hash || !same(m.kiosk_pin_hash as string, pinHash(k.org.id, memberId, pin))) {
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      return { ok: false, error: m.kiosk_pin_hash ? "That PIN isn't right." : "You don't have a PIN yet — set one in the staff app, or ask a manager." };
    }
    const first = (m.name as string).split(" ")[0];
    if (what === "check") {
      const e = await openEntry(k.db, k.org.id, memberId);
      return { ok: true, message: `Hi ${first}`, state: !e ? "off" : e.break_started_at ? "break" : "on" };
    }
    const pic = photo && photo.length < 800_000 ? photo : null;
    if (what === "on") {
      const msg = await clockOn(k.db, k.org, memberId, { source: "kiosk", where: null, photo: pic });
      // the shift's note (from the roster) to show after clocking on
      const e = await openEntry(k.db, k.org.id, memberId);
      const { data: sh } = e?.staff_shift_id ? await k.db.from("staff_shifts").select("notes").eq("id", e.staff_shift_id).maybeSingle() : { data: null };
      return { ok: true, message: `${first}: ${msg}`, state: "on", note: (sh?.notes as string | null) ?? null };
    }
    const msg = what === "off" ? await clockOff(k.db, k.org, memberId, { source: "kiosk", where: null, photo: pic })
      : what === "break" ? await startBreak(k.db, k.org.id, memberId) : await endBreak(k.db, k.org.id, memberId);
    return { ok: true, message: `${first}: ${msg}`, state: what === "break" ? "break" : what === "back" ? "on" : "off" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The people list again (every 30 seconds, and after each action) — quicker than reloading the page. */
export async function kioskRefresh(slug: string, token: string): Promise<{ ok: true; people: KioskPerson[] } | { ok: false; error: string }> {
  const k = await kioskOrg(slug, token);
  if (!k) return { ok: false, error: REPLACED };
  const { kioskPeople } = await import("@/lib/roster/kiosk-data");
  const { runRosterJobsSoon } = await import("@/lib/roster/jobs");
  after(() => runRosterJobsSoon(k.db, k.org.id)); // late texts / reminders while the iPad is open
  return { ok: true, people: await kioskPeople(k.db, k.org) };
}

/** "View full roster": the week ahead (names, areas, times). */
export async function kioskRoster(slug: string, token: string) {
  const k = await kioskOrg(slug, token);
  if (!k) return { ok: false as const, error: REPLACED };
  const { kioskWeek } = await import("@/lib/roster/kiosk-data");
  return { ok: true as const, shifts: await kioskWeek(k.db, k.org) };
}

/** Tick an item on today's checklist from the café iPad (no PIN needed). */
export async function kioskTick(slug: string, token: string, checklistId: string, item: number, done: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const k = await kioskOrg(slug, token);
    if (!k) return { ok: false, error: REPLACED };
    if (!UUID.test(checklistId)) return { ok: false, error: "Refresh and try again." };
    const { tickItem } = await import("@/lib/roster/checklists");
    await tickItem(k.db, k.org, checklistId, Number(item), null, !!done);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
