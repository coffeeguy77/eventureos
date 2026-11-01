import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/integrations/runtime";
import { crewOrg } from "@/lib/crew/server";
import { kioskHash } from "./pin";
import { readRosterSettings } from "./settings";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The café iPad: the link's secret proves it's the café's device; the PIN proves who's clocking on. */
export async function kioskOrg(slug: string, token: string) {
  const o = await crewOrg(slug);
  if (!o || !token) return null;
  const db = createServiceClient();
  const { data } = await db.from("organisations").select("id, timezone, settings, logo_url, brand_colour").eq("id", o.id).single();
  const settings = readRosterSettings(data?.settings);
  if (!settings.kiosk_hash || !same(settings.kiosk_hash, kioskHash(o.id, token))) return null;
  const d = data as { id: string; timezone: string; settings: unknown; logo_url: string | null; brand_colour: string | null };
  return { db, org: { id: d.id, timezone: d.timezone, settings: d.settings }, name: o.name, logo: d.logo_url, brand: d.brand_colour };
}


/** Manager access on the iPad: a short-lived signed pass (no cookie — the kiosk keeps it in memory). */
import { createHmac } from "node:crypto";
const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CRON_SECRET ?? "eventureos-kiosk";
export function managerPass(orgId: string, memberId: string, minutes = 15) {
  const exp = Date.now() + minutes * 60_000;
  const sig = createHmac("sha256", secret()).update(`${orgId}.${memberId}.${exp}`).digest("hex");
  return `${memberId}.${exp}.${sig}`;
}
export function checkPass(orgId: string, pass: string): string | null {
  const [memberId, exp, sig] = String(pass).split(".");
  if (!memberId || !exp || !sig || Number(exp) < Date.now()) return null;
  const want = createHmac("sha256", secret()).update(`${orgId}.${memberId}.${exp}`).digest("hex");
  return same(want, sig) ? memberId : null;
}
