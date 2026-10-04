"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { approveDraftInvoice, saveAgency } from "@/app/(app)/bookings/actions";
import { searchClientsForAgency } from "@/app/(app)/bookings/client-search";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const fail = { ok: false as const, error: "Couldn't reach the server." };

interface Agency { id: string; name: string; code: string; customer_id: string | null; customer_name: string | null; price: number | null; contact_label: string; po_label: string; site_label: string; po_required: boolean; notify_email: string | null; active: boolean }

export function AgencyEditor({ agency }: { agency: Agency | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: agency?.name ?? "", code: agency?.code ?? "", customer_id: agency?.customer_id ?? "", customer_name: agency?.customer_name ?? "", price: agency?.price == null ? "" : String(agency.price),
    contact_label: agency?.contact_label ?? "Contact", po_label: agency?.po_label ?? "Purchase Order :", site_label: agency?.site_label ?? "Purchasing Site", po_required: agency?.po_required ?? true, notify_email: agency?.notify_email ?? "", active: agency?.active ?? true });
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; xero: boolean }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (search.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => { searchClientsForAgency(search).then(setHits).catch(() => setHits([])); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  if (!open) {
    return agency ? (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-card hover:border-brand-200">
        <Building2 className="h-4 w-4 shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1"><span className="block truncate text-[0.875rem] font-semibold text-ink">{agency.name}</span><span className="block text-[0.75rem] text-ink-muted">Code {agency.code} · bills {agency.customer_name ?? <b className="text-amber-700">no client linked</b>}{agency.price != null ? ` · $${agency.price}` : ""}</span></span>
        {!agency.active && <Badge tone="slate">Off</Badge>}
        <ChevronDown className="h-4 w-4 text-ink-faint" />
      </button>
    ) : <Button onClick={() => setOpen(true)} className="w-full"><Plus className="h-4 w-4" />Add an agency</Button>;
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-3"><Label>Agency name</Label><Input value={f.name} onChange={set("name")} placeholder="Sureway Employment & Training" /></div>
        <div className="sm:col-span-3"><Label hint="they type this at checkout">Agency code</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="e.g. your existing WooCommerce coupon" /></div>
        <div className="sm:col-span-4"><Label hint="the invoice goes to this client">Bill to</Label>
          {f.customer_id ? (
            <div className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-[0.8438rem]"><Check className="h-4 w-4 text-emerald-600" /><span className="flex-1 truncate">{f.customer_name}</span><button type="button" className="text-[0.75rem] text-brand-700" onClick={() => setF({ ...f, customer_id: "", customer_name: "" })}>Change</button></div>
          ) : (
            <div className="relative">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your clients…" />
              {hits.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-surface p-1 shadow-pop ring-1 ring-line">
                  {hits.map((h) => <li key={h.id}><button type="button" onClick={() => { setF({ ...f, customer_id: h.id, customer_name: h.name }); setSearch(""); setHits([]); }} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[0.8125rem] hover:bg-zinc-50">{h.name}{h.xero && <span className="text-[0.6875rem] text-emerald-700">in Xero</span>}</button></li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="sm:col-span-2"><Label hint="else the course's">Price ($)</Label><Input inputMode="decimal" value={f.price} onChange={set("price")} /></div>
        <div className="sm:col-span-2"><Label hint="invoice wording">PO label</Label><Input value={f.po_label} onChange={set("po_label")} placeholder="EF Purchase Order :" /></div>
        <div className="sm:col-span-2"><Label hint="invoice wording">Site label</Label><Input value={f.site_label} onChange={set("site_label")} /></div>
        <div className="sm:col-span-2"><Label hint="invoice wording">Contact label</Label><Input value={f.contact_label} onChange={set("contact_label")} placeholder="Sureway Contact" /></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.po_required} onChange={set("po_required")} />Purchase order number required</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={set("active")} />Code works</label>
      </div>
      {msg && <p className={cn("mt-2 text-[0.8125rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      <div className="mt-3 flex gap-2">
        <Button onClick={() => setOpen(false)}>Close</Button>
        <Button variant="primary" disabled={pending} onClick={() => start(async () => {
          setMsg(null);
          const r = await saveAgency({ ...f, id: agency?.id ?? null, customer_id: f.customer_id || null }).catch(() => fail);
          setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
          if (r.ok) { if (!agency) setOpen(false); router.refresh(); }
        })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
      </div>
    </div>
  );
}

export function ApproveInvoice({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button size="sm" variant="primary" disabled={pending || msg?.ok} onClick={() => start(async () => { const r = await approveDraftInvoice(id).catch(() => fail); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); if (r.ok) router.refresh(); })}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Approve
      </Button>
      {msg && <span className={cn("max-w-[220px] text-right text-[0.72rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</span>}
    </span>
  );
}
