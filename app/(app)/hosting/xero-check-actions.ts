"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import type { XeroCheck } from "@/lib/hosting/xero-check";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function office() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can run the Xero check.");
  return ctx;
}

/** The other business on the same Xero file (the one this connection is shared from, or shared with), if the user manages it. */
async function otherOrg(orgId: string, userClient: Awaited<ReturnType<typeof requireOrg>>["supabase"]): Promise<{ id: string; name: string } | null> {
  const db = createServiceClient();
  const { data: mine } = await db.from("integrations").select("settings").eq("organisation_id", orgId).eq("provider", "xero").maybeSingle();
  const s = (mine?.settings ?? {}) as { shared_from?: string; shared_with?: string[] };
  let id: string | null = null;
  if (s.shared_from) { const { data } = await db.from("integrations").select("organisation_id").eq("id", s.shared_from).maybeSingle(); id = (data?.organisation_id as string) ?? null; }
  else if (s.shared_with?.length) id = s.shared_with[0];
  if (!id) return null;
  const { data: ok } = await userClient.rpc("is_org_manager", { org: id });
  if (!ok) return null;
  const { data: o } = await db.from("organisations").select("id, name").eq("id", id).single();
  return o ? { id: o.id as string, name: o.name as string } : null;
}

export async function runXeroCheckAction(): Promise<R<XeroCheck & { here: string; other: { id: string; name: string } | null }>> {
  try {
    const { supabase, org, user } = await office();
    const other = await otherOrg(org.id, supabase);
    const db = createServiceClient();
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const { runXeroCheck } = await import("@/lib/hosting/xero-check");
    const r = await runXeroCheck(await buildContext(db, "service", org.id, "xero", user.id), db, other?.id ?? null);
    return { ok: true, data: { ...r, here: org.name, other } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Add Xero customers to this business or the other one (linked by email or created; close matches go to review). */
export async function addXeroCustomers(contactIds: string[], to: "here" | "other"): Promise<R<string>> {
  try {
    const { supabase, org, user } = await office();
    const ids = [...new Set(contactIds.filter((x) => ID.test(x)))].slice(0, 500);
    if (!ids.length) return { ok: false, error: "Choose the customers to add." };
    const target = to === "here" ? { id: org.id, name: org.name } : await otherOrg(org.id, supabase);
    if (!target) return { ok: false, error: "You don't manage the other business, or it isn't on this Xero file." };
    const db = createServiceClient();
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const { addXeroContacts } = await import("@/lib/integrations/xero-sync");
    const r = await addXeroContacts(await buildContext(db, "service", target.id, "xero", user.id), ids);
    revalidatePath("/clients");
    const parts = [`${r.created} new client${r.created === 1 ? "" : "s"} in ${target.name}`];
    if (r.linkedByEmail) parts.push(`${r.linkedByEmail} linked to an existing client with the same email`);
    if (r.review) parts.push(`${r.review} look like an existing client — check them in Clients → Match review`);
    return { ok: true, data: parts.join(" · ") + "." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Bring chosen Xero repeating invoices into this business (adding their client first), even if they're coded outside its accounts. */
export async function importChosenRepeating(items: { id: string; contactId: string }[]): Promise<R<string>> {
  try {
    const { org, user } = await office();
    const list = items.filter((x) => ID.test(x.id) && ID.test(x.contactId)).slice(0, 300);
    if (!list.length) return { ok: false, error: "Choose the repeating invoices to bring in." };
    const db = createServiceClient();
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const ctx = await buildContext(db, "service", org.id, "xero", user.id);
    const { addXeroContacts } = await import("@/lib/integrations/xero-sync");
    const c = await addXeroContacts(ctx, list.map((x) => x.contactId));
    const { importRepeatingFromXero } = await import("@/lib/recurring/server");
    const r = await importRepeatingFromXero(ctx, { ids: list.map((x) => x.id), ignoreScope: true });
    revalidatePath("/hosting/recurring");
    const parts = [`${r.imported} repeating invoice${r.imported === 1 ? "" : "s"} brought in (paused — Xero still raises them until you switch them over)`];
    if (c.created) parts.push(`${c.created} new client${c.created === 1 ? "" : "s"} added`);
    if (r.unmatched.length) parts.push(`${r.unmatched.length} waiting on client match review: ${r.unmatched.slice(0, 6).join(", ")}${r.unmatched.length > 6 ? "…" : ""}`);
    return { ok: true, data: parts.join(" · ") + "." };
  } catch (e) { return { ok: false, error: err(e) }; }
}
