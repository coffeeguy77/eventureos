import "server-only";
import { createServiceClient } from "@/lib/integrations/runtime";
import { publicOrg } from "@/lib/bookings/server";
import { cleanAnswers, isEmail, MODELS, type FranchiseModel, type FranchiseStatus } from "./core";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notReady = (m: string) => /franchise_applications|relation .* does not exist|schema cache/i.test(m);

export interface FranchiseRow {
  id: string; status: FranchiseStatus; name: string; email: string; phone: string | null; location: string | null; model: FranchiseModel | null;
  message: string | null; answers: Record<string, string>; token: string; notes: string | null; source: string | null;
  invited_at: string | null; applied_at: string | null; decided_at: string | null; created_at: string; updated_at: string;
}
export const FRANCHISE_COLS = "id, status, name, email, phone, location, model, message, answers, token, notes, source, invited_at, applied_at, decided_at, created_at, updated_at";

/** The franchise page's enquiry form → a new enquiry in Franchise (and a notification for the office). */
export async function franchiseEnquiry(slug: string, f: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }> {
  if (str(f.website, 5)) return { ok: true }; // honeypot
  const org = await publicOrg(slug).catch(() => null);
  if (!org) return { ok: false, error: "This form isn't available." };
  const name = str(f.name, 160), email = str(f.email, 254).toLowerCase();
  if (name.length < 2) return { ok: false, error: "Add your name." };
  if (!isEmail(email)) return { ok: false, error: "Add a valid email so we can reply." };
  const model = (MODELS as readonly string[]).includes(f.model) ? (f.model as FranchiseModel) : null;
  const db = createServiceClient();
  // One enquiry per email per hour is plenty
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: e0 } = await db.from("franchise_applications").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).ilike("email", email).gte("created_at", since);
  if (e0) return { ok: false, error: notReady(e0.message) ? "Franchise enquiries aren't switched on yet — please call or email us." : "Couldn't send that — please try again or call us." };
  if ((count ?? 0) > 0) return { ok: true };
  const { data, error } = await db.from("franchise_applications").insert({
    organisation_id: org.id, name, email, phone: str(f.phone, 40) || null, location: str(f.location, 200) || null, model, message: str(f.message, 4000) || null, source: str(f.source, 80) || "website",
  }).select("id").single();
  if (error) return { ok: false, error: "Couldn't send that — please try again or call us." };
  await db.from("notifications").insert({ organisation_id: org.id, type: "franchise.enquiry", title: `Franchise enquiry — ${name}`.slice(0, 200),
    body: [str(f.location, 200), model ? model : null].filter(Boolean).join(" · ") || null, link: `/franchise/${data.id}`, entity_type: "franchise_application", entity_id: data.id }).then(() => undefined, () => undefined);
  return { ok: true };
}

/** The application form, opened from the emailed link. */
export async function applicationByToken(slug: string, token: string) {
  if (!UUID.test(token)) return null;
  const org = await publicOrg(slug).catch(() => null);
  if (!org) return null;
  const { data } = await createServiceClient().from("franchise_applications").select("id, status, name, email, phone, model, answers").eq("organisation_id", org.id).eq("token", token).maybeSingle();
  return data ? { org, app: data as { id: string; status: FranchiseStatus; name: string; email: string; phone: string | null; model: FranchiseModel | null; answers: Record<string, string> } } : null;
}

export async function submitApplication(slug: string, token: string, raw: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  const x = await applicationByToken(slug, token);
  if (!x) return { ok: false, error: "This application link isn't valid any more — please contact us." };
  if (["approved", "declined", "withdrawn"].includes(x.app.status)) return { ok: false, error: "This application has already been decided — please contact us if anything's changed." };
  const c = cleanAnswers(raw, x.org.name);
  if (!c.ok) return c;
  const phone = str(raw.phone, 40);
  const db = createServiceClient();
  const first = !["applied", "reviewing"].includes(x.app.status);
  const { error } = await db.from("franchise_applications").update({
    answers: c.answers, status: x.app.status === "reviewing" ? "reviewing" : "applied", applied_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    location: c.answers.area ?? null, ...(phone ? { phone } : {}),
  }).eq("id", x.app.id);
  if (error) return { ok: false, error: "Couldn't save your application — please try again." };
  await db.from("notifications").insert({ organisation_id: x.org.id, type: "franchise.applied", title: `${first ? "Franchise application in" : "Franchise application updated"} — ${x.app.name}`.slice(0, 200),
    body: c.answers.area ?? null, link: `/franchise/${x.app.id}`, entity_type: "franchise_application", entity_id: x.app.id }).then(() => undefined, () => undefined);
  return { ok: true };
}
