"use client";

import { useActionState, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { creditInvoice, deleteInvoice, markInvoiceSent, recordPayment, voidInvoice, type InvoiceFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";

const METHODS = ["Bank transfer", "Card", "Cash", "Cheque", "Stripe", "PayPal", "Other"];

function Ok({ state }: { state: InvoiceFormState }) {
  if (!state?.ok) return null;
  return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.7812rem] text-emerald-800 ring-1 ring-inset ring-emerald-100">{state.ok}</p>;
}

export function InvoiceActions({ id, number, status, balance, balanceLabel, paid, paidLabel, today, xeroManaged, canManage }: {
  id: string; number: string; status: string; balance: number; balanceLabel: string; paid: number; paidLabel: string; today: string; xeroManaged: boolean; canManage: boolean;
}) {
  const [mode, setMode] = useState<"none" | "pay" | "void" | "credit" | "delete">("none");
  const [sentState, setSentState] = useState<InvoiceFormState>();
  const [sending, startSend] = useTransition();
  const [delState, setDelState] = useState<InvoiceFormState>();
  const [deleting, startDelete] = useTransition();
  const [payState, payAction, paying] = useActionState<InvoiceFormState, FormData>(
    async (prev, fd) => { const r = await recordPayment(id, prev, fd); if (r?.ok) setMode("none"); return r; }, undefined);
  const [voidState, voidAction, voiding] = useActionState<InvoiceFormState, FormData>(
    async (prev, fd) => { const r = await voidInvoice(id, prev, fd); if (r?.ok) setMode("none"); return r; }, undefined);
  const [creditState, creditAction, crediting] = useActionState<InvoiceFormState, FormData>(
    async (prev, fd) => { const r = await creditInvoice(id, prev, fd); if (r?.ok) setMode("none"); return r; }, undefined);

  if (!canManage) return <p className="px-5 pb-5 text-[0.7812rem] text-ink-muted">Only owners, admins and managers can record payments or change invoices.</p>;
  if (status === "void") return <p className="px-5 pb-5 text-[0.7812rem] text-ink-muted">This invoice is void. No further changes can be made.</p>;

  const nothingPaid = paid <= 0;
  const canPay = balance > 0 && !xeroManaged;
  const canCredit = balance > 0 && !nothingPaid && status !== "draft";
  const toggle = (m: typeof mode) => setMode(mode === m ? "none" : m);
  return (
    <div className="space-y-3 px-5 pb-5">
      {xeroManaged && (
        <div className="flex gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-[0.7812rem] text-ink-muted ring-1 ring-inset ring-line">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
          <span><span className="font-medium text-ink">In Xero</span> — payments sync from Xero. Voiding or crediting here does the same in Xero.</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 [&>*]:h-10 [&>*]:flex-1 sm:[&>*]:h-8 sm:[&>*]:flex-none">
        {canPay && <Button size="sm" variant={mode === "pay" ? "secondary" : "primary"} onClick={() => toggle("pay")}>Record payment</Button>}
        {status === "draft" && !xeroManaged && (
          <Button size="sm" disabled={sending} onClick={() => startSend(async () => setSentState(await markInvoiceSent(id)))}>
            {sending ? "Updating…" : "Mark as sent"}
          </Button>
        )}
        {canCredit && <Button size="sm" onClick={() => toggle("credit")}>Credit the balance</Button>}
        {nothingPaid && <Button size="sm" variant="danger" onClick={() => toggle("void")}>Void</Button>}
        {nothingPaid && !xeroManaged && <Button size="sm" variant="danger" onClick={() => toggle("delete")}>Delete</Button>}
      </div>
      {!nothingPaid && balance > 0 && status === "draft" && <p className="text-[0.75rem] text-ink-muted">Money has been received on this draft — mark it as sent to credit the rest.</p>}
      <FormError message={sentState?.error} />
      <Ok state={sentState} />
      {mode === "none" && <><Ok state={payState} /><Ok state={voidState} /><Ok state={creditState} /></>}

      {mode === "delete" && (
        <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
          <p className="text-[0.7812rem] text-rose-900">Delete <b>{number}</b>? Nothing has been paid on it. It&apos;s removed completely — use <b>Void</b> instead if the customer has already seen it and you want it kept on record.</p>
          <FormError message={delState?.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={() => setMode("none")}>Keep invoice</Button>
            <Button size="sm" variant="danger" className="h-10 flex-1 sm:h-8 sm:flex-none" disabled={deleting}
              onClick={() => startDelete(async () => { const r = await deleteInvoice(id); if (r?.error) setDelState(r); })}>{deleting ? "Deleting…" : "Delete invoice"}</Button>
          </div>
        </div>
      )}

      {mode === "credit" && (
        <form action={creditAction} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <p className="text-[0.7812rem] text-amber-900">
            {paidLabel} has been received. Crediting writes off what&apos;s still owing (e.g. the event was cancelled and you&apos;re keeping the deposit) — the invoice is settled and isn&apos;t chased again. It isn&apos;t counted as money received.
            {xeroManaged ? " A credit note is made and applied in Xero." : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="credit_amount" hint={`Owing ${balanceLabel}`}>Amount to credit</Label><Input id="credit_amount" name="amount" inputMode="decimal" defaultValue={balance.toFixed(2)} required /></div>
            <div><Label htmlFor="credit_date">Date</Label><Input id="credit_date" name="credit_date" type="date" defaultValue={today} max={today} required /></div>
          </div>
          <div><Label htmlFor="credit_reason">Reason (goes on the credit note)</Label><Textarea id="credit_reason" name="reason" rows={2} required maxLength={500} placeholder="e.g. Event cancelled by the client — deposit kept, balance written off" /></div>
          <FormError message={creditState?.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={() => setMode("none")}>Cancel</Button>
            <Button size="sm" variant="primary" className="h-10 flex-1 sm:h-8 sm:flex-none" disabled={crediting}>{crediting ? "Crediting…" : "Credit the balance"}</Button>
          </div>
        </form>
      )}

      {mode === "pay" && (
        <form action={payAction} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pay_amount" hint={`Owing ${balanceLabel}`}>Amount</Label>
            <Input id="pay_amount" name="amount" inputMode="decimal" defaultValue={balance.toFixed(2)} required autoFocus />
          </div>
          <div><Label htmlFor="pay_date">Date received</Label><Input id="pay_date" name="paid_on" type="date" defaultValue={today} max={today} required /></div>
          <div>
            <Label htmlFor="pay_method">Method</Label>
            <Select id="pay_method" name="method" defaultValue="Bank transfer">{METHODS.map((m) => <option key={m}>{m}</option>)}</Select>
          </div>
          <div><Label htmlFor="pay_ref" hint="Optional">Reference</Label><Input id="pay_ref" name="reference" maxLength={120} /></div>
          <div className="sm:col-span-2"><FormError message={payState?.error} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={() => setMode("none")}>Cancel</Button>
            <Button size="sm" variant="primary" className="h-10 flex-1 sm:h-8 sm:flex-none" disabled={paying}>{paying ? "Recording…" : "Record payment"}</Button>
          </div>
        </form>
      )}

      {mode === "void" && (
        <form action={voidAction} className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
          <p className="text-[0.7812rem] text-rose-900">Voiding cancels the invoice permanently. It stays on record for the audit trail.{xeroManaged ? " It\u2019s voided in Xero too." : ""}</p>
          <div><Label htmlFor="void_reason">Reason</Label><Textarea id="void_reason" name="reason" rows={2} required maxLength={500} placeholder="e.g. Raised in error — replaced by INV-1012" /></div>
          <FormError message={voidState?.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={() => setMode("none")}>Keep invoice</Button>
            <Button size="sm" variant="danger" className="h-10 flex-1 sm:h-8 sm:flex-none" disabled={voiding}>{voiding ? "Voiding…" : "Void invoice"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
