"use server";

import { revalidatePath } from "next/cache";
import { canManage, getMembers, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import type { OrgRole } from "@/lib/types";
import {
  QUOTE_ACCEPTANCE_ACTIONS, ROLE_LABEL, STANDARD_RULES, TRIGGER_ORDER,
  type QuoteAcceptanceAction, type TriggerType,
} from "./constants";
import type { ActionState } from "./forms";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isOwnerOrAdmin(role: OrgRole) {
  return role === "owner" || role === "admin";
}

async function ownerOrAdmin() {
  const ctx = await requireOrg();
  if (!isOwnerOrAdmin(ctx.role)) throw new Error("Only owners and admins can change this.");
  return ctx;
}

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can change this.");
  return ctx;
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function validCurrency(c: string) {
  if (!/^[A-Z]{3}$/.test(c)) return false;
  try {
    new Intl.NumberFormat("en-AU", { style: "currency", currency: c });
    return true;
  } catch {
    return false;
  }
}

function normaliseWebsite(v: string | null) {
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return undefined;
    return u.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(after)) {
    if ((before[k] ?? null) !== (after[k] ?? null)) changes[k] = [before[k] ?? null, after[k] ?? null];
  }
  return changes;
}

const FIELD_LABEL: Record<string, string> = {
  name: "name", business_type: "business type", contact_email: "contact email", contact_phone: "phone",
  address: "address", website: "website", timezone: "timezone", currency: "currency",
};

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------
export async function updateOrganisation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, org, role, user, profile } = await requireOrg();
  if (!isOwnerOrAdmin(role)) return { error: "Only owners and admins can change organisation details." };

  const name = str(form.get("name"));
  const contactEmail = str(form.get("contact_email"));
  const website = normaliseWebsite(str(form.get("website")));
  const timezone = str(form.get("timezone")) ?? "";
  const currency = (str(form.get("currency")) ?? "").toUpperCase();

  if (!name) return { error: "Your business needs a name." };
  if (name.length > 120) return { error: "Keep the business name under 120 characters." };
  if (contactEmail && !EMAIL_RE.test(contactEmail)) return { error: "That contact email doesn't look right." };
  if (website === undefined) return { error: "That website address doesn't look right — try something like www.example.com.au." };
  if (!validTimezone(timezone)) return { error: `"${timezone}" isn't a recognised timezone. Use a name like Australia/Sydney.` };
  if (!validCurrency(currency)) return { error: "Choose a valid 3-letter currency code, like AUD." };

  const next = {
    name,
    business_type: str(form.get("business_type")),
    contact_email: contactEmail,
    contact_phone: str(form.get("contact_phone")),
    address: str(form.get("address")),
    website,
    timezone,
    currency,
  };

  const { data: before, error: e1 } = await supabase
    .from("organisations")
    .select("name, business_type, contact_email, contact_phone, address, website, timezone, currency")
    .eq("id", org.id)
    .single();
  if (e1) return { error: `Couldn't load your organisation: ${e1.message}` };

  const changes = diff(before, next);
  if (!Object.keys(changes).length) return { ok: "No changes to save." };

  const { error } = await supabase.from("organisations").update(next).eq("id", org.id);
  if (error) return { error: `Couldn't save organisation details: ${error.message}` };

  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "organisation.updated", entityType: "organisation", entityId: org.id,
    summary: `${actorName(profile)} updated organisation ${Object.keys(changes).map((k) => FIELD_LABEL[k] ?? k).join(", ")}`,
    changes,
  });
  revalidatePath("/", "layout");
  return { ok: "Organisation details saved." };
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------
/** Called after the browser has uploaded the file to the public `branding` bucket. */
export async function saveLogo(path: string) {
  const { supabase, org, user, profile } = await ownerOrAdmin();
  if (!path.startsWith(`${org.id}/`) || path.includes("..") || !/\.(png|jpe?g|webp|gif)$/i.test(path)) {
    throw new Error("That upload location isn't valid for your organisation.");
  }
  const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
  const { data: before } = await supabase.from("organisations").select("logo_url").eq("id", org.id).single();
  const { error } = await supabase.from("organisations").update({ logo_url: pub.publicUrl }).eq("id", org.id);
  if (error) throw new Error(`Couldn't save the logo: ${error.message}`);
  await removeOldLogo(supabase, org.id, before?.logo_url ?? null);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "organisation.logo_updated", entityType: "organisation", entityId: org.id,
    summary: `${actorName(profile)} uploaded a new logo`,
    changes: { logo_url: [before?.logo_url ?? null, pub.publicUrl] },
  });
  revalidatePath("/", "layout");
}

