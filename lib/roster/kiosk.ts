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
  const { data } = await db.from("organisations").select("id, timezone, settings").eq("id", o.id).single();
  const settings = readRosterSettings(data?.settings);
  if (!settings.kiosk_hash || !same(settings.kiosk_hash, kioskHash(o.id, token))) return null;
  return { db, org: data as { id: string; timezone: string; settings: unknown }, name: o.name };
}

