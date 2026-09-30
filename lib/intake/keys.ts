import { createHash, randomBytes } from "node:crypto";

/** Connection keys look like eos_live_<48 hex>. Only the SHA-256 hash is stored. */
export const KEY_PATTERN = /^eos_live_[0-9a-f]{48}$/;
export function newIntakeKey() {
  const key = `eos_live_${randomBytes(24).toString("hex")}`;
  return { key, prefix: key.slice(0, 13), hash: hashIntakeKey(key) };
}
export const hashIntakeKey = (key: string) => createHash("sha256").update(key).digest("hex");
