"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Building2, Check, Loader2, Plus, Search, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { addCustomerQuick } from "@/app/(app)/invoices/quick/actions";

export interface PickerCustomer { id: string; name: string; company?: string | null; email?: string | null }

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@. ]+/g, " ").replace(/\s+/g, " ").trim();
const TITLES = /^(dr|mr|mrs|ms|miss|prof|professor|the)\s+/;

/**
 * Choose a customer by typing any part of their name, company or email ("pam" finds "Dr Pam Connor"), or add a new one
 * on the spot. Keeps a hidden input called `name` for forms.
 */
export function CustomerPicker({ customers, value, onChange, name, required, onAdded, placeholder = "Search by name, company or email…", id }: {
  customers: PickerCustomer[]; value: string; onChange: (id: string) => void; name?: string; required?: boolean;
  onAdded?: (c: PickerCustomer) => void; placeholder?: string; id?: string;
}) {
  const [extra, setExtra] = useState<PickerCustomer[]>([]);
  const all = useMemo(() => [...extra.filter((e) => !customers.some((c) => c.id === e.id)), ...customers], [customers, extra]);
  const chosen = all.find((c) => c.id === value) ?? null;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [adding, setAdding] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);

  const hits = useMemo(() => {
    const t = norm(q);
    if (!t) return all.slice(0, 50);
    const words = t.split(" ");
    const scored: { c: PickerCustomer; s: number }[] = [];
    for (const c of all) {
      const nm = norm(c.name), hay = `${nm} ${norm(c.company ?? "")} ${norm(c.email ?? "")}`;
      if (!words.every((w) => hay.includes(w))) continue;
      const bare = nm.replace(TITLES, "");
      const s = nm === t || bare === t ? 0 : nm.startsWith(t) || bare.startsWith(t) ? 1 : nm.split(" ").some((w) => w.startsWith(words[0])) ? 2 : 3;
      scored.push({ c, s });
    }
    return scored.sort((a, b) => a.s - b.s || a.c.name.localeCompare(b.c.name)).slice(0, 50).map((x) => x.c);
  }, [q, all]);

  const pick = (c: PickerCustomer) => { onChange(c.id); setQ(""); setOpen(false); setAdding(false); };

  return (
    <div ref={box} className="relative">
      {name && <input type="hidden" name={name} value={value} required={required} />}
      {chosen && !open ? (
        <div className="flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-1.5">
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="min-w-0 flex-1"><span className="block truncate text-[0.875rem] font-medium text-ink">{chosen.name}</span>{chosen.email && <span className="block truncate text-[0.75rem] text-ink-muted">{chosen.email}</span>}</span>
          <button type="button" onClick={() => { setOpen(true); setHi(0); }} className="shrink-0 rounded-md px-2 py-1 text-[0.8125rem] font-medium text-brand-700 hover:bg-canvas dark:text-brand-300">Change</button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input id={id} value={q} autoFocus={open && !!chosen} placeholder={placeholder} autoComplete="off" className="pl-9"
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); setAdding(false); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Enter" && open && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
              else if (e.key === "Escape") setOpen(false);
            }} />
          {required && !value && <p className="sr-only">Choose a customer</p>}
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {!adding ? (
            <>
              <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
                {hits.map((c, i) => (
                  <li key={c.id}>
                    <button type="button" role="option" aria-selected={c.id === value} onMouseEnter={() => setHi(i)} onClick={() => pick(c)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8125rem] ${i === hi ? "bg-canvas" : ""}`}>
                      {c.company ? <Building2 className="h-4 w-4 shrink-0 text-ink-faint" /> : <User className="h-4 w-4 shrink-0 text-ink-faint" />}
                      <span className="min-w-0 flex-1 truncate"><span className="font-medium text-ink">{c.name}</span>{c.email && <span className="text-ink-muted"> · {c.email}</span>}</span>
                      {c.id === value && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                    </button>
                  </li>
                ))}
                {!hits.length && <li className="px-3 py-3 text-[0.8125rem] text-ink-muted">No customer matches &ldquo;{q}&rdquo;.</li>}
              </ul>
              <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-[0.8125rem] font-semibold text-brand-700 hover:bg-canvas dark:text-brand-300">
                <Plus className="h-4 w-4" />Add a new customer{q.trim() ? ` "${q.trim()}"` : ""}
              </button>
            </>
          ) : (
            <AddCustomer initialName={q} onCancel={() => setAdding(false)} onSaved={(c) => { setExtra((x) => [c, ...x]); onAdded?.(c); pick(c); }} />
          )}
        </div>
      )}
    </div>
  );
}

function AddCustomer({ initialName, onCancel, onSaved }: { initialName: string; onCancel: () => void; onSaved: (c: PickerCustomer) => void }) {
  const [f, setF] = useState({ name: initialName.trim(), company: "", email: "", phone: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setErr(null);
    const r = await addCustomerQuick(f).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
    if (!r.ok) { setErr(r.error); return; }
    onSaved({ id: r.data.id, name: r.data.name, company: f.company || null, email: f.email || null });
  });
  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center justify-between"><p className="text-[0.8125rem] font-semibold text-ink">New customer</p>
        <button type="button" onClick={onCancel} aria-label="Back to the list" className="rounded-md p-1 text-ink-faint hover:bg-canvas hover:text-ink"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label htmlFor="nc-name">Person&apos;s name</Label><Input id="nc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><Label htmlFor="nc-company" hint="if it's a business">Business</Label><Input id="nc-company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
        <div><Label htmlFor="nc-email">Email</Label><Input id="nc-email" type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><Label htmlFor="nc-phone" hint="optional">Phone</Label><Input id="nc-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      </div>
      <p className="text-[0.75rem] text-ink-muted">If you use Xero, they&apos;re added there when their first invoice is sent. An email that&apos;s already a customer picks that customer instead.</p>
      {err && <p className="text-[0.75rem] font-medium text-rose-600 dark:text-rose-300">{err}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="primary" disabled={pending || !(f.name.trim() || f.company.trim())} onClick={save}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Add customer</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
