import type { OrgRole } from "@/lib/types";

export const TIMEZONES = [
  "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Darwin",
  "Australia/Perth", "Australia/Hobart", "Australia/Canberra", "Australia/Lord_Howe", "Pacific/Auckland",
  "Pacific/Chatham",
];

export const CURRENCIES = ["AUD", "NZD", "USD", "GBP", "EUR", "CAD", "SGD"];

export const BUSINESS_TYPES = [
  "Mobile coffee cart", "Mobile bar", "Catering", "Food truck", "Event hire", "Photo booth", "Entertainment",
  "Venue", "Event planning", "Florist", "Other",
];

export const PLAN_LABEL: Record<string, string> = {
  trial: "Trial", starter: "Starter", growth: "Growth", scale: "Scale",
};

export const ROLE_LABEL: Record<Exclude<OrgRole, "customer">, string> = {
  owner: "Owner", admin: "Admin", manager: "Manager", staff: "Staff",
};

export const ROLE_HINT: Record<Exclude<OrgRole, "customer">, string> = {
  owner: "Full control, including billing and owners",
  admin: "Everything except managing owners",
  manager: "Runs the business day to day",
  staff: "Operational access to their work",
};

/** Permission matrix from the product spec (what each role can do in EventureOS). */
export const PERMISSIONS: { label: string; owner: boolean; admin: boolean; manager: boolean; staff: boolean | "limited" }[] = [
  { label: "Customers & enquiries", owner: true, admin: true, manager: true, staff: "limited" },
  { label: "Quotes", owner: true, admin: true, manager: true, staff: "limited" },
  { label: "Events & calendar", owner: true, admin: true, manager: true, staff: "limited" },
  { label: "Invoices & payments", owner: true, admin: true, manager: true, staff: false },
  { label: "Calendars, automations & integrations", owner: true, admin: true, manager: true, staff: false },
  { label: "Organisation details & branding", owner: true, admin: true, manager: false, staff: false },
  { label: "Invite & manage team", owner: true, admin: true, manager: false, staff: false },
  { label: "Grant or remove owners", owner: true, admin: false, manager: false, staff: false },
];

export type TriggerType = "enquiry.created" | "quote.no_reply" | "quote.accepted" | "invoice.paid";

/** The four standard rules (same action JSON as supabase/seed/generate_seed.py and create_organisation()). */
export const STANDARD_RULES: Record<TriggerType, { name: string; actions: { type: string; params?: Record<string, unknown> }[] }> = {
  "enquiry.created": {
    name: "New enquiry → assign & notify",
    actions: [{ type: "assign_round_robin" }, { type: "notify_team" }],
  },
  "quote.no_reply": {
    name: "Follow up unanswered quotes",
    actions: [{ type: "flag_follow_up" }, { type: "create_task", params: { title: "Follow up quote" } }],
  },
  "quote.accepted": {
    name: "Quote accepted → confirm event",
    actions: [
      { type: "set_event_status", params: { status: "confirmed" } },
      { type: "create_calendar_event" },
      { type: "create_invoice", params: { kind: "deposit" } },
      { type: "notify_assigned" },
    ],
  },
  "invoice.paid": {
    name: "Invoice paid in Xero → update event",
    actions: [{ type: "mark_deposit_paid" }, { type: "update_portal" }],
  },
};

export const TRIGGER_ORDER: TriggerType[] = ["enquiry.created", "quote.no_reply", "quote.accepted", "invoice.paid"];

export const QUOTE_ACCEPTANCE_ACTIONS = {
  deposit_invoice: { label: "Create a deposit invoice", hint: "Raise an invoice for the deposit percentage below." },
  full_invoice: { label: "Create a full invoice", hint: "Raise one invoice for the full quote total." },
  manual: { label: "Do nothing (manual)", hint: "Confirm the event and calendar, but raise invoices yourself." },
} as const;
export type QuoteAcceptanceAction = keyof typeof QUOTE_ACCEPTANCE_ACTIONS;
