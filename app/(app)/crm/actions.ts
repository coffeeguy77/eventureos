"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { setEventStatus } from "@/app/(app)/events/actions";
import { ENQUIRY_STATUS } from "@/lib/status";
import type { EnquiryStatus, EventStatus } from "@/lib/types";
import { PIPELINE_ENQUIRY_STAGES, PIPELINE_EVENT_STAGES } from "./stages";

export type MoveResult = { error?: string } | undefined;

/** Move an enquiry to another pipeline stage (drag and drop on the CRM board). */
export async function moveEnquiry(id: string, status: EnquiryStatus): Promise<MoveResult> {
  if (!(PIPELINE_ENQUIRY_STAGES as readonly string[]).includes(status)) return { error: "That isn’t a pipeline stage." };
  const { supabase, org, user, profile } = await requireOrg();
  const { data: before, error: e1 } = await supabase.from("enquiries").select("status, number, customer_id, event_id")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (e1 || !before) return { error: "That enquiry no longer exists." };
  if (before.status === status) return undefined;
  const { error } = await supabase.from("enquiries").update({ status }).eq("id", id).eq("organisation_id", org.id);
  if (error) return { error: `Couldn't move ENQ-${before.number}: ${error.message}` };
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "enquiry.status_changed", entityType: "enquiry", entityId: id,
    enquiryId: id, customerId: before.customer_id, eventId: before.event_id,
    summary: `${actorName(profile)} moved ENQ-${before.number} to ${ENQUIRY_STATUS[status].label} on the pipeline`,
    changes: { status: [ENQUIRY_STATUS[before.status as EnquiryStatus].label, ENQUIRY_STATUS[status].label] },
    metadata: { via: "pipeline_board" },
  });
  revalidatePath("/crm");
  revalidatePath(`/enquiries/${id}`);
  revalidatePath("/enquiries");
  revalidatePath("/dashboard");
  if (before.customer_id) revalidatePath(`/clients/${before.customer_id}`);
  return undefined;
}

/** Move an event to another status (events view of the board). Reuses the event status action and its audit entry. */
export async function moveEvent(id: string, status: EventStatus): Promise<MoveResult> {
  if (!(PIPELINE_EVENT_STAGES as readonly string[]).includes(status)) return { error: "That isn’t a board column." };
  try {
    await setEventStatus(id, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't move the event." };
  }
  revalidatePath("/crm");
  return undefined;
}
