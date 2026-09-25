import type { EnquiryStatus, EventStatus, InvoiceStatus, QuoteStatus } from "@/lib/types";

export interface NextAction {
  label: string;
  detail?: string;
  due?: string | null;
  urgency: "overdue" | "soon" | "normal" | "done";
}

function urgencyFor(due: string | null | undefined, now = Date.now()): NextAction["urgency"] {
  if (!due) return "normal";
  const t = Date.parse(due);
  if (t < now) return "overdue";
  if (t - now < 24 * 3600 * 1000) return "soon";
  return "normal";
}

/** The single most useful next step for an enquiry. */
export function enquiryNextAction(e: {
  status: EnquiryStatus;
  next_action: string | null;
  next_action_due: string | null;
  event_id: string | null;
  customer_id: string | null;
}): NextAction {
  if (e.next_action && !["won", "lost", "archived"].includes(e.status)) {
    return { label: e.next_action, due: e.next_action_due, urgency: urgencyFor(e.next_action_due) };
  }
  switch (e.status) {
    case "new":
      return { label: "Reply to the enquiry", detail: "First response time wins bookings.", urgency: "soon" };
    case "needs_review":
      return { label: "Review and classify", detail: "Confirm whether this is a new event, an existing event or general email.", urgency: "soon" };
    case "contacted":
      return { label: "Qualify requirements", detail: "Confirm date, guest numbers, venue and budget.", urgency: "normal" };
    case "qualified":
    case "quote_required":
      return { label: "Convert to event and prepare a quote", urgency: "normal" };
    case "quote_sent":
    case "negotiating":
      return { label: "Follow up the quote", urgency: urgencyFor(e.next_action_due) };
    case "won":
      return { label: e.event_id ? "Manage the event" : "Convert to event", urgency: "done" };
    default:
      return { label: "No action needed", urgency: "done" };
  }
}

/** The single most useful next step for an event. */
export function eventNextAction(ev: {
  status: EventStatus;
  next_action: string | null;
  next_action_due: string | null;
  quote?: { status: QuoteStatus; has_unpublished_changes: boolean } | null;
  invoices?: { status: InvoiceStatus; balance: number }[];
  daysUntil?: number | null;
}): NextAction {
  if (ev.status === "cancelled") return { label: "Event cancelled", urgency: "done" };
  if (ev.next_action) return { label: ev.next_action, due: ev.next_action_due, urgency: urgencyFor(ev.next_action_due) };

  const overdue = ev.invoices?.find((i) => i.status === "overdue");
  if (overdue) return { label: "Chase overdue invoice", urgency: "overdue" };

  if (!ev.quote) return { label: "Create a quote", urgency: "normal" };
  if (ev.quote.status === "draft") return { label: "Finish and send the quote", urgency: "normal" };
  if (ev.quote.status === "sent") return { label: "Follow up — quote not yet viewed", urgency: "normal" };
  if (ev.quote.status === "viewed") return { label: "Follow up — customer has viewed the quote", urgency: "soon" };
  if (ev.quote.status === "declined") return { label: "Quote declined — revise or close", urgency: "normal" };

  const outstanding = ev.invoices?.reduce((s, i) => s + (i.status === "void" ? 0 : Number(i.balance)), 0) ?? 0;
  if (ev.status === "completed") {
    return outstanding > 0 ? { label: "Collect final payment", urgency: "soon" } : { label: "All done — paid in full", urgency: "done" };
  }
  if (ev.daysUntil != null && ev.daysUntil >= 0 && ev.daysUntil <= 2) return { label: "Prepare for event day", urgency: "soon" };
  if (outstanding > 0) return { label: "Awaiting payment", urgency: "normal" };
  return { label: "Confirm final details", urgency: "normal" };
}
