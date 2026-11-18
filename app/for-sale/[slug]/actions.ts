"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/integrations/runtime";

/** The buyer signs the NDA on their private link (typed full name + tick). */
export async function signNda(slug: string, token: string, name: string, agreed: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!agreed) return { ok: false, error: "Tick the box to agree to keep this confidential." };
    const full = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (full.length < 3 || !full.includes(" ")) return { ok: false, error: "Type your full name (first and last) to sign." };
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token) || !/^[a-z0-9-]{2,80}$/i.test(slug)) return { ok: false, error: "This link isn't valid." };
    const db = createServiceClient();
    const { data: l } = await db.from("sale_listings").select("id").ilike("slug", slug).maybeSingle();
    if (!l) return { ok: false, error: "This listing isn't available." };
    const { data: b } = await db.from("sale_buyers").select("id, status").eq("listing_id", l.id).eq("token", token).maybeSingle();
    if (!b || b.status === "revoked") return { ok: false, error: "This link has been turned off. Ask the seller for a new one." };
    if (b.status === "invited") {
      const h = await headers();
      const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 60) || null;
      const { error } = await db.from("sale_buyers").update({ status: "nda_signed", nda_signed_at: new Date().toISOString(), nda_signed_name: full, nda_ip: ip }).eq("id", b.id);
      if (error) return { ok: false, error: "Couldn't save your signature — try again." };
    }
    revalidatePath(`/for-sale/${slug}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save your signature — try again." };
  }
}

/** Someone on the listing page asks for access; the seller sees it under Buyers and approves (or declines) it. */
export async function requestAccess(slug: string, i: { name: string; email: string; phone?: string; message?: string; website?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (i.website) return { ok: true }; // a bot filled the hidden field
    const name = String(i.name ?? "").trim().slice(0, 120), email = String(i.email ?? "").trim().toLowerCase().slice(0, 200);
    if (name.length < 2) return { ok: false, error: "Add your name." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Add an email address the seller can reply to." };
    if (!/^[a-z0-9-]{2,80}$/i.test(slug)) return { ok: false, error: "This listing isn't available." };
    const db = createServiceClient();
    const { data: l } = await db.from("sale_listings").select("id, organisation_id, is_public").ilike("slug", slug).maybeSingle();
    if (!l || !l.is_public) return { ok: false, error: "This listing isn't available." };
    const { count } = await db.from("sale_buyers").select("id", { head: true, count: "exact" }).eq("listing_id", l.id).eq("email", email).eq("status", "requested");
    if ((count ?? 0) > 0) return { ok: true };
    const { randomBytes } = await import("node:crypto");
    const { error } = await db.from("sale_buyers").insert({
      organisation_id: l.organisation_id, listing_id: l.id, name, email, phone: String(i.phone ?? "").trim().slice(0, 40) || null,
      message: String(i.message ?? "").trim().slice(0, 2000) || null, status: "requested", token: randomBytes(24).toString("base64url"),
    });
    if (error) return { ok: false, error: "Requests aren't switched on yet — please email the seller instead." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't send your request — please try again." };
  }
}