export async function removeLogo() {
  const { supabase, org, user, profile } = await ownerOrAdmin();
  const { data: before } = await supabase.from("organisations").select("logo_url").eq("id", org.id).single();
  if (!before?.logo_url) return;
  const { error } = await supabase.from("organisations").update({ logo_url: null }).eq("id", org.id);
  if (error) throw new Error(`Couldn't remove the logo: ${error.message}`);
  await removeOldLogo(supabase, org.id, before.logo_url);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "organisation.logo_removed", entityType: "organisation", entityId: org.id,
    summary: `${actorName(profile)} removed the logo`, changes: { logo_url: [before.logo_url, null] },
  });
  revalidatePath("/", "layout");
}

async function removeOldLogo(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, url: string | null) {
  const marker = "/storage/v1/object/public/branding/";
  if (!url || !url.includes(marker)) return;
  const path = decodeURIComponent(url.split(marker)[1] ?? "");
  if (!path.startsWith(`${orgId}/`)) return;
  // Best effort: an orphaned old logo file is harmless
  await supabase.storage.from("branding").remove([path]);
}

export async function saveBrandColour(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, org, role, user, profile } = await requireOrg();
  if (!isOwnerOrAdmin(role)) return { error: "Only owners and admins can change branding." };
  const colour = (str(form.get("brand_colour")) ?? "").toUpperCase();
  if (!HEX_RE.test(colour)) return { error: "Use a hex colour like #6D4AFF." };
  const { data: before } = await supabase.from("organisations").select("brand_colour").eq("id", org.id).single();
  if ((before?.brand_colour ?? "").toUpperCase() === colour) return { ok: "No changes to save." };
  const { error } = await supabase.from("organisations").update({ brand_colour: colour }).eq("id", org.id);
  if (error) return { error: `Couldn't save the brand colour: ${error.message}` };
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "organisation.branding_updated", entityType: "organisation", entityId: org.id,
    summary: `${actorName(profile)} changed the brand colour ${before?.brand_colour ?? "—"} → ${colour}`,
    changes: { brand_colour: [before?.brand_colour ?? null, colour] },
  });
  revalidatePath("/", "layout");
  return { ok: "Brand colour saved." };
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------
type MemberRow = { id: string; user_id: string; role: OrgRole; title: string | null; expires_at: string | null; status: string };

async function loadMember(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, memberId: string) {
  const { data, error } = await supabase
    .from("organisation_users")
    .select("id, user_id, role, title, expires_at, status, user:users!organisation_users_user_id_fkey(full_name, email)")
    .eq("id", memberId)
    .eq("organisation_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load that team member: ${error.message}`);
  if (!data) throw new Error("That team member no longer exists.");
  const row = data as unknown as MemberRow & { user: { full_name: string | null; email: string } | null };
  return { ...row, name: row.user?.full_name ?? row.user?.email ?? "Team member" };
}

export async function changeMemberRole(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, org, role, user, profile } = await requireOrg();
    if (!isOwnerOrAdmin(role)) return { error: "Only owners and admins can change roles." };
    const memberId = str(form.get("member_id"));
    const next = str(form.get("role")) as OrgRole | null;
    if (!memberId || !next || !(next in ROLE_LABEL)) return { error: "Choose a role." };

    const m = await loadMember(supabase, org.id, memberId);
    if (m.role === next) return { ok: "No change." };
    if (m.expires_at) return { error: "Temporary support access can't be changed here." };
    if (m.role === "customer") return { error: "Customers use the portal and can't be given a staff role here — invite them instead." };
    if (m.user_id === user.id && m.role === "owner") return { error: "You can't change your own owner role — ask another owner to do it." };
    if ((m.role === "owner" || next === "owner") && role !== "owner") return { error: "Only an owner can grant or remove owner access." };
    if (m.role === "owner") {
      const { count } = await supabase
        .from("organisation_users").select("id", { count: "exact", head: true })
        .eq("organisation_id", org.id).eq("role", "owner").eq("status", "active").is("expires_at", null).neq("id", m.id);
      if (!count) return { error: "An organisation must keep at least one owner." };
    }

    const { error } = await supabase.from("organisation_users").update({ role: next }).eq("id", m.id).eq("organisation_id", org.id);
    if (error) return { error: `Couldn't change the role: ${error.message}` };
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "team.role_changed", entityType: "user", entityId: m.user_id,
      summary: `${actorName(profile)} changed ${m.name}'s role ${ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ?? m.role} → ${ROLE_LABEL[next as keyof typeof ROLE_LABEL]}`,
      changes: { role: [m.role, next] },
    });
    revalidatePath("/settings/team");
    return { ok: "Role updated." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't change the role." };
  }
}

