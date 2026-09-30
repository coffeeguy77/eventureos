"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/integrations/runtime";

const TOKEN = /^[0-9a-f]{64}$/;

async function requestInfo() {
  const h = await headers();
  const dec = (v: string | null) => { if (!v) return null; try { return decodeURIComponent(v).slice(0, 100); } catch { return v.slice(0, 100); } };
  return {
    ip: (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64) || null,
    ua: (h.get("user-agent") ?? "").slice(0, 400) || null,
    // Vercel adds these from the visitor's IP address — approximate, and absent when running locally
    city: dec(h.get("x-vercel-ip-city")),
    region: dec(h.get("x-vercel-ip-country-region")),
    country: dec(h.get("x-vercel-ip-country"))?.slice(0, 8) ?? null,
  };
}

/** Called by the page once it has loaded in a real browser — link scanners that only fetch the page don't count. */
export async function recordQuoteLinkView(token: string): Promise<void> {
  if (!TOKEN.test(token)) return;
  const i = await requestInfo();
  const { error } = await createServiceClient().rpc("quote_link_viewed", {
    p_token: token, p_ip: i.ip, p_user_agent: i.ua, p_city: i.city, p_region: i.region, p_country: i.country,
  });
  if (error) console.error("quote_link_viewed failed", error.message);
}

export type LinkRespondState = { ok?: boolean; decision?: "accepted" | "declined"; error?: string } | undefined;

export async function respondViaQuoteLink(_prev: LinkRespondState, form: FormData): Promise<LinkRespondState> {
  try {
    const token = String(form.get("token") ?? "");
    if (!TOKEN.test(token)) return { error: "This link isn't valid." };
    const decision = String(form.get("decision") ?? "");
    if (decision !== "accepted" && decision !== "declined") return { error: "Choose to accept or decline." };
    const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
    const reason = String(form.get("reason") ?? "").trim();
    if (decision === "accepted") {
      if (name.length < 2 || name.length > 120) return { error: "Type your full name to accept the quote." };
      if (form.get("agree") !== "on") return { error: "Tick the box to confirm you accept the quote and its terms." };
    }
    if (reason.length > 1000) return { error: "Please keep the reason under 1,000 characters." };
    const i = await requestInfo();
    const db = createServiceClient();
    const { data: eventId, error } = await db.rpc("quote_link_respond", {
      p_token: token, p_decision: decision, p_name: decision === "accepted" ? name : name || null,
      p_reason: decision === "declined" ? reason || null : null, p_ip: i.ip, p_user_agent: i.ua,
    });
    if (error) return { error: error.message };
    if (decision === "accepted" && eventId) {
      const { alertBookingApproval } = await import("@/lib/email/booking-approval");
      await alertBookingApproval(db, eventId as string);
    }
    revalidatePath(`/q/${token}`);
    return { ok: true, decision };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}
