import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { isAgencyAccess } from "./support";

/**
 * Is this business a web/IT agency (has the Nerd Herd app)? Read server-side only; any failure (no service key,
 * network) just means "no", so every other business's site renders exactly as before.
 */
export const agencyMode = cache(async (slug: string): Promise<boolean> => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return false;
  try {
    const { data } = await createServiceClient().from("organisations").select("app_access").eq("slug", slug).eq("status", "active").maybeSingle();
    return isAgencyAccess(data?.app_access);
  } catch {
    return false;
  }
});
