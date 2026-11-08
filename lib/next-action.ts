import type { EnquiryStatus, EventStatus, InvoiceStatus, QuoteStatus } from "@/lib/types";

export interface NextAction {
  label: string;
  detail?: string;
  due?: string | null;
  urgency: "overdue" | "soon" | "normal" | "done";
  /** What kind of step it is, so a page can offer the button that does it. */
  kind?: EventStep;
  /** The button for it (filled in by the page, which knows the links). */
  cta?: { label: string; href: string };
}

export type EventStep = "custom" | "chase_invoice" | "create_quote" | "finish_quote" | "follow_up" | "revise_quote" | "collect_payment" | "prepare" | "awaiting_payment" | "confirm";

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
  if (ev.next_action) return { label: ev.next_action, due: ev.next_action_due, urgency: urgencyFor(ev.next_action_due), kind: "custom" };

  const overdue = ev.invoices?.find((i) => i.status === "overdue");
  if (overdue) return { label: "Chase overdue invoice", urgency: "overdue", kind: "chase_invoice" };

  if (!ev.quote) return { label: "Create a quote", urgency: "normal", kind: "create_quote" };
  if (ev.quote.status === "draft") return { label: "Finish and send the quote", urgency: "normal", kind: "finish_quote" };
  if (ev.quote.status === "sent") return { label: "Follow up — quote not yet viewed", urgency: "normal", kind: "follow_up" };
  if (ev.quote.status === "viewed") return { label: "Follow up — customer has viewed the quote", urgency: "soon", kind: "follow_up" };
  if (ev.quote.status === "declined") return { label: "Quote declined — revise or close", urgency: "normal", kind: "revise_quote" };

  const outstanding = ev.invoices?.reduce((s, i) => s + (i.status === "void" ? 0 : Number(i.balance)), 0) ?? 0;
  if (ev.status === "completed") {
    return outstanding > 0 ? { label: "Collect final payment", urgency: "soon", kind: "collect_payment" } : { label: "All done — paid in full", urgency: "done" };
  }
  if (ev.daysUntil != null && ev.daysUntil >= 0 && ev.daysUntil <= 2) return { label: "Prepare for event day", urgency: "soon", kind: "prepare" };
  if (outstanding > 0) return { label: "Awaiting payment", urgency: "normal", kind: "awaiting_payment" };
  return { label: "Confirm final details", urgency: "normal", kind: "confirm" };
}

/** The button for an event's next step. */
export function eventStepButton(kind: EventStep | undefined, ids: { eventId: string; quoteId: string | null; overdueInvoiceId: string | null }): NextAction["cta"] {
  const ev = `/events/${ids.eventId}`;
  switch (kind) {
    case "create_quote": return { label: "New quote", href: `/quotes/new?event=${ids.eventId}` };
    case "finish_quote": return ids.quoteId ? { label: "Open quote", href: `/quotes/${ids.quoteId}` } : undefined;
    case "revise_quote": return ids.quoteId ? { label: "Revise quote", href: `/quotes/${ids.quoteId}` } : undefined;
    case "follow_up": return { label: "Email the client", href: `${ev}?tab=communication` };
    case "chase_invoice": return ids.overdueInvoiceId ? { label: "Open invoice", href: `/invoices/${ids.overdueInvoiceId}` } : { label: "Invoices", href: `${ev}?tab=invoice` };
    case "collect_payment": case "awaiting_payment": return { label: "View invoices", href: `${ev}?tab=invoice` };
    case "prepare": return { label: "Run sheet", href: `${ev}?tab=schedule` };
    case "confirm": return { label: "Message the client", href: `${ev}?tab=communication` };
    default: return undefined;
  }
}
