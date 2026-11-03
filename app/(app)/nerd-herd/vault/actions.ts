"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireOrg } from "@/lib/context";
import { actorName } from "@/lib/activity";
import { createServiceClient } from "@/lib/integrations/runtime";
import { KINDS, MAX_FAILS, PIN_RE, UNLOCK_MINUTES, checkPin, clearUnlocked, hashPin, setUnlocked, unlockedFor, type VaultKind } from "@/lib/nerdherd/vault";

/** Nerd Herd password vault: PIN, unlock, saved logins (passwords encrypted in Supabase Vault), access, sign-in. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => {
  const m = e instanceof Error ? e.message : String(e);
  return { ok: false, error: /nerd_vault|vault_(store|read|drop)/.test(m) && /does not exist|could not find/i.test(m) ? "The vault needs database update 0095 first." : m };
};
const UUID = /^[0-9a-f-]{36}$/i;
const LOCK_MIN = 15;

async function base() {
  const c = await requireOrg();
  if (c.role === "customer" || c.role === "staff") throw new Error("The vault is for the office team.");
  const db = createServiceClient();
  const { data: m, error } = await db.from("nerd_vault_members").select("pin_hash, failed, locked_until").eq("organisation_id", c.org.id).eq("user_id", c.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return { ...c, db, member: m as { pin_hash: string | null; failed: number; locked_until: string | null } | null };
}
/** A member with the vault unlocked in this browser. */
async function open() {
  const c = await base();
  if (!c.member) throw new Error("You don't have access to the vault — ask an owner or admin.");
  if (!(await unlockedFor(c.user.id, c.org.id))) throw new Error("The vault is locked — enter your PIN.");
  await setUnlocked(c.user.id, c.org.id); // keep it open while you're using it
  return c;
}
async function log(c: Awaited<ReturnType<typeof base>>, action: string, o: { itemId?: string | null; websiteId?: string | null; detail?: string | null } = {}) {
  await c.db.from("nerd_vault_log").insert({ organisation_id: c.org.id, user_id: c.user.id, actor: actorName(c.profile), action, item_id: o.itemId ?? null, website_id: o.websiteId ?? null, detail: o.detail?.slice(0, 500) ?? null });
}

export interface VaultState { member: boolean; hasPin: boolean; unlockedMinutes: number; lockedUntil: string | null; canManage: boolean }
export async function vaultState(): Promise<R<VaultState>> {
  try {
    const c = await base();
    return { ok: true, data: { member: !!c.member, hasPin: !!c.member?.pin_hash, unlockedMinutes: c.member ? await unlockedFor(c.user.id, c.org.id) : 0, lockedUntil: c.member?.locked_until && Date.parse(c.member.locked_until) > Date.now() ? c.member.locked_until : null, canManage: ["owner", "admin"].includes(c.role) } };
  } catch (e) { return fail(e); }
}

