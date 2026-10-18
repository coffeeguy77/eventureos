/**
 * Payment reminders: emails that chase an invoice before the event, and after it falls overdue.
 * Each step has its own wording (with {first_name} {event} {event_date} {invoice} {amount} {due_date} {days} {business}).
 * Pure — used by the settings page, the nightly runner and tests.
 */

export interface ReminderStep { key: string; on: boolean; days: number; subject: string; message: string }
export interface ReminderSettings { enabled: boolean; pre: ReminderStep[]; overdue: ReminderStep[] }

export const REMINDER_WORDS = ["first_name", "event", "event_date", "invoice", "amount", "due_date", "days", "business"] as const;

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  pre: [
    {
      key: "pre_7", on: true, days: 7, subject: "Things are brewing for {event} — invoice {invoice}",
      message: [
        "Hi {first_name},",
        "Things are brewing nicely for {event} on {event_date} — only {days} days to go!",
        "Just a friendly nudge that invoice {invoice} ({amount}) is still open. Getting it settled before the day means we can put all our energy into great coffee and happy guests.",
        "You can view and pay it with the button below.",
        "Thanks so much,\n{business}",
      ].join("\n\n"),
    },
    {
      key: "pre_2", on: true, days: 2, subject: "Almost time to pour — {event}",
      message: [
        "Hi {first_name},",
        "We're grinding the beans for {event} on {event_date}! Before we roll in, invoice {invoice} ({amount}) still needs to be paid — could you take care of it today so everything's locked in?",
        "It only takes a minute with the button below. If it's already on its way, thank you — please ignore this.",
        "See you soon,\n{business}",
      ].join("\n\n"),
    },
  ],
  overdue: [
    {
      key: "overdue_1", on: true, days: 1, subject: "A gentle nudge — invoice {invoice}",
      message: [
        "Hi {first_name},",
        "Just a gentle nudge (no froth, we promise) — invoice {invoice} for {event} ({amount}) was due on {due_date}.",
        "If it's already been paid, thank you and please ignore this. Otherwise you can pay it in a minute with the button below.",
        "Thanks,\n{business}",
      ].join("\n\n"),
    },
    {
      key: "overdue_7", on: true, days: 7, subject: "Invoice {invoice} is still on the boil",
      message: [
        "Hi {first_name},",
        "Invoice {invoice} ({amount}) for {event} is now a week past its due date of {due_date}, and it's still simmering away on our side.",
        "Could you please arrange payment this week, or reply and let us know when we can expect it?",
        "Thanks for helping keep the coffee flowing,\n{business}",
      ].join("\n\n"),
    },
    {
      key: "overdue_14", on: true, days: 14, subject: "Last call for invoice {invoice}",
      message: [
        "Hi {first_name},",
        "This is our last call for invoice {invoice} ({amount}), which was due on {due_date}.",
        "Please pay today using the button below, or reply to this email so we can sort it out together.",
        "Kind regards,\n{business}",
      ].join("\n\n"),
    },
  ],
};

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\r\n/g, "\n").slice(0, max) : "");
const step = (raw: unknown, dflt: ReminderStep, prefix: string): ReminderStep => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const days = Math.round(Number(r.days ?? dflt.days));
  return {
    key: `${prefix}_${Number.isFinite(days) ? Math.min(90, Math.max(prefix === "pre" ? 0 : 1, days)) : dflt.days}`,
    on: r.on === undefined ? dflt.on : r.on === true,
    days: Number.isFinite(days) ? Math.min(90, Math.max(prefix === "pre" ? 0 : 1, days)) : dflt.days,
    subject: clean(r.subject, 200).trim() || dflt.subject,
    message: clean(r.message, 4000).trim() || dflt.message,
  };
};

/** The saved settings, filled in with the defaults (unknown / broken values fall back). */
export function readReminders(settings: unknown): ReminderSettings {
  const raw = ((settings ?? {}) as Record<string, unknown>).payment_reminders as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_REMINDERS);
  const list = (v: unknown, d: ReminderStep[], prefix: string) => {
    const arr = Array.isArray(v) ? v.slice(0, 5) : d;
    const out = arr.map((x, i) => step(x, d[i] ?? d[d.length - 1], prefix));
    // one step per day count
    return out.filter((s, i) => out.findIndex((o) => o.days === s.days) === i).sort((a, b) => (prefix === "pre" ? b.days - a.days : a.days - b.days));
  };
  return { enabled: raw.enabled === true, pre: list(raw.pre, DEFAULT_REMINDERS.pre, "pre"), overdue: list(raw.overdue, DEFAULT_REMINDERS.overdue, "overdue") };
}

export interface ReminderInvoice {
  status: string; balance: number; due_date: string | null; event_date: string | null; emailed: boolean;
  sent: { key: string; at: string }[];
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/**
 * Which reminder (if any) is due today for an invoice. Only invoices that have been emailed, still owe money and aren't
 * void. Before the event: the closest step that's been reached (e.g. 5 days out → the 7-day one). After the due date:
 * the latest step reached. Never one that's already gone, never two within 2 days.
 */
export function reminderDue(inv: ReminderInvoice, r: ReminderSettings, today: string): ReminderStep | null {
  if (!r.enabled || !inv.emailed || Number(inv.balance) <= 0 || ["void", "paid", "draft"].includes(inv.status)) return null;
  const sentKeys = new Set(inv.sent.map((s) => s.key));
  const last = inv.sent.map((s) => s.at.slice(0, 10)).sort().pop();
  if (last && dayDiff(today, last) < 2) return null;
  if (inv.event_date && inv.event_date >= today) {
    const until = dayDiff(inv.event_date, today);
    const reached = r.pre.filter((s) => s.on && until <= s.days).sort((a, b) => a.days - b.days)[0];
    if (reached && !sentKeys.has(reached.key) && !(inv.due_date && inv.due_date < today)) return reached;
  }
  if (inv.due_date && inv.due_date < today) {
    const late = dayDiff(today, inv.due_date);
    const reached = r.overdue.filter((s) => s.on && late >= s.days).sort((a, b) => b.days - a.days)[0];
    if (reached && !sentKeys.has(reached.key)) return reached;
  }
  return null;
}
