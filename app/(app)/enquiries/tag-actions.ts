"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { cleanTags } from "@/lib/mail/rules-core";

/** Tags (folders) on enquiries — e.g. "Coffee Van" — for filtering the inbox. */
export async function setEnquiryTags(id: string, tags: string[]): Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> {
  try {
    const { supabase, org, role } = await requireOrg();
    if (role === "staff" || role === "customer") throw new Error("Only the office team can do that.");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Refresh and try again.");
    const clean = cleanTags(tags);
    const { error } = await supabase.from("enquiries").update({ tags: clean }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(/tags/.test(error.message) ? "Tags need the 0071 database update first." : error.message);
    revalidatePath("/enquiries");
    revalidatePath(`/enquiries/${id}`);
    return { ok: true, tags: clean };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
