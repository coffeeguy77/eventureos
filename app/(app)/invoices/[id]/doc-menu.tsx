"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Download, FileText, Loader2, Mail, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { invoiceSendSetup, sendInvoiceDoc } from "../send-actions";

type Pay = { id: string; label: string };
type Mode = { doc: "receipt" | "tax_invoice"; paymentId: string | null };

/**
 * "Send or download" on an invoice: email the invoice (unpaid), a receipt for a payment, or the paid tax invoice
 * (everything bought, the payments with dates and a zero balance — like Xero's). The PDFs can be downloaded too.
 */
export function DocMenu({ invoiceId, number, business, owing, paid, payments, canEmail, customerFirst }: {
  invoiceId: string; number: string; business: string; owing: boolean; paid: boolean; payments: Pay[]; canEmail: boolean; customerFirst: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const last = payments[payments.length - 1] ?? null;
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[0.8438rem] text-ink hover:bg-zinc-50";
  return (
    <div className="relative" ref={box}>
      <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Mail className="h-4 w-4" />Send or download<ChevronDown className="h-3.5 w-3.5" /></Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-72 rounded-xl bg-surface p-1.5 shadow-xl ring-1 ring-line">
          {canEmail && owing && <button type="button" className={item} onClick={() => { window.location.href = `/invoices/${invoiceId}?send=1`; }}><Mail className="h-4 w-4 text-brand-600" />Email invoice (to pay)</button>}
          {canEmail && last && <button type="button" className={item} onClick={() => { setMode({ doc: "receipt", paymentId: last.id }); setOpen(false); }}><Receipt className="h-4 w-4 text-brand-600" />Email receipt</button>}
          {canEmail && paid && <button type="button" className={item} onClick={() => { setMode({ doc: "tax_invoice", paymentId: null }); setOpen(false); }}><FileText className="h-4 w-4 text-brand-600" />Email tax invoice (paid)</button>}
          <div className="my-1 border-t border-line" />
          <a className={item} href={`/invoices/${invoiceId}/pdf`} target="_blank" rel="noopener"><Download className="h-4 w-4 text-ink-muted" />{paid ? "Paid tax invoice (PDF)" : "Tax invoice (PDF)"}</a>
          {payments.map((p) => <a key={p.id} className={item} href={`/invoices/${invoiceId}/receipt/${p.id}`} target="_blank" rel="noopener"><Download className="h-4 w-4 text-ink-muted" />Receipt · {p.label}</a>)}
        </div>
      )}
      {mode && <DocDialog invoiceId={invoiceId} number={number} business={business} mode={mode} payments={payments} customerFirst={customerFirst} onClose={() => setMode(null)} />}
    </div>
  );
}

function DocDialog({ invoiceId, number, business, mode: m0, payments, customerFirst, onClose }: {
  invoiceId: string; number: string; business: string; mode: Mode; payments: Pay[]; customerFirst: string | null; onClose: () => void;
}) {
  const [mode, setMode] = useState(m0);
  const [to, setTo] = useState("");
  const [via, setVia] = useState<"gmail" | "resend">("resend");
  const [ready, setReady] = useState<{ gmail: string | null; resend: boolean } | null>(null);
  const receipt = mode.doc === "receipt";
  const hi = `Hi${customerFirst ? ` ${customerFirst}` : ""},`;
  const [subject, setSubject] = useState(receipt ? `Receipt for ${number} — ${business}` : `Tax invoice ${number} (paid) — ${business}`);
  const [message, setMessage] = useState(receipt
    ? `${hi}\n\nThank you for your payment. Your receipt for invoice ${number} is attached.\n\nKind regards,\n${business}`
    : `${hi}\n\nThank you — invoice ${number} is paid in full. Your tax invoice showing the payment and a zero balance is attached.\n\nKind regards,\n${business}`);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    invoiceSendSetup(invoiceId).then((r) => {
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setTo(r.data.defaultTo.map((x) => x.email).join(", "));
      setReady({ gmail: r.data.gmail, resend: r.data.resendReady });
      setVia(r.data.gmail ? "gmail" : "resend");
    }).catch(() => setMsg({ ok: false, text: "Couldn't load the client's details." }));
  }, [invoiceId]);

  const send = () => start(async () => {
    setMsg(null);
    const r = await sendInvoiceDoc(invoiceId, { doc: mode.doc, paymentId: mode.paymentId, recipients: to.split(/[,;\s]+/).filter(Boolean).map((email) => ({ email })), subject, message, via });
    if (r.ok) { setMsg({ ok: true, text: `Sent to ${r.data.sent.join(", ")}.` }); setTimeout(onClose, 1600); } else setMsg({ ok: false, text: r.error });
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-label={receipt ? "Email receipt" : "Email tax invoice"} onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[1rem] font-semibold text-ink">{receipt ? "Email a receipt" : "Email the paid tax invoice"}</p>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-3">
          {receipt && payments.length > 1 && (
            <div><Label htmlFor="dd-pay">Payment</Label>
              <Select id="dd-pay" value={mode.paymentId ?? ""} onChange={(e) => setMode({ ...mode, paymentId: e.target.value })}>{payments.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></div>
          )}
          <div><Label htmlFor="dd-to" hint="separate with commas">To</Label><Input id="dd-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" /></div>
          <div><Label htmlFor="dd-sub">Subject</Label><Input id="dd-sub" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} /></div>
          <div><Label htmlFor="dd-msg">Message</Label><Textarea id="dd-msg" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
          {ready && (
            <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
              <span className="text-ink-muted">Send from</span>
              {ready.gmail && <label className="inline-flex items-center gap-1.5"><input type="radio" checked={via === "gmail"} onChange={() => setVia("gmail")} />{ready.gmail}</label>}
              {ready.resend && <label className="inline-flex items-center gap-1.5"><input type="radio" checked={via === "resend"} onChange={() => setVia("resend")} />EventureOS email</label>}
            </div>
          )}
          <p className="text-[0.75rem] text-ink-faint">The {receipt ? "receipt" : "tax invoice"} PDF is attached, with a link to view the invoice and receipts online.</p>
          {msg && <p className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</p>}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={pending || !ready || !to.trim() || (!ready.gmail && !ready.resend)} onClick={send}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Send</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
