"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSlug, isUuid } from "./portal-data";

/* ------------------------------------------------------------------ */
/* Sign in with an emailed one-time code                               */
/* ------------------------------------------------------------------ */

export type SignInState = { step: "email" | "code"; email?: string; error?: string; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function friendlyAuthError(msg: string) {
  if (/security purposes|only request this after|rate limit/i.test(msg)) return "Please wait a minute before asking for another code.";
  if (/expired|invalid/i.test(msg)) return "That code didn't work — it may have expired. Check the latest email or request a new code.";
  if (/not authorized/i.test(msg)) return "We can't send sign-in emails to this address yet. Please contact the business directly.";
  if (/signups not allowed/i.test(msg)) return "Sign-in by email isn't available right now. Please contact us directly.";
  return msg;
}

export async function portalSignIn(prev: SignInState, form: FormData): Promise<SignInState> {
  const slug = String(form.get("slug") ?? "");
  if (!isSlug(slug)) return { step: "email", error: "This portal link isn't valid." };
  const intent = String(form.get("intent") ?? "send");
  const supabase = await createClient();

  if (intent === "restart") return { step: "email" };

  const email = String(form.get("email") ?? prev.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { step: "email", email, error: "Enter a valid email address." };

  if (intent === "send" || intent === "resend") {
    const { data: brand } = await supabase.rpc("portal_branding", { p_slug: slug });
    if (!brand) return { step: "email", error: "This portal link isn't valid." };
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return { step: intent === "resend" ? "code" : "email", email, error: friendlyAuthError(error.message) };
    return { step: "code", email, message: `We've emailed a sign-in code to ${email}.` };
  }

  if (intent === "verify") {
    const token = String(form.get("code") ?? "").replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Enter the code from the email (numbers only)." };
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) return { step: "code", email, error: friendlyAuthError(error.message) };

    const { data, error: claimErr } = await supabase.rpc("portal_claim_access", { p_slug: slug });
    if (claimErr) {
      await supabase.auth.signOut();
      return { step: "email", email, error: `We couldn't open your portal: ${claimErr.message}` };
    }
    if (!(data as { linked?: boolean } | null)?.linked) {
      await supabase.auth.signOut();
      const { data: brand } = await supabase.rpc("portal_branding", { p_slug: slug });
      const b = brand as { name?: string; contact_email?: string | null; contact_phone?: string | null } | null;
      const contact = [b?.contact_email, b?.contact_phone].filter(Boolean).join(" or ");
      return {
        step: "email",
        email,
        error: `We couldn't find any bookings for ${email}. Please contact ${b?.name ?? "us"}${contact ? ` (${contact})` : ""} and check which email your booking is under.`,
      };
    }
    redirect(`/p/${slug}`);
  }

  return { step: "email", error: "Something went wrong — please try again." };
}

export async function portalSignOut(form: FormData) {
  const slug = String(form.get("slug") ?? "");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(isSlug(slug) ? `/p/${slug}/login` : "/");
}

/* ------------------------------------------------------------------ */
/* Helpers for event-scoped actions                                    */
/* ------------------------------------------------------------------ */

/** Load an event the signed-in person may act on: RLS plus an explicit check against their own linked customers. */
async function portalEvent(slug: string, eventId: string) {
  if (!isSlug(slug) || !isUuid(eventId)) throw new Error("That booking link isn't valid.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has ended — please sign in again.");

  const { data: org } = await supabase.from("organisations").select("id").eq("slug", slug).maybeSingle();
  if (!org) throw new Error("You don't have access to this portal.");
  const { data: contacts } = await supabase
    .from("contacts").select("customer_id").eq("organisation_id", org.id).eq("portal_user_id", user.id);
  const customerIds = (contacts ?? []).map((c) => c.customer_id as string);
  if (!customerIds.length) throw new Error("You don't have access to this portal.");

  const { data: ev, error } = await supabase
    .from("portal_events").select("id, organisation_id, customer_id, name")
    .eq("id", eventId).eq("organisation_id", org.id).in("customer_id", customerIds).maybeSingle();
  if (error) throw new Error(`Could not load your booking: ${error.message}`);
  if (!ev) throw new Error("We couldn't find that booking.");
  return { supabase, user, ev: ev as { id: string; organisation_id: string; customer_id: string; name: string } };
}

export type ActionResult = { ok?: boolean; error?: string };

/* ------------------------------------------------------------------ */
/* Quote response                                                      */
/* ------------------------------------------------------------------ */

export async function respondToQuote(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  try {
    const slug = String(form.get("slug") ?? "");
    const eventId = String(form.get("event_id") ?? "");
    const versionId = String(form.get("version_id") ?? "");
    const decision = String(form.get("decision") ?? "");
    const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
    const reason = String(form.get("reason") ?? "").trim();
    if (!isUuid(versionId)) return { error: "That quote link isn't valid." };
    if (decision !== "accepted" && decision !== "declined") return { error: "Choose to accept or decline." };
    if (decision === "accepted") {
      if (name.length < 2 || name.length > 120) return { error: "Type your full name to accept the quote." };
      if (form.get("agree") !== "on") return { error: "Tick the box to confirm you accept the quote and its terms." };
    }
    if (reason.length > 1000) return { error: "Please keep the reason under 1,000 characters." };

    const { supabase, ev } = await portalEvent(slug, eventId);
    // The version must belong to a quote for THIS event (RLS + portal_quotes limit both to the customer's own)
    const { data: v } = await supabase.from("quote_versions").select("id, quote_id").eq("id", versionId).maybeSingle();
    const { data: q } = v
      ? await supabase.from("portal_quotes").select("id")
          .eq("id", v.quote_id).eq("event_id", ev.id).eq("customer_id", ev.customer_id).maybeSingle()
      : { data: null };
    if (!v || !q) return { error: "We couldn't find that quote." };

    const h = await headers();
    const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64) || null;
    const ua = (h.get("user-agent") ?? "").slice(0, 400) || null;

    const { error } = await supabase.rpc("portal_respond_to_quote", {
      p_version_id: versionId,
      p_decision: decision,
      p_name: decision === "accepted" ? name : name || null,
      p_reason: decision === "declined" ? reason || null : null,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (error) return { error: error.message };
    revalidatePath(`/p/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export async function sendPortalMessage(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  try {
    const slug = String(form.get("slug") ?? "");
    const eventId = String(form.get("event_id") ?? "");
    const body = String(form.get("body") ?? "").trim();
    if (!body) return { error: "Write a message first." };
    if (body.length > 5000) return { error: "Please keep your message under 5,000 characters." };
    const { supabase, user, ev } = await portalEvent(slug, eventId);
    const { error } = await supabase.from("portal_messages").insert({
      organisation_id: ev.organisation_id,
      customer_id: ev.customer_id,
      event_id: ev.id,
      author_type: "customer",
      author_id: user.id,
      body,
    });
    if (error) return { error: `Your message couldn't be sent: ${error.message}` };
    revalidatePath(`/p/${slug}/events/${ev.id}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}

/* ------------------------------------------------------------------ */
/* Document upload (file is already in Storage; record it)             */
/* ------------------------------------------------------------------ */

export async function recordPortalUpload(input: {
  slug: string; eventId: string; requestId: string | null; name: string; path: string; mime: string | null; size: number;
}): Promise<ActionResult> {
  try {
    const { slug, eventId, requestId } = input;
    const name = String(input.name ?? "").trim().slice(0, 200);
    const path = String(input.path ?? "");
    const size = Number(input.size);
    if (!name) return { error: "The file needs a name." };
    if (requestId !== null && !isUuid(requestId)) return { error: "That document request isn't valid." };
    if (!Number.isFinite(size) || size <= 0 || size > 25 * 1024 * 1024) return { error: "Files must be under 25 MB." };
    const { supabase, ev } = await portalEvent(slug, eventId);

    const prefix = `${ev.organisation_id}/portal/${ev.customer_id}/`;
    if (!path.startsWith(prefix) || path.includes("..") || path.length > 500) return { error: "Invalid file location." };

    if (requestId) {
      const { data: req } = await supabase
        .from("documents").select("id")
        .eq("id", requestId).eq("customer_id", ev.customer_id).eq("visibility", "customer").eq("requested_from_customer", true)
        .maybeSingle();
      if (!req) return { error: "That document request is no longer open." };
    }

    const { error } = await supabase.rpc("portal_add_document", {
      p_customer_id: ev.customer_id,
      p_event_id: ev.id,
      p_request_id: requestId,
      p_name: name,
      p_path: path,
      p_mime: input.mime ? String(input.mime).slice(0, 120) : null,
      p_size: Math.round(size),
    });
    if (error) return { error: `Your file was uploaded but couldn't be recorded: ${error.message}` };
    revalidatePath(`/p/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong — please try again." };
  }
}
