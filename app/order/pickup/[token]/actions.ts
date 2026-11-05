"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/integrations/runtime";
import { passOrder, passVerdict, teamViewer } from "@/lib/wholesale/pickup";

/** Counter staff (signed in) hand the order over: mark it collected. */
export async function markCollected(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = createServiceClient();
    const o = await passOrder(db, String(token));
    if (!o) return { ok: false, error: "That pickup pass isn't valid." };
    const me = await teamViewer(db, o.organisation_id);
    if (!me) return { ok: false, error: "Sign in to EventureOS to mark it collected." };
    const v = passVerdict(o);
    if (!v.ok) return { ok: false, error: `${v.title}.` };
    const at = new Date().toISOString();
    const { data, error } = await db.from("wholesale_orders").update({ status: "delivered", collected_at: at, collected_by: me.name, updated_at: at })
      .eq("id", o.id).is("collected_at", null).neq("status", "cancelled").select("id");
    if (error) return { ok: false, error: "Couldn't save — try again." };
    if (!data?.length) return { ok: false, error: "Someone has just marked it collected." };
    await db.from("activity_logs").insert({ organisation_id: o.organisation_id, actor_id: me.userId, actor_type: "user", actor_label: me.name, action: "wholesale.order_collected", entity_type: "wholesale_order", entity_id: o.id,
      summary: `${me.name} handed over pickup order ${o.number} to ${o.customer?.name ?? "the customer"}` }).then(() => null, () => null);
    revalidatePath(`/order/pickup/${token}`);
    revalidatePath("/wholesale", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[wholesale] mark collected:", e);
    return { ok: false, error: "Couldn't save — try again." };
  }
}
