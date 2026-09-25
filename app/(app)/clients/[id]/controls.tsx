"use client";

import { useActionState, useState, useTransition } from "react";
import { Mail, Pencil, Phone, Plus, Star, Trash2 } from "lucide-react";
import { removeContact, saveContact, setPrimaryContact, updateCustomerDetails, type FormState } from "./actions";
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
        <button onClick={() => setEditing(true)} className="absolute -top-10 right-5 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-600 hover:text-brand-700">
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
      <div className="sm:col-span-2"><Label htmlFor="c-phone">Phone</Label><Input id="c-phone" name="phone" defaultValue={customer.phone ?? ""} /></div>
      <div className="sm:col-span-4"><Label htmlFor="c-address">Address</Label><Input id="c-address" name="address" defaultValue={customer.address ?? ""} /></div>
      <div className="sm:col-span-6"><Label htmlFor="c-tags" hint="Comma separated">Tags</Label><Input id="c-tags" name="tags" defaultValue={customer.tags.join(", ")} placeholder="e.g. VIP, Corporate, Repeat" /></div>
      <div className="sm:col-span-6"><Label htmlFor="c-notes" hint="Team only">Client notes</Label><Textarea id="c-notes" name="notes" rows={3} defaultValue={customer.notes ?? ""} /></div>
      <div className="sm:col-span-6"><FormError message={state?.error} /></div>
      <div className="flex justify-end gap-2 sm:col-span-6">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
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
      {contacts.length === 0 && editing !== "new" && <p className="text-[12.5px] text-ink-muted">No contacts yet.</p>}
      <ul className="space-y-1">
        {contacts.map((ct) => editing === ct.id ? (
          <li key={ct.id}><ContactForm customerId={customerId} contact={ct} onDone={() => setEditing(null)} /></li>
        ) : (
          <li key={ct.id} className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-zinc-50/80">
            <Avatar name={`${ct.first_name} ${ct.last_name ?? ""}`} size={30} />
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium text-ink">
                {ct.first_name} {ct.last_name}
                {ct.is_primary && <Badge tone="brand">Primary</Badge>}
                {ct.portal_user_id && <Badge tone="green">Portal access</Badge>}
              </p>
              {ct.position && <p className="text-[12px] text-ink-muted">{ct.position}</p>}
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-ink-muted">
                {ct.email && <a href={`mailto:${ct.email}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Mail className="h-3 w-3" />{ct.email}</a>}
                {ct.phone && <a href={`tel:${ct.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Phone className="h-3 w-3" />{ct.phone}</a>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {!ct.is_primary && (
                <button type="button" disabled={pending} title="Make primary contact" aria-label={`Make ${ct.first_name} the primary contact`}
                  onClick={() => run(() => setPrimaryContact(customerId, ct.id))}
                  className="rounded-md p-1.5 text-ink-faint hover:bg-white hover:text-brand-700"><Star className="h-3.5 w-3.5" /></button>
              )}
              <button type="button" title="Edit contact" aria-label={`Edit ${ct.first_name}`} onClick={() => { setError(undefined); setEditing(ct.id); }}
                className="rounded-md p-1.5 text-ink-faint hover:bg-white hover:text-ink"><Pencil className="h-3.5 w-3.5" /></button>
              {canRemove && (
                <button type="button" disabled={pending} title="Remove contact" aria-label={`Remove ${ct.first_name}`}
                  onClick={() => { if (confirm(`Remove ${ct.first_name} ${ct.last_name ?? ""} from this client?`)) run(() => removeContact(customerId, ct.id)); }}
                  className="rounded-md p-1.5 text-ink-faint hover:bg-white hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <div className="mt-2"><FormError message={error} /></div>}
      {editing === "new" ? (
        <div className="mt-2"><ContactForm customerId={customerId} onDone={() => setEditing(null)} firstContact={contacts.length === 0} /></div>
      ) : (
        <button onClick={() => { setError(undefined); setEditing("new"); }} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-600 hover:text-brand-700">
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
      <div><Label htmlFor={`ph-${k}`}>Phone</Label><Input id={`ph-${k}`} name="phone" defaultValue={contact?.phone ?? ""} /></div>
      <div className="sm:col-span-2"><Label htmlFor={`po-${k}`}>Position</Label><Input id={`po-${k}`} name="position" defaultValue={contact?.position ?? ""} placeholder="e.g. Events Manager, Bride" /></div>
      {!contact && !firstContact && (
        <label className="flex items-center gap-2 text-[12.5px] text-ink sm:col-span-2">
          <input type="checkbox" name="is_primary" className="h-4 w-4 rounded border-line-strong text-brand-600" /> Make this the primary contact
        </label>
      )}
      {state?.error && <div className="sm:col-span-2"><FormError message={state.error} /></div>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : contact ? "Save contact" : "Add contact"}</Button>
      </div>
    </form>
  );
}
