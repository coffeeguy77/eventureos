import { createHash } from "node:crypto";

/** A café iPad PIN, hashed with the business and person so the same PIN never looks the same twice. */
export const pinHash = (orgId: string, memberId: string, pin: string) => createHash("sha256").update(`${orgId}:${memberId}:${pin}`).digest("hex");
/** The café iPad's secret link, hashed. */
export const kioskHash = (orgId: string, token: string) => createHash("sha256").update(`${orgId}:${token}`).digest("hex");
