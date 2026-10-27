/**
 * Accounts (pure): chasing templates, how overdue things are, and which payments came after which chasing email
 * (so each email's success can be measured: opened, pay link clicked, money recovered).
 */
export interface Template { key: string; name: string; subject: string; message: string }

/** Words: {first_name} {invoice} {amount} {due_date} {days_overdue} {promise_date} {business} */
export const DEFAULT_TEMPLATES: Template[] = [
  { key: "friendly", name: "Friendly reminder", subject: "Invoice {invoice} — a quick reminder",
    message: "Hi {first_name},\n\nJust a friendly reminder that invoice {invoice} for {amount} was due on {due_date}. You can pay it online in a minute with the button below.\n\nIf it's already on its way, thank you — please ignore this.\n\nKind regards,\n{business}" },
  { key: "overdue", name: "Overdue", subject: "Invoice {invoice} is {days_overdue} days overdue",
    message: "Hi {first_name},\n\nInvoice {invoice} for {amount} is now {days_overdue} days overdue. Could you please arrange payment this week? The button below takes you straight to it.\n\nIf there's a problem with the invoice, just reply and let us know so we can sort it out.\n\nThanks,\n{business}" },
  { key: "final", name: "Final notice", subject: "Final notice: invoice {invoice} ({amount})",
    message: "Hi {first_name},\n\nWe haven't been able to reach you about invoice {invoice} for {amount}, which is {days_overdue} days overdue.\n\nPlease pay it within 7 days or contact us to arrange a payment plan. If we don't hear from you, we'll need to take further steps to recover the amount.\n\nRegards,\n{business}" },
  { key: "promise", name: "Payment due today (as agreed)", subject: "As agreed — invoice {invoice} is due today",
    message: "Hi {first_name},\n\nAs we discussed, here's invoice {invoice} for {amount}, which you said you'd pay today ({promise_date}). The button below lets you pay it by card in a minute.\n\nThanks very much,\n{business}" },
  { key: "plan", name: "Payment plan", subject: "Your payment plan for invoice {invoice}",
    message: "Hi {first_name},\n\nThanks for talking with us. As agreed, here's invoice {invoice} — the balance is {amount}. You can pay each instalment from the link below.\n\nKind regards,\n{business}" },
];

export function readTemplates(settings: unknown): Template[] {
  const raw = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).collections : null) as { templates?: unknown } | null;
  const saved = Array.isArray(raw?.templates) ? raw!.templates : [];
  const out: Template[] = [];
  for (const t of saved as unknown[]) {
    const o = (t ?? {}) as Record<string, unknown>;
    const key = typeof o.key === "string" && /^[a-z0-9_-]{2,30}$/.test(o.key) ? o.key : "";
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
    const subject = typeof o.subject === "string" ? o.subject.trim().slice(0, 200) : "";
    const message = typeof o.message === "string" ? o.message.replace(/\r\n/g, "\n").trim().slice(0, 4000) : "";
    if (key && name && subject && message && !out.some((x) => x.key === key)) out.push({ key, name, subject, message });
  }
  // built-in ones you haven't changed are always there
  for (const d of DEFAULT_TEMPLATES) if (!out.some((x) => x.key === d.key)) out.push(d);
  return out.slice(0, 20);
}

export function fill(t: string, words: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in words ? words[k] : m));
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Ageing bucket of an invoice's balance. */
export function bucket(due: string | null, today: string): "current" | "1-30" | "31-60" | "61-90" | "90+" {
  if (!due || due >= today) return "current";
  const d = daysBetween(due, today);
  return d <= 30 ? "1-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+";
}

export interface SentEmail { id: string; invoice_id: string | null; sent_at: string; template: string | null; opened_at: string | null; clicked_at: string | null }
export interface Payment { invoice_id: string; amount: number; paid_at: string }

/**
 * Each payment counts once, towards the latest chasing email for that invoice sent before it (within 30 days).
 * Returns money recovered per email.
 */
export function attribute(emails: SentEmail[], payments: Payment[], windowDays = 30): Map<string, number> {
  const out = new Map<string, number>();
  const byInv = new Map<string, SentEmail[]>();
  for (const e of emails) if (e.invoice_id) byInv.set(e.invoice_id, [...(byInv.get(e.invoice_id) ?? []), e]);
  for (const list of byInv.values()) list.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  for (const p of payments) {
    const list = byInv.get(p.invoice_id);
    if (!list) continue;
    let pick: SentEmail | null = null;
    for (const e of list) if (e.sent_at <= p.paid_at && Date.parse(p.paid_at) - Date.parse(e.sent_at) <= windowDays * 86_400_000) pick = e;
    if (pick) out.set(pick.id, Math.round(((out.get(pick.id) ?? 0) + p.amount) * 100) / 100);
  }
  return out;
}
