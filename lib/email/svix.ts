import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a webhook signed the Svix way (Resend's webhooks):
 *   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
 *   key = base64-decoded part of the secret after "whsec_"
 *   svix-signature = space-separated "v1,<base64 HMAC-SHA256>" entries (any one may match)
 * Rejects timestamps more than 5 minutes from now (replays).
 */
export function verifySvix(secret: string, h: { id: string | null; timestamp: string | null; signature: string | null }, body: string, now = Date.now()): boolean {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  let key: Buffer;
  try { key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64"); } catch { return false; }
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${body}`).digest();
  return h.signature.split(" ").some((part) => {
    const [ver, sig] = part.split(",");
    if (ver !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
