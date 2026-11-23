"use server";

import { createServiceClient } from "@/lib/integrations/runtime";

/** Unsubscribe the client this mail-out email went to (button on the page, so link scanners can't do it). */
export async function unsubscribe(token: string, again = false): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false };
  const db = createServiceClient();
  const { data } = await db.from("nh_mailout_sends").select("customer_id").eq("token", token).maybeSingle();
  if (!data?.customer_id) return { ok: false };
  await db.from("customers").update({ unsubscribed_at: again ? null : new Date().toISOString() }).eq("id", data.customer_id);
  return { ok: true };
}