/** Set (or change) your PIN. Changing needs your current PIN. */
export async function setVaultPin(pin: string, current?: string): Promise<R> {
  try {
    const c = await base();
    if (!c.member) throw new Error("You don't have access to the vault.");
    if (!PIN_RE.test(pin)) throw new Error("Use 4 to 8 digits.");
    if (c.member.pin_hash && !checkPin(current ?? "", c.member.pin_hash)) throw new Error("Your current PIN isn't right.");
    await c.db.from("nerd_vault_members").update({ pin_hash: hashPin(pin), pin_set_at: new Date().toISOString(), failed: 0, locked_until: null }).eq("organisation_id", c.org.id).eq("user_id", c.user.id);
    await setUnlocked(c.user.id, c.org.id);
    await log(c, "unlock", { detail: c.member.pin_hash ? "PIN changed" : "PIN set" });
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function unlockVault(pin: string): Promise<R<{ minutes: number }>> {
  try {
    const c = await base();
    if (!c.member) throw new Error("You don't have access to the vault.");
    if (!c.member.pin_hash) throw new Error("Set your PIN first.");
    if (c.member.locked_until && Date.parse(c.member.locked_until) > Date.now()) throw new Error(`Too many wrong PINs — try again after ${new Date(c.member.locked_until).toLocaleTimeString("en-AU", { timeZone: c.org.timezone, hour: "numeric", minute: "2-digit" })}.`);
    if (!checkPin(String(pin ?? ""), c.member.pin_hash)) {
      const failed = (c.member.failed ?? 0) + 1;
      const lock = failed >= MAX_FAILS;
      await c.db.from("nerd_vault_members").update({ failed: lock ? 0 : failed, locked_until: lock ? new Date(Date.now() + LOCK_MIN * 60_000).toISOString() : null }).eq("organisation_id", c.org.id).eq("user_id", c.user.id);
      const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      await log(c, "pin_failed", { detail: `${lock ? `Locked for ${LOCK_MIN} min after ${MAX_FAILS} wrong PINs` : `Wrong PIN (${failed} of ${MAX_FAILS})`}${ip ? ` · ${ip}` : ""}` });
      throw new Error(lock ? `Too many wrong PINs — the vault is locked for ${LOCK_MIN} minutes.` : `Wrong PIN — ${MAX_FAILS - failed} ${MAX_FAILS - failed === 1 ? "try" : "tries"} left.`);
    }
    await c.db.from("nerd_vault_members").update({ failed: 0, locked_until: null }).eq("organisation_id", c.org.id).eq("user_id", c.user.id);
    await setUnlocked(c.user.id, c.org.id);
    await log(c, "unlock");
    return { ok: true, data: { minutes: UNLOCK_MINUTES } };
  } catch (e) { return fail(e); }
}

export async function lockVault(): Promise<R> { try { await clearUnlocked(); return { ok: true, data: undefined }; } catch (e) { return fail(e); } }

export interface ItemInput { customerId: string | null; websiteId: string | null; label: string; kind: VaultKind; url: string; username: string; password?: string | null; notes?: string | null; clearNotes?: boolean }

/** Add or change a saved login. Password / notes only change when you type new ones. */
export async function saveVaultItem(id: string | null, i: ItemInput): Promise<R<{ id: string }>> {
  try {
    const c = await open();
    const label = (i.label ?? "").trim().slice(0, 200);
    if (!label) throw new Error("Give it a name, e.g. “WordPress admin”.");
    const kind = (KINDS as readonly string[]).includes(i.kind) ? i.kind : "other";
    let url = (i.url ?? "").trim().slice(0, 500);
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    const customerId = i.customerId && UUID.test(i.customerId) ? i.customerId : null;
    const websiteId = i.websiteId && UUID.test(i.websiteId) ? i.websiteId : null;
    for (const [t, v] of [["customers", customerId], ["websites", websiteId]] as const) if (v) { const { data } = await c.db.from(t).select("id").eq("id", v).eq("organisation_id", c.org.id).maybeSingle(); if (!data) throw new Error("Choose the client and website again."); }
    let prev: { secret_id: string | null; notes_secret_id: string | null } | null = null;
    if (id) {
      if (!UUID.test(id)) throw new Error("That login doesn't exist.");
      const { data } = await c.db.from("nerd_vault_items").select("secret_id, notes_secret_id").eq("id", id).eq("organisation_id", c.org.id).maybeSingle();
      if (!data) throw new Error("That login no longer exists.");
      prev = data;
    }
    const now = new Date().toISOString();
    const row: Record<string, unknown> = { label, kind, url: url || null, username: (i.username ?? "").trim().slice(0, 300) || null, customer_id: customerId, website_id: websiteId, updated_by: c.user.id, updated_at: now };
    const pw = typeof i.password === "string" ? i.password : "";
    if (pw) {
      if (pw.length > 1000) throw new Error("That password is too long.");
      const { data: sid, error } = await c.db.rpc("vault_store", { p_secret: pw, p_name: `pw:${c.org.id}`, p_id: prev?.secret_id ?? null });
      if (error) throw new Error(error.message);
      row.secret_id = sid; row.has_password = true; row.password_changed_at = now;
    }
    const notes = typeof i.notes === "string" ? i.notes.trim() : "";
    if (notes) {
      const { data: nid, error } = await c.db.rpc("vault_store", { p_secret: notes.slice(0, 8000), p_name: `notes:${c.org.id}`, p_id: prev?.notes_secret_id ?? null });
      if (error) throw new Error(error.message);
      row.notes_secret_id = nid; row.has_notes = true;
    } else if (i.clearNotes && prev?.notes_secret_id) {
      await c.db.rpc("vault_drop", { p_id: prev.notes_secret_id });
      row.notes_secret_id = null; row.has_notes = false;
    }
    let newId = id;
    if (id) {
      const { error } = await c.db.from("nerd_vault_items").update(row).eq("id", id).eq("organisation_id", c.org.id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await c.db.from("nerd_vault_items").insert({ ...row, organisation_id: c.org.id, created_by: c.user.id }).select("id").single();
      if (error) throw new Error(error.message);
      newId = data.id as string;
    }
    await log(c, id ? "update" : "create", { itemId: newId, websiteId, detail: `${label}${pw ? (id ? " — password changed" : "") : ""}` });
    revalidatePath("/nerd-herd/vault"); if (websiteId) revalidatePath(`/nerd-herd/websites/${websiteId}`);
    return { ok: true, data: { id: newId! } };
  } catch (e) { return fail(e); }
}

/** Show or copy a password (or the notes). Every one is logged. */
export async function revealVaultSecret(id: string, what: "password" | "notes", action: "reveal" | "copy"): Promise<R<string>> {
  try {
    if (!UUID.test(id)) throw new Error("That login doesn't exist.");
    const c = await open();
    const { data: it } = await c.db.from("nerd_vault_items").select("id, label, website_id, secret_id, notes_secret_id").eq("id", id).eq("organisation_id", c.org.id).maybeSingle();
    if (!it) throw new Error("That login no longer exists.");
    const sid = what === "password" ? it.secret_id : it.notes_secret_id;
    if (!sid) throw new Error(what === "password" ? "No password saved." : "No notes saved.");
    const { data: v, error } = await c.db.rpc("vault_read", { p_id: sid });
    if (error) throw new Error(error.message);
    await c.db.from("nerd_vault_items").update({ last_revealed_at: new Date().toISOString(), last_revealed_by: c.user.id }).eq("id", id);
    await log(c, action, { itemId: id, websiteId: it.website_id as string | null, detail: `${it.label} — ${what}` });
    return { ok: true, data: String(v ?? "") };
  } catch (e) { return fail(e); }
}

export async function deleteVaultItem(id: string): Promise<R> {
  try {
    if (!UUID.test(id)) throw new Error("That login doesn't exist.");
    const c = await open();
    const { data: it } = await c.db.from("nerd_vault_items").select("label, website_id, secret_id, notes_secret_id").eq("id", id).eq("organisation_id", c.org.id).maybeSingle();
    if (!it) throw new Error("That login no longer exists.");
    for (const s of [it.secret_id, it.notes_secret_id]) if (s) await c.db.rpc("vault_drop", { p_id: s });
    await c.db.from("nerd_vault_items").delete().eq("id", id).eq("organisation_id", c.org.id);
    await log(c, "delete", { websiteId: it.website_id as string | null, detail: it.label as string });
    revalidatePath("/nerd-herd/vault");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Owners and admins choose who can use the vault. */
export async function setVaultMember(userId: string, on: boolean): Promise<R> {
  try {
    const c = await base();
    if (!["owner", "admin"].includes(c.role)) throw new Error("Only owners and admins can choose who uses the vault.");
    if (!UUID.test(userId)) throw new Error("Choose a person.");
    const { data: m } = await c.db.from("organisation_users").select("role, user:users!organisation_users_user_id_fkey(full_name, email)").eq("organisation_id", c.org.id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!m || m.role === "customer") throw new Error("They're not on your team.");
    const who = (m.user as unknown as { full_name: string | null; email: string } | null);
    if (on) await c.db.from("nerd_vault_members").upsert({ organisation_id: c.org.id, user_id: userId, added_by: c.user.id }, { onConflict: "organisation_id,user_id", ignoreDuplicates: true });
    else await c.db.from("nerd_vault_members").delete().eq("organisation_id", c.org.id).eq("user_id", userId);
    await log(c, "access", { detail: `${on ? "Gave" : "Removed"} vault access: ${who?.full_name ?? who?.email ?? "someone"}` });
    revalidatePath("/nerd-herd/vault");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** One-click WordPress sign-in through the Web Culture Connector (vault unlocked with your PIN). */
export async function supportSignIn(websiteId: string): Promise<R<{ url: string; as: string }>> {
  try {
    if (!UUID.test(websiteId)) throw new Error("Refresh and try again.");
    const c = await open();
    const { data: site } = await c.db.from("websites").select("id, domain").eq("id", websiteId).eq("organisation_id", c.org.id).maybeSingle();
    if (!site) throw new Error("That website no longer exists.");
    const [{ data: conn }, { data: k }] = await Promise.all([
      c.db.from("website_connectors").select("site_url, connector_version").eq("website_id", websiteId).eq("organisation_id", c.org.id).maybeSingle(),
      c.db.from("website_connector_keys").select("key").eq("website_id", websiteId).maybeSingle(),
    ]);
    if (!conn || !k?.key) throw new Error("Connect the Web Culture Connector on this site first (WordPress command ops).");
    const ver = String(conn.connector_version ?? "0").split(".").map(Number);
    if ((ver[0] ?? 0) * 1000 + (ver[1] ?? 0) < 1002) throw new Error(`OLD_CONNECTOR:${conn.connector_version ?? "unknown"}`);
    const { callConnector } = await import("@/lib/nerdherd/connector");
    let r: { url: string; expires_in: number; as: string };
    try { r = await callConnector(conn.site_url as string, k.key as string, "POST", "/login-link", { who: actorName(c.profile), to: "/wp-admin/" }, 20_000); }
    catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      throw new Error(/isn't installed or active|no route|rest_no_route|404/i.test(m) ? "OLD_CONNECTOR:unknown" : m);
    }
    const base = new URL(conn.site_url as string);
    const got = new URL(r.url);
    if (got.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "") || got.protocol !== "https:" && base.protocol === "https:") throw new Error("The site returned an unexpected sign-in address.");
    await c.db.from("website_maintenance_runs").insert({ organisation_id: c.org.id, website_id: websiteId, action: "login", ok: true, summary: `Support sign-in by ${actorName(c.profile)} (as ${r.as})`, actor: c.user.id, public: false }).then(() => undefined, () => undefined);
    await log(c, "login", { websiteId, detail: `${site.domain} as ${r.as}` });
    return { ok: true, data: { url: got.toString(), as: r.as } };
  } catch (e) { return fail(e); }
}