export async function removeMember(memberId: string) {
  const { supabase, org, user, profile } = await ownerOrAdmin();
  const m = await loadMember(supabase, org.id, memberId);
  if (m.user_id === user.id) throw new Error("You can't remove yourself — ask another owner or admin.");
  if (m.role === "owner") throw new Error("Owners can't be removed. Change their role first (owners only).");
  if (m.expires_at) throw new Error("Temporary support access ends on its own or when EventureOS Support ends the session.");
  const { error, count } = await supabase
    .from("organisation_users").delete({ count: "exact" }).eq("id", m.id).eq("organisation_id", org.id);
  if (error) throw new Error(`Couldn't remove ${m.name}: ${error.message}`);
  if (!count) throw new Error(`Couldn't remove ${m.name} — you may not have permission.`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "team.removed", entityType: "user", entityId: m.user_id,
    summary: `${actorName(profile)} removed ${m.name} (${m.role}) from the team`,
  });
  revalidatePath("/settings/team");
}

export async function inviteMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, org, role, user, profile } = await requireOrg();
  if (!isOwnerOrAdmin(role)) return { error: "Only owners and admins can invite people." };
  const email = (str(form.get("email")) ?? "").toLowerCase();
  const inviteRole = str(form.get("role"));
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!inviteRole || !["admin", "manager", "staff"].includes(inviteRole)) return { error: "Choose Admin, Manager or Staff." };

  const members = await getMembers(org.id);
  if (members.some((m) => m.email.toLowerCase() === email)) return { error: `${email} is already on the team.` };

  const { data, error } = await supabase
    .from("organisation_invitations")
    .insert({ organisation_id: org.id, email, role: inviteRole, invited_by: user.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: `${email} already has a pending invitation. Revoke it first to change the role.` };
    return { error: `Couldn't create the invitation: ${error.message}` };
  }
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "team.invited", entityType: "invitation", entityId: data.id,
    summary: `${actorName(profile)} invited ${email} as ${ROLE_LABEL[inviteRole as keyof typeof ROLE_LABEL]}`,
  });
  revalidatePath("/settings/team");
  return { ok: `Invitation saved. ${email} gets access as soon as they sign up or sign in with that email.` };
}

export async function revokeInvitation(id: string) {
  const { supabase, org, user, profile } = await ownerOrAdmin();
  const { data: inv } = await supabase
    .from("organisation_invitations").select("email, role, accepted_at").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!inv) throw new Error("That invitation no longer exists.");
  if (inv.accepted_at) throw new Error("That invitation has already been accepted — remove the member instead.");
  const { error } = await supabase.from("organisation_invitations").delete().eq("id", id).eq("organisation_id", org.id);
  if (error) throw new Error(`Couldn't revoke the invitation: ${error.message}`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "team.invitation_revoked", entityType: "invitation", entityId: id,
    summary: `${actorName(profile)} revoked the invitation for ${inv.email}`,
  });
  revalidatePath("/settings/team");
}

// ---------------------------------------------------------------------------
// Calendars & resources
// ---------------------------------------------------------------------------
export async function addCalendar(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, org, role, user, profile } = await requireOrg();
  if (!canManage(role)) return { error: "Only owners, admins and managers can add calendars." };
  const name = str(form.get("name"));
  const colour = (str(form.get("colour")) ?? "#6D4AFF").toUpperCase();
  if (!name) return { error: "Give the calendar a name, e.g. \"Cart 2\"." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  if (!HEX_RE.test(colour)) return { error: "Choose a colour." };
  const { count } = await supabase.from("calendar_connections").select("id", { count: "exact", head: true }).eq("organisation_id", org.id);
  const { data, error } = await supabase
    .from("calendar_connections")
    .insert({ organisation_id: org.id, name, colour, provider: "local", is_default: !count, created_by: user.id })
    .select("id")
    .single();
  if (error) return { error: `Couldn't add the calendar: ${error.message}` };
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "calendar.resource_created", entityType: "calendar_connection", entityId: data.id,
    summary: `${actorName(profile)} added calendar "${name}"`,
  });
  revalidatePath("/settings/calendars");
  revalidatePath("/calendar");
  return { ok: `Added "${name}".` };
}

