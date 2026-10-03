"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Pencil, Phone, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { applyDetailUpdate, dismissDetailUpdate, fillFromXero, removeContact, saveContact, setPrimaryContact, updateCustomerDetails, type FormState } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";

export interface CustomerEditable {
  id: string; name: string; company: string | null; kind: "individual" | "company"; email: string | null;
  phone: string | null; address: string | null; tags: string[]; notes: string | null;
}

export function CustomerDetailsEditor({ customer, view }: { customer: CustomerEditable; view: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await updateCustomerDetails(customer.id, prev, fd);
    if (!res?.error) setEditing(false);
    return res;
  }, undefined);

  if (!editing) {
    return (
      <div className="relative">
        <button onClick={() => setEditing(true)} className="absolute -top-11 right-3 inline-flex h-10 items-center gap-1 px-2 text-[0.7812rem] sm:-top-10 sm:right-5 sm:h-auto sm:px-0 font-medium text-brand-600 hover:text-brand-700">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        {view}
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4 px-5 pb-5 sm:grid-cols-6">
      <div className="sm:col-span-4"><Label htmlFor="c-name">Name</Label><Input id="c-name" name="name" defaultValue={customer.name} required /></div>
      <div className="sm:col-span-2">
        <Label htmlFor="c-kind">Type</Label>
        <Select id="c-kind" name="kind" defaultValue={customer.kind}><option value="individual">Individual</option><option value="company">Company</option></Select>
      </div>
      <div className="sm:col-span-3"><Label htmlFor="c-company">Company</Label><Input id="c-company" name="company" defaultValue={customer.company ?? ""} /></div>
      <div className="sm:col-span-3"><Label htmlFor="c-email">Email</Label><Input id="c-email" name="email" type="email" defaultValue={customer.email ?? ""} /></div>
      <div className="sm:col-span-2"><Label htmlFor="c-phone">Phone</Label><Input id="c-phone" name="phone" type="tel" defaultValue={customer.phone ?? ""} /></div>
      <div className="sm:col-span-4"><Label htmlFor="c-address" hint="Shown on quotes and invoices">Address</Label><Textarea id="c-address" name="address" rows={3} defaultValue={customer.address ?? ""} placeholder={"Street\nSuburb STATE Postcode"} /></div>
      <div className="sm:col-span-6"><Label htmlFor="c-tags" hint="Comma separated">Tags</Label><Input id="c-tags" name="tags" defaultValue={customer.tags.join(", ")} placeholder="e.g. VIP, Corporate, Repeat" /></div>
      <div className="sm:col-span-6"><Label htmlFor="c-notes" hint="Team only">Client notes</Label><Textarea id="c-notes" name="notes" rows={3} defaultValue={customer.notes ?? ""} /></div>
      <div className="sm:col-span-6"><FormError message={state?.error} /></div>
      <div className="flex justify-end gap-2 sm:col-span-6">
        <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" variant="primary" className="h-10 flex-1 sm:h-8 sm:flex-none" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}

export interface ContactRow {
  id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null;
  position: string | null; is_primary: boolean; portal_user_id: string | null;
}

export function ContactsManager({ customerId, contacts, canRemove }: { customerId: string; contacts: ContactRow[]; canRemove: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<FormState>) => start(async () => {
    setError(undefined);
    const res = await fn();
    if (res?.error) setError(res.error);
  });

  return (
    <div className="px-5 pb-5">
      {contacts.length === 0 && editing !== "new" && <p className="text-[0.7812rem] text-ink-muted">No contacts yet.</p>}
      <ul className="space-y-1">
        {contacts.map((ct) => editing === ct.id ? (
          <li key={ct.id}><ContactForm customerId={customerId} contact={ct} onDone={() => setEditing(null)} /></li>
        ) : (
          <li key={ct.id} className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-zinc-50/80">
            <Avatar name={`${ct.first_name} ${ct.last_name ?? ""}`} size={30} />
            <div className="min-w-0 flex-1 text-[0.8125rem]">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium text-ink">
                {ct.first_name} {ct.last_name}
                {ct.is_primary && <Badge tone="brand">Primary</Badge>}
                {ct.portal_user_id && <Badge tone="green">Portal access</Badge>}
              </p>
              {ct.position && <p className="text-[0.75rem] text-ink-muted">{ct.position}</p>}
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[0.75rem] text-ink-muted">
                {ct.email && <a href={`mailto:${ct.email}`} className="inline-flex min-w-0 items-center gap-1 py-0.5 hover:text-brand-700"><Mail className="h-3 w-3 shrink-0" /><span className="min-w-0 break-all">{ct.email}</span></a>}
                {ct.phone && <a href={`tel:${ct.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 py-0.5 hover:text-brand-700"><Phone className="h-3 w-3" />{ct.phone}</a>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {!ct.is_primary && (
                <button type="button" disabled={pending} title="Make primary contact" aria-label={`Make ${ct.first_name} the primary contact`}
                  onClick={() => run(() => setPrimaryContact(customerId, ct.id))}
                  className="rounded-md p-2.5 text-ink-faint sm:p-1.5 hover:bg-surface hover:text-brand-700"><Star className="h-3.5 w-3.5" /></button>
              )}
              <button type="button" title="Edit contact" aria-label={`Edit ${ct.first_name}`} onClick={() => { setError(undefined); setEditing(ct.id); }}
                className="rounded-md p-2.5 text-ink-faint sm:p-1.5 hover:bg-surface hover:text-ink"><Pencil className="h-3.5 w-3.5" /></button>
              {canRemove && (
                <button type="button" disabled={pending} title="Remove contact" aria-label={`Remove ${ct.first_name}`}
                  onClick={() => { if (confirm(`Remove ${ct.first_name} ${ct.last_name ?? ""} from this client?`)) run(() => removeContact(customerId, ct.id)); }}
                  className="rounded-md p-2.5 text-ink-faint sm:p-1.5 hover:bg-surface hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <div className="mt-2"><FormError message={error} /></div>}
      {editing === "new" ? (
        <div className="mt-2"><ContactForm customerId={customerId} onDone={() => setEditing(null)} firstContact={contacts.length === 0} /></div>
      ) : (
        <button onClick={() => { setError(undefined); setEditing("new"); }} className="mt-2 inline-flex min-h-10 items-center gap-1 text-[0.7812rem] font-medium text-brand-600 hover:text-brand-700 sm:min-h-0">
          <Plus className="h-3.5 w-3.5" /> Add contact
        </button>
      )}
    </div>
  );
}

function ContactForm({ customerId, contact, onDone, firstContact }: { customerId: string; contact?: ContactRow; onDone: () => void; firstContact?: boolean }) {
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await saveContact(customerId, contact?.id ?? null, prev, fd);
    if (!res?.error) onDone();
    return res;
  }, undefined);
  const k = contact?.id ?? "new";
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-line bg-zinc-50/50 p-3 sm:grid-cols-2">
      <div><Label htmlFor={`fn-${k}`}>First name</Label><Input id={`fn-${k}`} name="first_name" defaultValue={contact?.first_name ?? ""} required autoFocus /></div>
      <div><Label htmlFor={`ln-${k}`}>Last name</Label><Input id={`ln-${k}`} name="last_name" defaultValue={contact?.last_name ?? ""} /></div>
      <div><Label htmlFor={`em-${k}`}>Email</Label><Input id={`em-${k}`} name="email" type="email" defaultValue={contact?.email ?? ""} /></div>
      <div><Label htmlFor={`ph-${k}`}>Phone</Label><Input id={`ph-${k}`} name="phone" type="tel" defaultValue={contact?.phone ?? ""} /></div>
      <div className="sm:col-span-2"><Label htmlFor={`po-${k}`}>Position</Label><Input id={`po-${k}`} name="position" defaultValue={contact?.position ?? ""} placeholder="e.g. Events Manager, Bride" /></div>
      {!contact && !firstContact && (
        <label className="flex items-center gap-2 text-[0.7812rem] text-ink sm:col-span-2">
          <input type="checkbox" name="is_primary" className="h-4 w-4 rounded border-line-strong text-brand-600" /> Make this the primary contact
        </label>
      )}
      {state?.error && <div className="sm:col-span-2"><FormError message={state.error} /></div>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" size="sm" variant="ghost" className="h-10 flex-1 sm:h-8 sm:flex-none" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" className="h-10 flex-1 sm:h-8 sm:flex-none" disabled={pending}>{pending ? "Saving…" : contact ? "Save contact" : "Add contact"}</Button>
      </div>
    </form>
  );
}


/** Fill this client's missing address, phone and contacts from their Xero contact (never overwrites). */
export function FillFromXeroButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => {
        const r = await fillFromXero(customerId).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
        setMsg(r.ok ? { text: r.message, ok: true } : { text: r.error, ok: false });
        if (r.ok) router.refresh();
      })} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline disabled:opacity-60">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Fill gaps from Xero
      </button>
      {msg && <span className={msg.ok ? "text-ink-muted" : "text-rose-700"}>{msg.text}</span>}
    </span>
  );
}

export interface PendingDetailUpdate {
  threadId: string; subject: string | null; from: string; at: string; quote: string | null;
  changes: { field: string; label: string; from: string | null; to: string }[];
}

/** "Kim asked to update their address" — review the change from the email and apply it. */
export function DetailUpdateBanner({ u, href, when }: { u: PendingDetailUpdate; href: string; when: string }) {
  const router = useRouter();
  const [pick, setPick] = useState<string[]>(u.changes.map((c) => c.field));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => start(async () => {
    setErr(null);
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) setErr(r.error); else router.refresh();
  });
  return (
    <div className="rounded-xl bg-sky-50/70 px-4 py-3 text-[0.8125rem] text-sky-950 ring-1 ring-inset ring-sky-200">
      <p className="font-semibold">{u.from} asked to update their details <span className="font-normal text-sky-800">· {when}</span></p>
      {u.quote && <p className="mt-0.5 italic text-sky-900">“{u.quote}”</p>}
      <ul className="mt-2 space-y-1.5">
        {u.changes.map((c) => (
          <li key={c.field}>
            <label className="flex cursor-pointer items-start gap-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={pick.includes(c.field)}
                onChange={(e) => setPick((p) => e.target.checked ? [...p, c.field] : p.filter((x) => x !== c.field))} />
              <span className="min-w-0">
                <span className="font-medium">{c.label}:</span>{" "}
                {c.from && <span className="whitespace-pre-line text-ink-faint line-through">{c.from}</span>}{c.from && " → "}
                <span className="whitespace-pre-line font-medium">{c.to}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {err && <p className="mt-1.5 text-rose-700">{err}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={pending || !pick.length} onClick={() => run(() => applyDetailUpdate(u.threadId, pick))}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}Apply {pick.length === u.changes.length ? "" : "ticked "}change{pick.length === 1 ? "" : "s"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => dismissDetailUpdate(u.threadId))}>Dismiss</Button>
        <a href={href} className="text-[0.75rem] font-medium text-sky-800 hover:underline">Read the email</a>
      </div>
    </div>
  );
}
