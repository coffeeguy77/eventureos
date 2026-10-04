"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Mail, Phone, Printer, UserPlus } from "lucide-react";
import { moveBooking, officeBooking, resendConfirmation, setBookingStatus, updateBookingDetails, updateSession, type Result } from "@/app/(app)/bookings/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const fail = { ok: false as const, error: "Couldn't reach the server." };
const $ = (n: number, cur: string) => new Intl.NumberFormat("en-AU", { style: "currency", currency: cur }).format(n).replace(/\.00$/, "");
const SRC: Record<string, string> = { website: "Website", wordpress: "Website", office: "Office", bookly: "Bookly", classbento: "ClassBento", woocommerce: "WooCommerce", import: "Imported" };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = <T,>(fn: () => Promise<Result<T>>, after?: (d: T) => void) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => fail);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: typeof r.data === "string" ? r.data : (r.data as { message?: string })?.message ?? "Done." });
    after?.(r.data);
    router.refresh();
  });
  return { pending, msg, setMsg, go };
}

export interface RosterBooking {
  id: string; reference: string; status: string; seats: number; attendees: { name: string }[]; contact_name: string; contact_email: string | null; contact_phone: string | null; notes: string | null; answers: Record<string, string>;
  total: number; gift_amount: number; amount_paid: number; payment_method: string; source: string; po_number: string | null; po_site: string | null; po_contact: string | null; invoice_id: string | null; checked_in_at: string | null; cancel_reason: string | null;
  agency: { name: string } | null; invoice: { number: string; status: string } | null;
}

