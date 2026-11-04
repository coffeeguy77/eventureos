"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { createServiceClient, errMessage } from "@/lib/integrations/runtime";
import { buildContext, runProviderSync } from "@/lib/integrations/sync-runner";

export type GmailSyncState = { ok: boolean; message: string; enquiries?: number };

/**
 * "Check Gmail now" on the Enquiries inbox. Anyone on the team who works enquiries can press it (not just managers):
 * it only reads new mail into EventureOS, it doesn't change any settings. Runs with the server's connection to Gmail.
 */
export async function checkGmailNow(): Promise<GmailSyncState> {
  try {
    const { org, role } = await requireOrg();
    if (!["owner", "admin", "manager", "sales", "staff"].includes(role)) return { ok: false, message: "You can't check email for this business." };
    const db = createServiceClient();
    const { data: integ } = await db.from("integrations").select("status, last_sync_at").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle();
    if (!integ || !["connected", "syncing", "error"].includes(integ.status as string)) return { ok: false, message: "Gmail isn't connected — connect it in Settings → Integrations." };
    const before = new Date().toISOString();
    const ctx = await buildContext(db, "service", org.id, "gmail", null);
    const r = await runProviderSync(ctx);
    const { count } = await db.from("enquiries").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).gte("created_at", before);
    revalidatePath("/enquiries");
    if (!r.ok) return { ok: false, message: r.message };
    return { ok: true, enquiries: count ?? 0, message: count ? `${count} new enquir${count === 1 ? "y" : "ies"} from Gmail.` : "Gmail checked — no new enquiries." };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}