export async function updateCalendar(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, org, role, user, profile } = await requireOrg();
  if (!canManage(role)) return { error: "Only owners, admins and managers can edit calendars." };
  const id = str(form.get("id"));
  const name = str(form.get("name"));
  const colour = (str(form.get("colour")) ?? "").toUpperCase();
  if (!id) return { error: "Calendar not found." };
  if (!name) return { error: "The calendar needs a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  if (!HEX_RE.test(colour)) return { error: "Choose a colour." };
  const { data: before } = await supabase.from("calendar_connections").select("name, colour").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!before) return { error: "Calendar not found." };
  const changes = diff(before, { name, colour });
  if (!Object.keys(changes).length) return { ok: "No changes." };
  const { error } = await supabase.from("calendar_connections").update({ name, colour }).eq("id", id).eq("organisation_id", org.id);
  if (error) return { error: `Couldn't save the calendar: ${error.message}` };
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "calendar.resource_updated", entityType: "calendar_connection", entityId: id,
    summary: changes.name
      ? `${actorName(profile)} renamed calendar "${before.name}" → "${name}"`
      : `${actorName(profile)} changed the colour of calendar "${name}"`,
    changes,
  });
  revalidatePath("/settings/calendars");
  revalidatePath("/calendar");
  return { ok: "Saved." };
}

export async function setDefaultCalendar(id: string) {
  const { supabase, org, user, profile } = await manager();
  const { data: cal } = await supabase.from("calendar_connections").select("name, is_default").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!cal) throw new Error("Calendar not found.");
  if (cal.is_default) return;
  const { error: e1 } = await supabase.from("calendar_connections").update({ is_default: false }).eq("organisation_id", org.id).neq("id", id);
  if (e1) throw new Error(`Couldn't change the default calendar: ${e1.message}`);
  const { error } = await supabase.from("calendar_connections").update({ is_default: true }).eq("id", id).eq("organisation_id", org.id);
  if (error) throw new Error(`Couldn't change the default calendar: ${error.message}`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "calendar.default_changed", entityType: "calendar_connection", entityId: id,
    summary: `${actorName(profile)} made "${cal.name}" the default calendar`,
  });
  revalidatePath("/settings/calendars");
  revalidatePath("/calendar");
}

export async function setCalendarSync(id: string, enabled: boolean) {
  const { supabase, org, user, profile } = await manager();
  const { data: cal } = await supabase.from("calendar_connections").select("name, sync_enabled").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!cal) throw new Error("Calendar not found.");
  if (cal.sync_enabled === enabled) return;
  const { error } = await supabase.from("calendar_connections").update({ sync_enabled: enabled }).eq("id", id).eq("organisation_id", org.id);
  if (error) throw new Error(`Couldn't change Google sync: ${error.message}`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "calendar.sync_changed", entityType: "calendar_connection", entityId: id,
    summary: `${actorName(profile)} turned Google Calendar sync ${enabled ? "on" : "off"} for "${cal.name}"`,
    changes: { sync_enabled: [cal.sync_enabled, enabled] },
  });
  revalidatePath("/settings/calendars");
}

export async function deleteCalendar(id: string) {
  const { supabase, org, user, profile } = await manager();
  const { data: cal } = await supabase.from("calendar_connections").select("name, is_default").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!cal) throw new Error("Calendar not found.");
  if (cal.is_default) throw new Error("This is the default calendar. Make another calendar the default first.");
  const { count } = await supabase.from("calendar_events").select("id", { count: "exact", head: true }).eq("calendar_connection_id", id);
  if (count) throw new Error(`"${cal.name}" still has ${count} calendar ${count === 1 ? "entry" : "entries"}. Move or delete them first.`);
  const { error, count: deleted } = await supabase.from("calendar_connections").delete({ count: "exact" }).eq("id", id).eq("organisation_id", org.id);
  if (error) throw new Error(`Couldn't delete the calendar: ${error.message}`);
  if (!deleted) throw new Error("Couldn't delete the calendar — you may not have permission.");
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "calendar.resource_deleted", entityType: "calendar_connection", entityId: id,
    summary: `${actorName(profile)} deleted calendar "${cal.name}"`,
  });
  revalidatePath("/settings/calendars");
  revalidatePath("/calendar");
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------
export async function setRuleEnabled(id: string, enabled: boolean) {
  const { supabase, org, user, profile } = await manager();
  const { data: rule } = await supabase.from("automation_rules").select("name, enabled").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!rule) throw new Error("Automation rule not found.");
  if (rule.enabled === enabled) return;
  const { error, count } = await supabase.from("automation_rules").update({ enabled }, { count: "exact" }).eq("id", id).eq("organisation_id", org.id);
  if (error) throw new Error(`Couldn't change the rule: ${error.message}`);
  if (!count) throw new Error("Couldn't change the rule — you may not have permission.");
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "automation.rule_toggled", entityType: "automation_rule", entityId: id,
    summary: `${actorName(profile)} turned ${enabled ? "on" : "off"} automation "${rule.name}"`,
    changes: { enabled: [rule.enabled, enabled] },
  });
  revalidatePath("/settings/automations");
}

