import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { daysBetween } from "@/lib/accounts/core";
import { loadOwing } from "@/lib/accounts/server";
import { lastAttempts } from "@/lib/accounts/phones";
import { loadPhones } from "@/lib/accounts/phones-server";
import { CallPanel } from "./call-panel";
import { LogForm } from "./customer-tools";

const KIND: Record<string, string> = { note: "Note", call: "Call", email: "Email", sms: "Text", promise: "Promise to pay", dispute: "Dispute", plan: "Payment plan" };

/**
 * The accounts side of a customer, anywhere it's needed (an invoice, the client record): phone numbers and call tries,
 * logging a conversation, and the latest history — the same records as Accounts, so they're in sync everywhere.
 */
export async function AccountPanel({ db, orgId, customerId, invoiceId, today, timezone, currency, actorId }: {
  db: SupabaseClient; orgId: string; customerId: string; invoiceId?: string | null; today: string; timezone: string; currency: string; actorId: string | null;
}) {
  const [{ phones, xero }, owing, notesR] = await Promise.all([
    loadPhones(db, orgId, customerId, actorId),
    loadOwing(db, orgId, customerId).catch(() => []),
    db.from("collection_notes").select("id, kind, body, promise_date, promise_amount, next_step, next_step_due, done_at, created_at").eq("organisation_id", orgId).eq("customer_id", customerId).order("created_at", { ascending: false }).limit(60),
  ]);
  if (notesR.error && /does not exist|could not find/i.test(notesR.error.message)) return null;
  const notes = (notesR.data ?? []) as { id: string; kind: string; body: string | null; promise_date: string | null; promise_amount: number | null; next_step: string | null; next_step_due: string | null; done_at: string | null; created_at: string }[];
  const invOpts = owing.map((i) => ({ id: i.id, number: i.number, balance: money(i.balance, currency), due: i.due_date ? (i.due_date < today ? `${daysBetween(i.due_date, today)} days overdue` : `due ${fmtDate(i.due_date, "short")}`) : "no due date" }));
  const ordered = invoiceId ? [...invOpts.filter((i) => i.id === invoiceId), ...invOpts.filter((i) => i.id !== invoiceId)] : invOpts;
  const step = notes.find((n) => n.next_step && !n.done_at);
  return (
    <div className="space-y-5">
      <CallPanel customerId={customerId} invoiceId={invoiceId} phones={phones} attempts={lastAttempts(notes)} xero={xero} />
      <LogForm customerId={customerId} invoices={ordered} today={today} />
      <Card>
        <CardHeader title="Account history" subtitle={step ? `Next: ${step.next_step}${step.next_step_due ? ` · by ${fmtDate(step.next_step_due, "short")}` : ""}` : undefined}
          action={<Link href={`/accounts/${customerId}`} className="text-[0.75rem] font-medium text-brand-700 hover:underline">Open in Accounts</Link>} />
        <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
          {notes.slice(0, 8).map((n) => (
            <li key={n.id} className="px-5 py-2.5">
              <p className="text-[0.75rem] text-ink-faint"><span className="font-semibold text-ink-muted">{KIND[n.kind] ?? n.kind}</span> · {fmtDateTime(n.created_at, timezone)}</p>
              {n.body && <p className="mt-0.5 whitespace-pre-line text-ink">{n.body}</p>}
              {n.kind === "promise" && n.promise_date && <p className="text-emerald-800">Will pay {n.promise_amount ? money(Number(n.promise_amount), currency) : ""} on {fmtDate(n.promise_date)}</p>}
            </li>
          ))}
          {!notes.length && <li className="px-5 py-4 text-ink-muted">Nothing logged yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
