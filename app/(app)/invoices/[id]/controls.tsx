"use client";

import { useActionState, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { markInvoiceSent, recordPayment, voidInvoice, type InvoiceFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";

const METHODS = ["Bank transfer", "Card", "Cash", "Cheque", "Stripe", "PayPal", "Other"];

function Ok({ state }: { state: InvoiceFormState }) {
  if (!state?.ok) return null;
  return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800 ring-1 ring-inset ring-emerald-100">{state.ok}</p>;
}

export function InvoiceActions({ id, status, balance, balanceLabel, today, xeroManaged, canManage }: {
  id: string; status: string; balance: number; balanceLabel: string; today: string; xeroManaged: boolean; canManage: boolean;
}) {
  const [mode, setMode] = useState<"none" | "pay" | "void">("none");
  const [sentState, setSentState] = useState<InvoiceFormState>();
  const [sending, startSend] = useTransition();
  const [payState, payAction, paying] = useActionState<InvoiceFormState, FormData>(
    async (prev, fd) => { const r = await recordPayment(id, prev, fd); if (r?.ok) setMode("none"); return r; }, undefined);
  const [voidState, voidAction, voiding] = useActionState<InvoiceFormState, FormData>(
    async (prev, fd) => { const r = await voidInvoice(id, prev, fd); if (r?.ok) setMode("none"); return r; }, undefined);

  if (xeroManaged) {
    return (
      <div className="px-5 pb-5">
        <div className="flex gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-[12.5px] text-ink-muted ring-1 ring-inset ring-line">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
          <span><span className="font-medium text-ink">Managed in Xero</span> — changes sync from Xero. Record payments, send or void this invoice in Xero.</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 opacity-60 [&>*]:h-10 [&>*]:flex-1 sm:[&>*]:h-8 sm:[&>*]:flex-none">
          <Button size="sm" disabled title="Managed in Xero — changes sync from Xero">Record payment</Button>
          <Button size="sm" disabled title="Managed in Xero — changes sync from Xero">Mark as sent</Button>
          <Button size="sm" disabled title="Managed in Xero — changes sync from Xero">Void</Button>
        </div>
      </div>
    );
  }
  if (!canManage) return <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Only owners, admins and managers can record payments or change invoices.</p>;
  if (status === "void") return <p className="px-5 pb-5 text-[12.5px] text-ink-muted">This invoice is void. No further changes can be made.</p>;

  const canPay = balance > 0;
  return (
    <div className="space-y-3 px-5 pb-5">
      <div className="flex flex-wrap gap-2 [&>*]:h-10 [&>*]:flex-1 sm:[&>*]:h-8 sm:[&>*]:flex-none">
        {canPay && <Button size="sm" variant={mode === "pay" ? "secondary" : "primary"} onClick={() => setMode(mode === "pay" ? "none" : "pay")}>Record payment</Button>}
        {status === "draft" && (
          <Button size="sm" disabled={sending} onClick={() => startSend(async () => setSentState(await markInvoiceSent(id)))}>
            {sending ? "Updating…" : "Mark as sent"}
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={() => setMode(mode === "void" ? "none" : "void")}>Void</Button>
      </div>
      <FormError message={sentState?.error} />
      <Ok state={sentState} />
      {mode === "none" && <><Ok state={payState} /><Ok state={voidState} /></>}

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
          <p className="text-[12.5px] text-rose-900">Voiding cancels the invoice permanently. It stays on record for the audit trail.</p>
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
