"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { quickMachineCustomer } from "@/app/(app)/machines/actions";

export interface Cust { id: string; name: string; company: string | null; email: string | null; phone: string | null; address: string | null }

/** Choose an existing client (type to search name, company, email or phone) or add a new one on the spot. */
export function CustomerChooser({ customers, value, onChange, prefill }: {
  customers: Cust[]; value: string | null; onChange: (c: Cust | null) => void;
  /** details to start a new client with (e.g. from a website enquiry) */
  prefill?: Partial<Cust>;
}) {
  const [list, setList] = useState(customers);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [c, setC] = useState({ name: prefill?.name ?? "", company: prefill?.company ?? "", email: prefill?.email ?? "", phone: prefill?.phone ?? "", address: prefill?.address ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = list.find((x) => x.id === value) ?? null;
  const hits = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return list.slice(0, 8);
    const digits = k.replace(/\D/g, "");
    return list.filter((x) => [x.name, x.company, x.email].some((v) => v?.toLowerCase().includes(k)) || (digits.length >= 4 && (x.phone ?? "").replace(/\D/g, "").includes(digits))).slice(0, 12);
  }, [q, list]);

  if (adding) {
    return (
      <div className="space-y-2 rounded-xl bg-canvas p-3 ring-1 ring-line">
        <p className="text-[0.8125rem] font-semibold text-ink">New client</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label="Name" placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          <Input aria-label="Business" placeholder="Business (optional)" value={c.company} onChange={(e) => setC({ ...c, company: e.target.value })} />
          <Input aria-label="Email" type="email" placeholder="Email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
          <Input aria-label="Phone" type="tel" placeholder="Phone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
          <Input aria-label="Address" placeholder="Address (optional)" className="sm:col-span-2" value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} />
        </div>
        {err && <p className="text-[0.8125rem] text-rose-600">{err}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="primary" disabled={pending || !c.name.trim()} onClick={() => start(async () => {
            setErr(null);
            const r = await quickMachineCustomer(c);
            if (!r.ok) { setErr(r.error); return; }
            setList((all) => (all.some((x) => x.id === r.data.id) ? all : [...all, r.data].sort((a, b) => a.name.localeCompare(b.name))));
            onChange(r.data); setAdding(false); setQ("");
          })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Add client</Button>
          <Button size="sm" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      </div>
    );
  }
  if (chosen) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-canvas p-3 ring-1 ring-line">
        <div className="min-w-0 flex-1 text-[0.8125rem]">
          <p className="font-semibold text-ink">{chosen.name}{chosen.company && chosen.company !== chosen.name ? <span className="font-normal text-ink-muted"> · {chosen.company}</span> : null}</p>
          <p className="truncate text-ink-muted">{[chosen.email, chosen.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
          {chosen.address && <p className="truncate text-ink-muted">{chosen.address}</p>}
        </div>
        <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-ink-muted hover:text-ink"><X className="h-3.5 w-3.5" />Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Label htmlFor="mc-client">Client</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input id="mc-client" className="pl-9" placeholder="Search name, business, email or phone" value={q} autoComplete="off"
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
        </div>
        <Button type="button" onClick={() => { setC((o) => ({ ...o, name: o.name || q })); setAdding(true); }}><UserPlus className="h-4 w-4" />New</Button>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line">
          {hits.length ? hits.map((x) => (
            <button key={x.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(x); setOpen(false); setQ(""); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-canvas">
              <span className="block text-[0.8125rem] font-medium text-ink">{x.name}{x.company && x.company !== x.name ? <span className="font-normal text-ink-muted"> · {x.company}</span> : null}</span>
              <span className="block truncate text-[0.75rem] text-ink-muted">{[x.email, x.phone].filter(Boolean).join(" · ")}</span>
            </button>
          )) : (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setC((o) => ({ ...o, name: q })); setAdding(true); }} className="block w-full rounded-lg px-3 py-2 text-left text-[0.8125rem] text-brand-700 hover:bg-canvas">No match — add “{q}” as a new client</button>
          )}
        </div>
      )}
    </div>
  );
}
