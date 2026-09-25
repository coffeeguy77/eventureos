export type OrgRole = "owner" | "admin" | "manager" | "staff" | "customer";

export type EnquiryStatus =
  | "new" | "needs_review" | "contacted" | "qualified" | "quote_required"
  | "quote_sent" | "negotiating" | "won" | "lost" | "archived";

export type EnquirySource =
  | "website" | "email" | "phone" | "referral" | "instagram" | "facebook" | "manual" | "other";

export type EventStatus =
  | "enquiry" | "planning" | "quoted" | "awaiting_approval" | "confirmed" | "completed" | "cancelled";

export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired" | "superseded";

export type InvoiceStatus = "draft" | "awaiting_payment" | "part_paid" | "paid" | "overdue" | "void";

export type EmailClassification =
  | "event_enquiry" | "existing_event" | "quote_discussion" | "general_email" | "supplier" | "spam" | "needs_review";

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  business_type: string | null;
  contact_email: string | null;
  brand_colour: string;
  logo_url: string | null;
  timezone: string;
  currency: string;
  plan: string;
  settings: Record<string, unknown>;
}

export interface Member {
  id: string;
  full_name: string | null;
  email: string;
}

export interface Customer {
  id: string;
  kind: "individual" | "company";
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  customer_since: string;
}

export interface Enquiry {
  id: string;
  number: number;
  title: string;
  customer_id: string | null;
  contact_id: string | null;
  event_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number | null;
  budget: number | null;
  venue: string | null;
  message: string | null;
  source: EnquirySource;
  status: EnquiryStatus;
  classification: EmailClassification | null;
  classification_confidence: number | null;
  assigned_to: string | null;
  received_at: string;
  last_contact_at: string | null;
  next_action: string | null;
  next_action_due: string | null;
  lost_reason: string | null;
}

export interface EventRecord {
  id: string;
  number: number;
  name: string;
  customer_id: string;
  primary_contact_id: string | null;
  enquiry_id: string | null;
  event_type: string | null;
  event_date: string | null;
  start_time: string | null;
  finish_time: string | null;
  venue: string | null;
  address: string | null;
  guest_count: number | null;
  budget: number | null;
  status: EventStatus;
  assigned_to: string | null;
  assigned_staff: string[];
  internal_notes: string | null;
  customer_notes: string | null;
  requirements: string | null;
  services: string[];
  equipment: string[];
  next_action: string | null;
  next_action_due: string | null;
  cancelled_reason: string | null;
}

export interface Quote {
  id: string;
  number: number;
  event_id: string;
  customer_id: string;
  title: string;
  status: QuoteStatus;
  issue_date: string;
  expiry_date: string | null;
  current_version_id: string | null;
  has_unpublished_changes: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  customer_id: string;
  event_id: string | null;
  kind: string;
  issue_date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  balance: number;
  status: InvoiceStatus;
  xero_invoice_id: string | null;
  xero_synced_at: string | null;
}

export interface Task {
  id: string;
  title: string;
  status: "open" | "in_progress" | "done";
  priority: "low" | "normal" | "high" | "urgent";
  due_at: string | null;
  assigned_to: string | null;
  event_id: string | null;
  enquiry_id: string | null;
  customer_id: string | null;
}

export interface ActivityLog {
  id: string;
  actor_id: string | null;
  actor_type: "user" | "customer" | "system" | "integration";
  actor_label: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  event_id: string | null;
  enquiry_id: string | null;
  customer_id: string | null;
  summary: string;
  changes: Record<string, [unknown, unknown]> | null;
  created_at: string;
}

export interface EmailThread {
  id: string;
  subject: string | null;
  classification: EmailClassification;
  classification_confidence: number | null;
  state: "open" | "needs_reply" | "awaiting_customer" | "closed";
  participants: string[];
  message_count: number;
  last_message_at: string | null;
  customer_id: string | null;
  event_id: string | null;
  enquiry_id: string | null;
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  subject: string | null;
  body_text: string | null;
  snippet: string | null;
  sent_at: string;
  is_read: boolean;
}
