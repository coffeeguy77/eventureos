import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readReminders, reminderDue } from "./reminder-rules";

/**
 * Send the payment reminders that are due — only for businesses that switched them on, only between 9am and 5pm
 * their time (the job runs every few minutes), at most 30 per business per run. Each reminder goes once.
 */
export async function runPaymentReminders(db: SupabaseClient) {
  const { data: orgs } = await db.from("organisations").select("id, timezone, settings").eq("status", "active").eq("settings->payment_reminders->>enabled", "true");
  const out: { org: string; sent: number; failed: number }[] = [];
  for (const o of (orgs ?? []) as { id: string; timezone: string | null; settings: Record<string, unknown> | null }[]) {
    const tz = o.timezone || "Australia/Sydney";
    const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
    if (hour < 9 || hour >= 17) continue;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const r = readReminders(o.settings);
    const { data: invs, error } = await db.from("invoices").select("id, status, balance, due_date, emailed_at, reminders, origin, event:events(event_date, status)")
      .eq("organisation_id", o.id).eq("origin", "eventureos").in("status", ["awaiting_payment", "part_paid", "overdue"]).gt("balance", 0).not("emailed_at", "is", null).limit(500);
    if (error) continue; // before the 0059 database update
    let sent = 0, failed = 0;
    const { deliverInvoice, fillTemplate, invoiceRecipients, invoiceWords, loadInvoiceForSend } = await import("./deliver");
    for (const i of (invs ?? []) as unknown as { id: string; status: string; balance: number; due_date: string | null; emailed_at: string; reminders: { key: string; at: string }[]; event: { event_date: string | null; status: string } | null }[]) {
      if (sent >= 30) break;
      if (i.event?.status === "cancelled") continue;
      const due = reminderDue({ status: i.status, balance: Number(i.balance), due_date: i.due_date, event_date: i.event?.event_date ?? null, emailed: true, sent: Array.isArray(i.reminders) ? i.reminders : [] }, r, today);
      if (!due) continue;
      const full = await loadInvoiceForSend(db, i.id);
      if (!full) continue;
      const words = await invoiceWords(db, full, await invoiceRecipients(db, full));
      const res = await deliverInvoice(db, i.id, { kind: due.key, actor: "Payment reminder", subject: fillTemplate(due.subject, words), message: fillTemplate(due.message, words) }).catch((e) => ({ ok: false as const, error: String(e) }));
      if (res.ok) sent++; else failed++;
    }
    out.push({ org: o.id, sent, failed });
  }
  return out;
}
