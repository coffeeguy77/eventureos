import type { NextAction } from "@/lib/next-action";
import type { QuoteStatus } from "@/lib/types";
import { daysBetween, fmtDate } from "@/lib/format";

/** The single most useful next step for a quote. */
export function quoteNextAction(q: {
  status: QuoteStatus;
  has_unpublished_changes: boolean;
  current_version_id: string | null;
  expiry_date: string | null;
  itemCount?: number;
}, lastSentAt: string | null, today: string, followUpDays = 3): NextAction {
  const expired = q.expiry_date != null && q.expiry_date < today;
  switch (q.status) {
    case "accepted":
      return { label: "Accepted — quote is locked", detail: "Duplicate it if anything needs to change.", urgency: "done" };
    case "declined":
      return { label: "Declined — revise and resend, or close the event", urgency: "normal" };
    case "expired":
      return { label: "Expired — set a new expiry date and resend", urgency: "soon" };
    case "draft":
      if (q.itemCount === 0) return { label: "Add line items", detail: "Start with Quick add or a new item.", urgency: "normal" };
      return { label: "Finish and send the quote", detail: "The customer can't see drafts.", urgency: "normal" };
  }
  // sent / viewed
  if (q.has_unpublished_changes) return { label: "Publish your changes", detail: "The customer still sees the previous version.", urgency: "soon" };
  if (expired) return { label: "Expired — set a new expiry date and resend", urgency: "soon" };
  const days = lastSentAt ? daysBetween(lastSentAt.slice(0, 10), today) : 0;
  if (q.status === "viewed") return { label: "Follow up — the customer has viewed it", detail: days ? `Sent ${days} day${days === 1 ? "" : "s"} ago` : undefined, urgency: days >= followUpDays ? "soon" : "normal" };
  if (days >= followUpDays) return { label: "Follow up — no reply yet", detail: `Sent ${days} days ago`, urgency: "soon" };
  return { label: "Awaiting the customer", detail: q.expiry_date ? `Valid until ${fmtDate(q.expiry_date)}` : undefined, urgency: "normal" };
}
