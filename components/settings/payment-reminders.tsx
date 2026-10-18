"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { DEFAULT_REMINDERS, REMINDER_WORDS, type ReminderSettings, type ReminderStep } from "@/lib/invoices/reminder-rules";
import { savePaymentSettings } from "@/app/(app)/settings/actions";

const SAMPLE: Record<string, string> = { first_name: "Vikram", event: "World Teachers' Day", event_date: "Friday 30 October 2026", invoice: "INV-1006", amount: "$1,265.00", due_date: "Monday 19 October 2026", days: "5", business: "Bean Culture" };
const fill = (t: string) => t.replace(/\{(\w+)\}/g, (m, k) => SAMPLE[k] ?? m);

/** Invoice emails: send automatically on acceptance, and payment reminders with their own wording. */
export function PaymentReminderSettings({ autoEmail, reminders, canEdit }: { autoEmail: boolean; reminders: ReminderSettings; canEdit: boolean }) {
  const [auto, setAuto] = useState(autoEmail);
  const [r, setR] = useState<ReminderSettings>(reminders);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const setStep = (group: "pre" | "overdue", i: number, patch: Partial<ReminderStep>) =>
    setR((x) => ({ ...x, [group]: x[group].map((s, n) => (n === i ? { ...s, ...patch } : s)) }));
  const addStep = (group: "pre" | "overdue") => setR((x) => {
    const days = group === "pre" ? Math.max(0, Math.min(...x.pre.map((s) => s.days), 8) - 1) : Math.max(...x.overdue.map((s) => s.days), 0) + 7;
    const base = DEFAULT_REMINDERS[group][group === "pre" ? 0 : 1];
    return { ...x, [group]: [...x[group], { ...base, key: `${group}_${days}`, days }].slice(0, 5) };
  });
  const save = () => start(async () => {
    setMsg(null);
    const res = await savePaymentSettings({ autoEmail: auto, reminders: r }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
  });

  const group = (g: "pre" | "overdue", title: string, hint: string) => (
    <div className="mt-5">
      <p className="text-[0.8125rem] font-semibold text-ink">{title}</p>
      <p className="mb-2 text-[0.75rem] text-ink-muted">{hint}</p>
      <ul className="space-y-2">
        {r[g].map((s, i) => {
          const id = `${g}-${i}`;
          return (
            <li key={id} className={cn("rounded-xl border border-line", !s.on && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <label className="inline-flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
                  <input type="checkbox" checked={s.on} disabled={!canEdit} onChange={(e) => setStep(g, i, { on: e.target.checked })} className="h-4 w-4 rounded border-line-strong" />
                  <input type="number" min={g === "pre" ? 0 : 1} max={90} value={s.days} disabled={!canEdit} aria-label="Days"
                    onChange={(e) => setStep(g, i, { days: Math.max(g === "pre" ? 0 : 1, Math.min(90, Math.round(Number(e.target.value) || 0))) })} className={cn(inputClass, "h-8 w-16 py-0 text-right")} />
                  {g === "pre" ? "days before the event" : "days after the due date"}
                </label>
                <span className="min-w-0 flex-1 truncate text-[0.75rem] text-ink-muted">“{fill(s.subject)}”</span>
                <button type="button" onClick={() => setOpen(open === id ? null : id)} className="text-[0.75rem] font-medium text-brand-600 hover:text-brand-700">{open === id ? "Close" : "Edit wording"}</button>
                {canEdit && r[g].length > 1 && (
                  <button type="button" aria-label="Remove this reminder" onClick={() => setR((x) => ({ ...x, [g]: x[g].filter((_, n) => n !== i) }))} className="grid h-8 w-8 place-items-center rounded-md text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              {open === id && (
                <div className="grid gap-3 border-t border-line p-3 lg:grid-cols-2">
                  <div className="space-y-2">
                    <input value={s.subject} disabled={!canEdit} onChange={(e) => setStep(g, i, { subject: e.target.value })} aria-label="Subject" className={inputClass} />
                    <textarea value={s.message} disabled={!canEdit} rows={10} onChange={(e) => setStep(g, i, { message: e.target.value })} aria-label="Message" className={cn(inputClass, "h-auto py-2 leading-relaxed")} />
                    <p className="text-[0.7188rem] text-ink-faint">Fills in: {REMINDER_WORDS.map((w) => `{${w}}`).join(" ")}. The invoice card and pay button go under the message.</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3 text-[0.8125rem]">
                    <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Preview</p>
                    <p className="mb-2 font-semibold text-ink">{fill(s.subject)}</p>
                    <p className="whitespace-pre-line text-ink-muted">{fill(s.message)}</p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && r[g].length < 5 && <Button type="button" size="sm" variant="ghost" className="mt-1 h-9 sm:h-8" onClick={() => addStep(g)}><Plus className="h-3.5 w-3.5" />Add a reminder</Button>}
    </div>
  );

  return (
    <div className="border-t border-line px-4 py-5 sm:px-5">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={auto} disabled={!canEdit} onChange={(e) => setAuto(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line-strong" />
        <span>
          <span className="block text-[0.8125rem] font-medium text-ink">Email the invoice as soon as a client accepts a quote</span>
          <span className="block text-[0.75rem] text-ink-muted">From your Gmail (in the job&apos;s email conversation when there is one), to the job&apos;s contacts, with the pay-by-card link. Quotes you accept for a client from the office aren&apos;t emailed automatically.</span>
        </span>
      </label>
      <label className="mt-5 flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={r.enabled} disabled={!canEdit} onChange={(e) => setR((x) => ({ ...x, enabled: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-line-strong" />
        <span>
          <span className="block text-[0.8125rem] font-medium text-ink">Send payment reminders</span>
          <span className="block text-[0.75rem] text-ink-muted">For invoices that have been emailed and aren&apos;t paid. Sent between 9am and 5pm, never two within 2 days, each one once. Paid, void and Xero-history invoices are never chased.</span>
        </span>
      </label>
      {group("pre", "Before the event", "Get paid before the day: sent this many days before the event, if the invoice is still open.")}
      {group("overdue", "After the due date", "Sent when the invoice is this many days overdue.")}
      {canEdit && (
        <div className="mt-5 flex items-center justify-end gap-3">
          {msg && <span className={cn("text-[0.8125rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</span>}
          <Button type="button" variant="primary" size="sm" className="h-10 sm:h-9" onClick={save} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save invoice emails</Button>
        </div>
      )}
    </div>
  );
}
