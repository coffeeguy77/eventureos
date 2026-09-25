import type { EmailClassification, EnquirySource, EnquiryStatus, EventStatus, InvoiceStatus, QuoteStatus } from "@/lib/types";

export type Tone = "neutral" | "brand" | "blue" | "green" | "amber" | "red" | "slate";

export const ENQUIRY_STATUS: Record<EnquiryStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "brand" },
  needs_review: { label: "Needs review", tone: "amber" },
  contacted: { label: "Contacted", tone: "blue" },
  qualified: { label: "Qualified", tone: "blue" },
  quote_required: { label: "Quote required", tone: "amber" },
  quote_sent: { label: "Quote sent", tone: "brand" },
  negotiating: { label: "Negotiating", tone: "amber" },
  won: { label: "Won", tone: "green" },
  lost: { label: "Lost", tone: "slate" },
  archived: { label: "Archived", tone: "slate" },
};
export const ENQUIRY_STATUS_ORDER = Object.keys(ENQUIRY_STATUS) as EnquiryStatus[];
export const OPEN_ENQUIRY_STATUSES: EnquiryStatus[] = [
  "new", "needs_review", "contacted", "qualified", "quote_required", "quote_sent", "negotiating",
];

export const ENQUIRY_SOURCE: Record<EnquirySource, string> = {
  website: "Website", email: "Email", phone: "Phone", referral: "Referral",
  instagram: "Instagram", facebook: "Facebook", manual: "Manual", other: "Other",
};

export const EVENT_STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  enquiry: { label: "Enquiry", tone: "neutral" },
  planning: { label: "Planning", tone: "blue" },
  quoted: { label: "Quoted", tone: "brand" },
  awaiting_approval: { label: "Awaiting approval", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "green" },
  completed: { label: "Completed", tone: "slate" },
  cancelled: { label: "Cancelled", tone: "red" },
};
export const EVENT_STATUS_ORDER = Object.keys(EVENT_STATUS) as EventStatus[];

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "blue" },
  viewed: { label: "Viewed", tone: "brand" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  expired: { label: "Expired", tone: "slate" },
  superseded: { label: "Superseded", tone: "slate" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  awaiting_payment: { label: "Awaiting payment", tone: "blue" },
  part_paid: { label: "Part paid", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  overdue: { label: "Overdue", tone: "red" },
  void: { label: "Void", tone: "slate" },
};

export const CLASSIFICATION: Record<EmailClassification, { label: string; tone: Tone }> = {
  event_enquiry: { label: "Event enquiry", tone: "brand" },
  existing_event: { label: "Existing event", tone: "green" },
  quote_discussion: { label: "Quote discussion", tone: "blue" },
  general_email: { label: "General", tone: "neutral" },
  supplier: { label: "Supplier", tone: "slate" },
  spam: { label: "Spam", tone: "slate" },
  needs_review: { label: "Needs review", tone: "amber" },
};

export const EVENT_TYPES = [
  "Wedding", "Corporate", "Birthday", "Engagement", "Conference", "Community", "Market",
  "Private party", "Film shoot", "Festival", "Other",
];
