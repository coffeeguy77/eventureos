import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActivityInput {
  orgId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  eventId?: string | null;
  enquiryId?: string | null;
  customerId?: string | null;
  changes?: Record<string, [unknown, unknown]> | null;
  metadata?: Record<string, unknown> | null;
}

/** Append to the audit trail. Throws if it fails — an unlogged change is a bug. */
export async function logActivity(supabase: SupabaseClient, a: ActivityInput) {
  const { error } = await supabase.from("activity_logs").insert({
    organisation_id: a.orgId,
    actor_id: a.actorId,
    actor_type: "user",
    action: a.action,
    entity_type: a.entityType,
    entity_id: a.entityId ?? null,
    event_id: a.eventId ?? null,
    enquiry_id: a.enquiryId ?? null,
    customer_id: a.customerId ?? null,
    summary: a.summary,
    changes: a.changes ?? null,
    metadata: a.metadata ?? null,
  });
  if (error) throw new Error(`Audit log write failed: ${error.message}`);
}

export function actorName(profile: { full_name: string | null; email: string }) {
  return profile.full_name ?? profile.email;
}
