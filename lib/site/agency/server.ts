import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { isAgencyAccess } from "./support";

/**
 * Is this business's website an agency site (has the Nerd Herd app, and no other kind of business here)? Read server-side only; any failure (no service key,
 * network) just means "no", so every other business's site renders exactly as before.
 */
export const agencyMode = cache(async (slug: string): Promise<boolean> => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return false;
  try {
    const { data } = await createServiceClient().from("organisations").select("app_access, settings").eq("slug", slug).eq("status", "active").maybeSingle();
    if (!isAgencyAccess(data?.app_access)) return false;
    // A business that also runs another kind of business here (coffee shop, courses, hire, café…) keeps its own site;
    // Website → settings "site.agencyHome" overrides either way.
    const pick = ((data?.settings as { site?: { agencyHome?: unknown } } | null)?.site?.agencyHome);
    if (pick === true || pick === false) return pick;
    const other = ["store", "bookings", "rentals", "wholesale", "kitchen", "roastery", "learn"];
    return !((data?.app_access ?? []) as string[]).some((a) => other.includes(a));
  } catch {
    return false;
  }
});
