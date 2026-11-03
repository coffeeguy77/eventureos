import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Nerd Herd password vault (server only).
 *  - Passwords and notes are encrypted in Supabase Vault; only the service role can read them (vault_read).
 *  - Who can use the vault is picked per person (nerd_vault_members). Each person sets a PIN (scrypt-hashed here).
 *  - Entering the PIN unlocks the vault — and one-click WordPress sign-in — for 15 minutes in that browser only
 *    (an httpOnly cookie signed on the server). 5 wrong PINs lock the person out for 15 minutes.
 */
export const UNLOCK_MINUTES = 15;
export const MAX_FAILS = 5;
export const PIN_RE = /^\d{4,8}$/;
const COOKIE = "eos_vault";
const secret = () => {
  const s = process.env.VAULT_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("The vault isn't configured on the server.");
  return s;
};

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const h = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString("hex")}$${h.toString("hex")}`;
}
export function checkPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [v, s, h] = stored.split("$");
  if (v !== "s1" || !s || !h) return false;
  const got = scryptSync(pin, Buffer.from(s, "hex"), 32, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(h, "hex");
  return want.length === got.length && timingSafeEqual(got, want);
}

const sign = (v: string) => createHmac("sha256", secret()).update(`vault.${v}`).digest("hex");

export async function setUnlocked(userId: string, orgId: string) {
  const exp = Date.now() + UNLOCK_MINUTES * 60_000;
  const v = `${userId}.${orgId}.${exp}`;
  (await cookies()).set(COOKIE, `${v}.${sign(v)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: UNLOCK_MINUTES * 60 });
}
export async function clearUnlocked() { (await cookies()).delete(COOKIE); }

/** Minutes left on this browser's unlock for this person and business (0 = locked). */
export async function unlockedFor(userId: string, orgId: string): Promise<number> {
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  const parts = raw.split(".");
  if (parts.length !== 4) return 0;
  const [u, o, exp, sig] = parts;
  const v = `${u}.${o}.${exp}`;
  const want = sign(v);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return 0;
  if (u !== userId || o !== orgId) return 0;
  const left = Number(exp) - Date.now();
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

export const KINDS = ["wordpress", "hosting", "domain", "email", "ftp", "database", "dns", "social", "other"] as const;
export type VaultKind = (typeof KINDS)[number];
export const KIND_LABEL: Record<VaultKind, string> = { wordpress: "WordPress", hosting: "Hosting / cPanel", domain: "Domain registrar", email: "Email", ftp: "FTP / SFTP", database: "Database", dns: "DNS", social: "Social media", other: "Other" };
