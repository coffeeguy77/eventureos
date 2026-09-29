import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseDesign, renderSignature, variantFor, type OrgBranding, type SignatureDesign, type SignaturePerson, type Variant } from "./render";

export const PERSON_FIELDS = ["display_name", "pronouns", "title", "phone", "mobile", "email", "photo_url", "extra_line", "booking_url"] as const;

export async function loadOrgBranding(db: SupabaseClient, orgId: string): Promise<OrgBranding> {
  const { data, error } = await db.from("organisations").select("name, brand_colour, logo_url, website, address, contact_phone").eq("id", orgId).single();
  if (error) throw new Error(`Couldn't load your branding: ${error.message}`);
  return data as OrgBranding;
}

export interface SignatureSetup {
  branding: OrgBranding;
  draft: SignatureDesign;
  /** Has the draft ever been saved? (false → it's the default built from branding) */
  saved: boolean;
  draftUpdatedAt: string | null;
  published: { version: number; design: SignatureDesign; at: string } | null;
}

export async function loadSignatureSetup(db: SupabaseClient, orgId: string): Promise<SignatureSetup> {
  const branding = await loadOrgBranding(db, orgId);
  const { data: row, error } = await db.from("email_signatures").select("draft, draft_updated_at, published_version, published_at").eq("organisation_id", orgId).maybeSingle();
  if (error) throw new Error(`Couldn't load the signature: ${error.message}`);
  let published: SignatureSetup["published"] = null;
  if (row?.published_version) {
    const { data: v, error: vErr } = await db.from("email_signature_versions").select("design, published_at")
      .eq("organisation_id", orgId).eq("version", row.published_version).maybeSingle();
    if (vErr) throw new Error(`Couldn't load the published signature: ${vErr.message}`);
    if (v) published = { version: row.published_version, design: normaliseDesign(v.design, branding), at: v.published_at };
  }
  const saved = Boolean(row && row.draft && Object.keys(row.draft).length);
  return {
    branding,
    draft: normaliseDesign(saved ? row!.draft : published?.design ?? null, branding),
    saved,
    draftUpdatedAt: row?.draft_updated_at ?? null,
    published,
  };
}

export interface TeamPerson {
  userId: string;
  role: string;
  accountName: string | null;
  accountEmail: string;
  /** What's stored in signature_profiles (null where they haven't set anything) */
  stored: SignaturePerson | null;
  /** Stored values with sensible fallbacks from their account — what the signature actually shows */
  person: SignaturePerson;
  updatedAt: string | null;
}

/** Everyone on the team (not customers), with their signature details resolved. */
export async function loadTeamPeople(db: SupabaseClient, orgId: string, onlyUserId?: string): Promise<TeamPerson[]> {
  let q = db.from("organisation_users")
    .select("role, title, user:users!organisation_users_user_id_fkey(id, full_name, email)")
    .eq("organisation_id", orgId).eq("status", "active").neq("role", "customer");
  if (onlyUserId) q = q.eq("user_id", onlyUserId);
  const [{ data: members, error }, { data: profiles, error: pErr }] = await Promise.all([
    q,
    (() => { let p = db.from("signature_profiles").select("*").eq("organisation_id", orgId); if (onlyUserId) p = p.eq("user_id", onlyUserId); return p; })(),
  ]);
  if (error) throw new Error(`Couldn't load the team: ${error.message}`);
  if (pErr) throw new Error(`Couldn't load signature details: ${pErr.message}`);
  const byUser = new Map((profiles ?? []).map((p: any) => [p.user_id as string, p]));
  return ((members ?? []) as any[]).filter((m) => m.user).map((m) => {
    const u = m.user as { id: string; full_name: string | null; email: string };
    const s = byUser.get(u.id) as (SignaturePerson & { updated_at: string }) | undefined;
    const stored: SignaturePerson | null = s ? Object.fromEntries(PERSON_FIELDS.map((f) => [f, s[f] ?? null])) : null;
    const person: SignaturePerson = {
      ...Object.fromEntries(PERSON_FIELDS.map((f) => [f, stored?.[f] ?? null])),
      display_name: stored?.display_name || u.full_name || null,
      title: stored?.title || m.title || null,
      email: stored?.email || u.email || null,
    };
    return { userId: u.id, role: m.role, accountName: u.full_name, accountEmail: u.email, stored, person, updatedAt: s?.updated_at ?? null };
  }).sort((a, b) => (a.person.display_name ?? a.accountEmail).localeCompare(b.person.display_name ?? b.accountEmail));
}

/**
 * The signature for a message EventureOS is about to send as `userId` in `threadId`.
 * Returns null when the organisation hasn't published a signature yet.
 * Smart mode: full on EventureOS's first signed message in the thread, compact on later ones.
 */
export async function signatureForSend(db: SupabaseClient, orgId: string, userId: string, threadId: string | null) {
  const setup = await loadSignatureSetup(db, orgId);
  if (!setup.published) return null;
  const [me] = await loadTeamPeople(db, orgId, userId);
  if (!me) return null;
  let signedBefore = false;
  if (threadId) {
    const { count } = await db.from("email_messages").select("id", { count: "exact", head: true })
      .eq("thread_id", threadId).eq("direction", "outbound").not("signature_version", "is", null);
    signedBefore = (count ?? 0) > 0;
  }
  const variant: Variant = variantFor(setup.published.design.reply.mode, signedBefore);
  const r = renderSignature(setup.published.design, me.person, variant);
  return { ...r, variant, version: setup.published.version };
}