export async function addStandardRule(trigger: string) {
  const { supabase, org, user, profile } = await manager();
  if (!TRIGGER_ORDER.includes(trigger as TriggerType)) throw new Error("Unknown automation.");
  const std = STANDARD_RULES[trigger as TriggerType];
  const { count } = await supabase.from("automation_rules").select("id", { count: "exact", head: true })
    .eq("organisation_id", org.id).eq("trigger_type", trigger);
  if (count) throw new Error("You already have this automation.");

  let enabled = true;
  if (trigger === "invoice.paid") {
    const { data: xero } = await supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle();
    enabled = xero?.status === "connected";
  }
  const { data, error } = await supabase
    .from("automation_rules")
    .insert({ organisation_id: org.id, name: std.name, trigger_type: trigger, actions: std.actions, enabled, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(`Couldn't add the automation: ${error.message}`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "automation.rule_created", entityType: "automation_rule", entityId: data.id,
    summary: `${actorName(profile)} added automation "${std.name}"${enabled ? "" : " (off until Xero is connected)"}`,
  });
  revalidatePath("/settings/automations");
}

export async function saveAutomationSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, org, role, user, profile } = await requireOrg();
  if (!isOwnerOrAdmin(role)) return { error: "Only owners and admins can change invoicing settings." };
  const action = str(form.get("quote_acceptance_action")) as QuoteAcceptanceAction | null;
  const deposit = Number(str(form.get("deposit_percent")));
  const terms = Number(str(form.get("default_payment_terms_days")));
  const followUp = Number(str(form.get("quote_follow_up_days")));
  if (!action || !(action in QUOTE_ACCEPTANCE_ACTIONS)) return { error: "Choose what happens when a quote is accepted." };
  if (!Number.isFinite(deposit) || deposit < 1 || deposit > 100) return { error: "Deposit must be between 1% and 100%." };
  if (!Number.isInteger(terms) || terms < 0 || terms > 120) return { error: "Payment terms must be 0–120 days." };
  if (!Number.isInteger(followUp) || followUp < 1 || followUp > 60) return { error: "Follow-up must be 1–60 days." };

  const { data: cur, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
  if (e1) return { error: `Couldn't load settings: ${e1.message}` };
  const before = (cur.settings ?? {}) as Record<string, unknown>;
  const patch = {
    quote_acceptance_action: action,
    deposit_percent: Math.round(deposit * 100) / 100,
    default_payment_terms_days: terms,
    quote_follow_up_days: followUp,
  };
  const changes = diff(before, patch);
  if (!Object.keys(changes).length) return { ok: "No changes to save." };
  const { error } = await supabase.from("organisations").update({ settings: { ...before, ...patch } }).eq("id", org.id);
  if (error) return { error: `Couldn't save settings: ${error.message}` };

  const parts: string[] = [];
  if (changes.quote_acceptance_action) parts.push(`on acceptance: ${QUOTE_ACCEPTANCE_ACTIONS[action].label.toLowerCase()}`);
  if (changes.deposit_percent) parts.push(`deposit ${before.deposit_percent ?? "—"}% → ${patch.deposit_percent}%`);
  if (changes.default_payment_terms_days) parts.push(`payment terms ${before.default_payment_terms_days ?? "—"} → ${terms} days`);
  if (changes.quote_follow_up_days) parts.push(`quote follow-up ${before.quote_follow_up_days ?? "—"} → ${followUp} days`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "automation.settings_updated", entityType: "organisation", entityId: org.id,
    summary: `${actorName(profile)} changed automation settings (${parts.join("; ")})`, changes,
  });
  revalidatePath("/settings/automations");
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}

// ---------------------------------------------------------------------------
// Website enquiry form
// ---------------------------------------------------------------------------
export async function regenerateFormKey() {
  const { supabase, org } = await ownerOrAdmin();
  // The RPC checks owner/admin again and writes the audit log entry itself
  const { error } = await supabase.rpc("regenerate_public_form_key", { p_org: org.id });
  if (error) throw new Error(`Couldn't regenerate the key: ${error.message}`);
  revalidatePath("/settings/website-form");
}