export function RosterRow({ b, currency, others, isPast }: { b: RosterBooking; currency: string; others: { id: string; label: string }[]; isPast: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "cancel" | "move" | "edit">(null);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [force, setForce] = useState(false);
  const [edit, setEdit] = useState({ contact_name: b.contact_name, contact_email: b.contact_email ?? "", contact_phone: b.contact_phone ?? "", notes: b.notes ?? "", attendees: (b.attendees ?? []).map((a) => a.name).join("\n"), amount_paid: String(b.amount_paid ?? 0) });
  const { pending, msg, go } = useRun();
  const here = b.status === "attended";
  const names = (b.attendees ?? []).map((a) => a.name).filter(Boolean);
  const pay = b.payment_method === "agency" ? `Agency${b.agency ? ` · ${b.agency.name}` : ""}${b.po_number ? ` · PO ${b.po_number}` : ""}`
    : b.payment_method === "gift" ? `Gift certificate ${$(Number(b.gift_amount), currency)}`
    : b.payment_method === "free" ? "Free" : b.payment_method === "office" ? (Number(b.amount_paid) >= Number(b.total) ? `Paid ${$(Number(b.amount_paid), currency)}` : `To pay ${$(Number(b.total) - Number(b.amount_paid), currency)}`)
    : b.status === "waitlist" ? "Waiting for a seat" : Number(b.amount_paid) > 0 ? `Paid ${$(Number(b.amount_paid), currency)}${Number(b.gift_amount) > 0 ? " (incl. gift)" : ""}` : b.status === "held" ? "Paying now…" : b.payment_method === "external" ? "Paid elsewhere" : "Not paid";
  const live = ["confirmed", "attended", "no_show"].includes(b.status);

  return (
    <li className={cn("px-4 py-3 sm:px-5", b.status === "cancelled" && "opacity-60")} data-roster>
      <div className="flex items-start gap-3">
        {live ? (
          <button type="button" disabled={pending} onClick={() => go(() => setBookingStatus(b.id, here ? "confirmed" : "attended"))} aria-pressed={here} title={here ? "Checked in — tap to undo" : "Check in"}
            className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ring-inset transition print:hidden", here ? "bg-emerald-500 text-white ring-emerald-500" : "text-ink-faint ring-line-strong hover:bg-zinc-50")}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
        ) : <span className="mt-0.5 h-8 w-8 shrink-0" />}
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[0.875rem] font-semibold text-ink">{b.contact_name}</span>
            {b.seats > 1 && <Badge tone="brand">{b.seats} seats</Badge>}
            {b.status === "no_show" && <Badge tone="red">No-show</Badge>}
            {b.status === "waitlist" && <Badge tone="amber">Waitlist</Badge>}
            {b.status === "cancelled" && <Badge tone="neutral">Cancelled</Badge>}
            {b.status === "held" && <Badge tone="slate">Checkout</Badge>}
            {b.invoice?.status === "draft" && <Badge tone="amber">Draft invoice</Badge>}
          </span>
          <span className="mt-0.5 block text-[0.78rem] text-ink-muted">{names.length > 1 ? `${names.join(", ")} · ` : ""}{pay} · {SRC[b.source] ?? b.source} · {b.reference}</span>
          {b.notes && <span className="mt-0.5 block text-[0.78rem] text-amber-800">“{b.notes}”</span>}
        </button>
        <button type="button" onClick={() => setOpen(!open)} aria-label="More" className="rounded p-1.5 text-ink-faint hover:bg-zinc-100 print:hidden"><ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} /></button>
      </div>
      {open && (
        <div className="ml-11 mt-2 space-y-3 print:hidden">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
            {b.contact_email && <a href={`mailto:${b.contact_email}`} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline"><Mail className="h-3.5 w-3.5" />{b.contact_email}</a>}
            {b.contact_phone && <a href={`tel:${b.contact_phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline"><Phone className="h-3.5 w-3.5" />{b.contact_phone}</a>}
            {b.invoice_id && b.invoice && <Link href={`/invoices/${b.invoice_id}`} className="text-brand-700 hover:underline">Invoice {b.invoice.number} ({b.invoice.status === "draft" ? "draft — check it" : b.invoice.status.replace("_", " ")})</Link>}
            {b.cancel_reason && <span className="text-ink-muted">{b.cancel_reason}</span>}
          </div>
          {Object.keys(b.answers ?? {}).length > 0 && <dl className="text-[0.78rem] text-ink-muted">{Object.entries(b.answers).map(([k, v]) => <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline">{v}</dd></div>)}</dl>}
          <div className="flex flex-wrap gap-2">
            {live && !isPast && <Button size="sm" onClick={() => setMode(mode === "move" ? null : "move")}>Move</Button>}
            {b.status === "waitlist" && <Button size="sm" onClick={() => setMode(mode === "move" ? null : "move")}>Give a seat / move</Button>}
            {(live || b.status === "waitlist") && b.contact_email && <Button size="sm" disabled={pending} onClick={() => go(() => resendConfirmation(b.id))}>Resend email</Button>}
            {live && isPast && b.status !== "no_show" && <Button size="sm" disabled={pending} onClick={() => go(() => setBookingStatus(b.id, "no_show"))}>No-show</Button>}
            <Button size="sm" onClick={() => setMode(mode === "edit" ? null : "edit")}>Edit</Button>
            {(live || b.status === "waitlist" || b.status === "held") && <Button size="sm" variant="danger" onClick={() => setMode(mode === "cancel" ? null : "cancel")}>Cancel booking</Button>}
            {b.status === "cancelled" && <Button size="sm" disabled={pending} onClick={() => go(() => setBookingStatus(b.id, "confirmed"))}>Restore</Button>}
          </div>
          {mode === "cancel" && (
            <div className="rounded-lg bg-rose-50 p-3 text-[0.8125rem] text-rose-900">
              <p>Cancel {b.reference}? The seat{b.seats === 1 ? "" : "s"} go back on sale.{Number(b.amount_paid) > 0 ? " Refunds aren't automatic — refund in Stripe, or give a gift certificate as credit." : ""}</p>
              <Input className="mt-2" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
              <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => setMode(null)}>Keep it</Button><Button size="sm" variant="danger" disabled={pending} onClick={() => go(() => setBookingStatus(b.id, "cancelled", reason), () => setMode(null))}>Cancel booking</Button></div>
            </div>
          )}
          {mode === "move" && (
            <div className="rounded-lg bg-zinc-50 p-3">
              <Select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Move to…</option>{others.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
              <label className="mt-2 flex items-center gap-2 text-[0.78rem] text-ink-muted"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />Allow even if it's full (overbook)</label>
              <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => setMode(null)}>Close</Button><Button size="sm" variant="primary" disabled={!target || pending} onClick={() => go(() => moveBooking(b.id, target, force), () => setMode(null))}>Move</Button></div>
            </div>
          )}
          {mode === "edit" && (
            <div className="grid gap-2 rounded-lg bg-zinc-50 p-3 sm:grid-cols-2">
              <div><Label>Name</Label><Input value={edit.contact_name} onChange={(e) => setEdit({ ...edit, contact_name: e.target.value })} /></div>
              <div><Label>Paid ($)</Label><Input inputMode="decimal" value={edit.amount_paid} onChange={(e) => setEdit({ ...edit, amount_paid: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={edit.contact_email} onChange={(e) => setEdit({ ...edit, contact_email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={edit.contact_phone} onChange={(e) => setEdit({ ...edit, contact_phone: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label hint="one per line">People</Label><Textarea value={edit.attendees} onChange={(e) => setEdit({ ...edit, attendees: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
              <div className="flex gap-2 sm:col-span-2"><Button size="sm" onClick={() => setMode(null)}>Close</Button>
                <Button size="sm" variant="primary" disabled={pending} onClick={() => go(() => updateBookingDetails(b.id, { ...edit, attendees: edit.attendees.split("\n") }), () => setMode(null))}>Save</Button></div>
            </div>
          )}
          {msg && <p className={cn("text-[0.78rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
        </div>
      )}
      {!open && msg && !msg.ok && <p className="ml-11 mt-1 text-[0.78rem] font-medium text-rose-700">{msg.text}</p>}
    </li>
  );
}

export function AddBooking({ sessionId, full, left, price, agencies }: { sessionId: string; full: boolean; left: number; price: number; agencies: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", seats: "1", notes: "", payment: "office" as "office" | "free" | "external" | "agency", amountPaid: "", priceEach: "", agencyId: "", poNumber: "", poSite: "", poContact: "", send: true, force: false });
  const { pending, msg, setMsg, go } = useRun();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  if (!open) return <Button variant="primary" className="w-full" onClick={() => { setOpen(true); setMsg(null); }}><UserPlus className="h-4 w-4" />Add a booking</Button>;
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="mb-3 text-[0.9375rem] font-semibold text-ink">Add a booking</p>
      <div className="grid gap-2.5">
        <div><Label htmlFor="ab-name">Name</Label><Input id="ab-name" value={f.name} onChange={set("name")} autoFocus /></div>
        <div className="grid grid-cols-2 gap-2"><div><Label>Email</Label><Input type="email" value={f.email} onChange={set("email")} /></div><div><Label>Phone</Label><Input value={f.phone} onChange={set("phone")} /></div></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label hint={full ? "full" : `${left} left`}>Seats</Label><Input type="number" min={1} max={50} value={f.seats} onChange={set("seats")} /></div>
          <div><Label>Payment</Label><Select value={f.payment} onChange={set("payment")}><option value="office">Pay later / on the day</option><option value="external">Already paid</option><option value="free">Free / complimentary</option>{agencies.length > 0 && <option value="agency">Agency (purchase order)</option>}</Select></div>
        </div>
        {f.payment === "external" && <div><Label hint={`$${price} each`}>Amount paid</Label><Input inputMode="decimal" placeholder={String(price * (Number(f.seats) || 1))} value={f.amountPaid} onChange={set("amountPaid")} /></div>}
        {f.payment === "agency" && (
          <>
            <div><Label>Agency</Label><Select value={f.agencyId} onChange={set("agencyId")}><option value="">Choose…</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>PO number</Label><Input value={f.poNumber} onChange={set("poNumber")} /></div><div><Label>Site</Label><Input value={f.poSite} onChange={set("poSite")} /></div></div>
            <div><Label>Agency contact</Label><Input value={f.poContact} onChange={set("poContact")} /></div>
          </>
        )}
        <div><Label hint="optional">Price per seat</Label><Input inputMode="decimal" placeholder={`$${price}`} value={f.priceEach} onChange={set("priceEach")} /></div>
        <div><Label hint="optional">Notes</Label><Textarea value={f.notes} onChange={set("notes")} className="min-h-[60px]" /></div>
        <label className="flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={f.send} onChange={set("send")} />Email them a confirmation</label>
        {full && <label className="flex items-center gap-2 text-[0.8125rem] text-amber-800"><input type="checkbox" checked={f.force} onChange={set("force")} />It's full — overbook anyway</label>}
        {msg && <p className={cn("text-[0.78rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
        <div className="flex gap-2">
          <Button onClick={() => setOpen(false)}>Close</Button>
          <Button variant="primary" className="flex-1" disabled={pending || !f.name.trim()} onClick={() => go(() => officeBooking({ sessionId, name: f.name, email: f.email, phone: f.phone, seats: Number(f.seats) || 1, notes: f.notes, payment: f.payment,
            amountPaid: f.amountPaid, priceEach: f.priceEach, agencyId: f.agencyId || null, poNumber: f.poNumber, poSite: f.poSite, poContact: f.poContact, sendConfirmation: f.send, force: f.force }),
            () => setF({ ...f, name: "", email: "", phone: "", seats: "1", notes: "", amountPaid: "", poNumber: "", poSite: "", poContact: "", force: false }))}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}Book in
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SessionControls({ s, defaultPrice, hasBookings }: { s: { id: string; capacity: number; external_seats: number; external_note: string | null; note: string | null; status: string; price: number | null }; defaultPrice: number; hasBookings: boolean }) {
  const [f, setF] = useState({ capacity: String(s.capacity), external_seats: String(s.external_seats), external_note: s.external_note ?? "", note: s.note ?? "", price: s.price === null ? "" : String(s.price) });
  const [ask, setAsk] = useState(false);
  const { pending, msg, go } = useRun();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="mb-3 text-[0.9375rem] font-semibold text-ink">Session settings</p>
      <div className="grid gap-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Seats</Label><Input type="number" min={0} max={500} value={f.capacity} onChange={set("capacity")} /></div>
          <div><Label hint={`usual $${defaultPrice}`}>Price</Label><Input inputMode="decimal" placeholder={String(defaultPrice)} value={f.price} onChange={set("price")} /></div>
        </div>
        <div><Label hint="e.g. ClassBento">Seats sold elsewhere</Label><Input type="number" min={0} max={500} value={f.external_seats} onChange={set("external_seats")} /></div>
        <div><Label hint="optional">Where / who</Label><Input value={f.external_note} onChange={set("external_note")} placeholder="ClassBento — Jackson Breer +1" /></div>
        <div><Label hint="team only">Note</Label><Textarea value={f.note} onChange={set("note")} className="min-h-[60px]" /></div>
        <Button variant="primary" disabled={pending} onClick={() => go(() => updateSession(s.id, { capacity: Number(f.capacity), external_seats: Number(f.external_seats), external_note: f.external_note, note: f.note, price: f.price }))}>Save</Button>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {s.status === "open" && <Button size="sm" disabled={pending} onClick={() => go(() => updateSession(s.id, { status: "closed" }))}>Stop taking bookings</Button>}
          {s.status !== "open" && <Button size="sm" disabled={pending} onClick={() => go(() => updateSession(s.id, { status: "open" }))}>Open for bookings</Button>}
          {s.status !== "cancelled" && <Button size="sm" variant="danger" onClick={() => setAsk(!ask)}>Cancel session</Button>}
        </div>
        {ask && (
          <div className="rounded-lg bg-rose-50 p-3 text-[0.8125rem] text-rose-900">
            Cancel this session? It comes off the booking page.{hasBookings ? " The bookings stay here so you can contact people and move or refund them — nobody is emailed automatically." : ""}
            <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => setAsk(false)}>Keep it</Button><Button size="sm" variant="danger" disabled={pending} onClick={() => go(() => updateSession(s.id, { status: "cancelled" }), () => setAsk(false))}>Cancel session</Button></div>
          </div>
        )}
        {msg && <p className={cn("text-[0.78rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      </div>
    </div>
  );
}

export function PrintRoster() {
  return <Button onClick={() => window.print()}><Printer className="h-4 w-4" />Print roster</Button>;
}
