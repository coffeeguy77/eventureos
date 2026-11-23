"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Pause, Play, Plus, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { money } from "@/lib/format";
import { fmtHours, packPrice } from "@/lib/nerdherd/care";
import { updateTicket } from "@/app/(app)/nerd-herd/actions";
import { discardTimer, giveHours, saveCareSettings, startTimer, stopTimer, voidBlock } from "@/app/(app)/nerd-herd/care-actions";

/* ------------------------------------------------------------------ the work timer (ticket header) */

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(r).padStart(2, "0")}`;
};

export function WorkTimer({ ticketId, running }: { ticketId: string; running: { ticketId: string; number: number | null; startedAt: string } | null }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [stopping, setStopping] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const here = running?.ticketId === ticketId;
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setErr(null); const r = await fn(); if (!r.ok) setErr(r.error ?? "Something went wrong."); else { setStopping(false); setNote(""); router.refresh(); } });

  if (here && running) {
    const elapsed = now - Date.parse(running.startedAt);
    return (
      <div className="relative">
        <div className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 py-0.5 pl-2.5 pr-1 text-[0.75rem] font-semibold text-white">
          <span className="relative mr-0.5 flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
          <span className="tabular-nums">{clock(elapsed)}</span>
          <button type="button" onClick={() => setStopping((x) => !x)} className="ml-1 inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 hover:bg-white/25"><Pause className="h-3 w-3" />Stop</button>
        </div>
        {stopping && (
          <div className="absolute right-0 top-full z-20 mt-2 w-[300px] max-w-[calc(100vw-2rem)] space-y-2 rounded-xl bg-surface p-3 shadow-xl ring-1 ring-line">
            <p className="text-[0.75rem] text-ink-muted">Logs {Math.max(1, Math.ceil(elapsed / 60000))} min on this ticket (internal). On a prepaid-hours request it comes off the client&apos;s block.</p>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you did (optional, internal)" />
            <FormError message={err} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={pending} onClick={() => go(() => stopTimer(note || null))}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Log time</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(() => discardTimer())}>Discard</Button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {running && <Link href={`/nerd-herd/tickets/${running.ticketId}`} className="text-[0.75rem] text-ink-muted hover:underline">Timer on #{running.number ?? "…"}</Link>}
      <button type="button" disabled={pending} onClick={() => go(() => startTimer(ticketId))} title={running ? "Stops the other timer (logging its time) and starts this one" : "Start timing this ticket"}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.75rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-canvas disabled:opacity-50">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : running ? <Timer className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{running ? "Switch timer here" : "Start timer"}
      </button>
      {err && <span className="text-[0.75rem] text-rose-600">{err}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ how a ticket is paid for (right column) */

export function BillingPicker({ id, billing, hasClient, block, charged, logged, currency }: {
  id: string; billing: "block" | "quote" | null; hasClient: boolean; currency: string;
  block: { leftMin: number; boughtMin: number; pendingMin: number } | null; charged: number; logged: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  void currency;
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="tc-billing">Paid by</Label>
        <Select id="tc-billing" defaultValue={billing ?? ""} disabled={pending || !hasClient} onChange={(e) => start(async () => {
          setErr(null);
          const r = await updateTicket(id, { billing: (e.target.value || null) as "block" | "quote" | null });
          if (!r.ok) setErr(r.error); else router.refresh();
        })}>
          <option value="">Billed as usual (time or plan)</option>
          <option value="block">Client&apos;s prepaid hours</option>
          <option value="quote">Quote first (one-off job)</option>
        </Select>
        {!hasClient && <p className="mt-1 text-[0.75rem] text-ink-muted">Choose the client first.</p>}
      </div>
      <FormError message={err} />
      {billing === "block" && (
        block ? (
          <div className="rounded-lg bg-canvas px-3 py-2.5 text-[0.8125rem] ring-1 ring-line">
            <p className="flex justify-between gap-2"><span className="text-ink-muted">This request</span><span className="font-semibold text-ink">{fmtHours(charged)}{logged && charged > logged ? <span className="font-normal text-ink-faint"> ({fmtHours(logged)} worked, 1-hr min)</span> : null}</span></p>
            <p className="mt-1 flex justify-between gap-2"><span className="text-ink-muted">Client has left</span><span className={`font-semibold ${block.leftMin < 0 ? "text-rose-600" : block.leftMin < 60 ? "text-amber-600" : "text-ink"}`}>{fmtHours(block.leftMin)}</span></p>
            {block.pendingMin > 0 && <p className="mt-1 text-[0.75rem] text-amber-700">{fmtHours(block.pendingMin)} more once their invoice is paid.</p>}
            {block.leftMin < 0 && <p className="mt-1.5 text-[0.75rem] text-rose-600">Over their hours — ask them to top up before doing more.</p>}
          </div>
        ) : <p className="text-[0.75rem] text-amber-700">Run update 0115 (Care Hub) to use prepaid hours.</p>
      )}
      {billing === "quote" && <p className="text-[0.75rem] text-ink-muted">Send a quote above — work starts once it&apos;s paid.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Care Hub settings and hours by hand */

export function CareSettingsForm({ initial, rate, currency }: { initial: { enabled: boolean; packs: { hours: number; discountPct: number }[]; adsFeeExGst: number | null }; rate: number; currency: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [packs, setPacks] = useState(initial.packs.map((p) => ({ hours: String(p.hours), discount: String(p.discountPct) })));
  const [adsAsk, setAdsAsk] = useState(initial.adsFeeExGst === null);
  const [fee, setFee] = useState(initial.adsFeeExGst === null ? "" : String(initial.adsFeeExGst));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-[0.8438rem] text-ink"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-brand-500" />Offer prepaid hours in client portals</label>
      <div>
        <p className="text-[0.8125rem] font-medium text-ink">Blocks on sale</p>
        <p className="text-[0.75rem] text-ink-muted">Priced from your hourly rate ({money(rate, currency)} + GST) less the discount.</p>
        <div className="mt-2 space-y-2">
          {packs.map((p, i) => {
            const pr = packPrice({ hours: Number(p.hours) || 0, discountPct: Number(p.discount) || 0 }, rate);
            return (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="w-24"><Label htmlFor={`pk-h-${i}`}>Hours</Label><Input id={`pk-h-${i}`} inputMode="decimal" value={p.hours} onChange={(e) => setPacks((x) => x.map((y, j) => (j === i ? { ...y, hours: e.target.value } : y)))} /></div>
                <div className="w-24"><Label htmlFor={`pk-d-${i}`}>Discount %</Label><Input id={`pk-d-${i}`} inputMode="numeric" value={p.discount} onChange={(e) => setPacks((x) => x.map((y, j) => (j === i ? { ...y, discount: e.target.value } : y)))} /></div>
                <p className="pb-2 text-[0.8125rem] text-ink-muted">{money(pr.exGst, currency)} + GST = <span className="font-medium text-ink">{money(pr.incGst, currency)}</span></p>
                {packs.length > 1 && <button type="button" onClick={() => setPacks((x) => x.filter((_, j) => j !== i))} aria-label="Remove block" className="mb-1.5 rounded p-1 text-ink-faint hover:text-ink"><X className="h-4 w-4" /></button>}
              </div>
            );
          })}
        </div>
        {packs.length < 6 && <button type="button" onClick={() => setPacks((x) => [...x, { hours: "", discount: "0" }])} className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-brand-600"><Plus className="h-3.5 w-3.5" />Add a block</button>}
      </div>
      <div>
        <p className="text-[0.8125rem] font-medium text-ink">Google Ads add-on</p>
        <label className="mt-1 flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={adsAsk} onChange={(e) => setAdsAsk(e.target.checked)} className="h-4 w-4 accent-brand-500" />Don&apos;t show a price — clients ask us</label>
        {!adsAsk && <div className="mt-2 w-40"><Label htmlFor="ads-fee">Monthly fee (ex GST)</Label><Input id="ads-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></div>}
      </div>
      {msg && <p role="status" className={`text-[0.7812rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.t}</p>}
      <Button variant="primary" disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        const r = await saveCareSettings({ enabled, packs: packs.map((p) => ({ hours: Number(p.hours), discount_pct: Number(p.discount) })), ads_fee_ex_gst: adsAsk ? null : Number(fee) });
        setMsg(r.ok ? { ok: true, t: "Saved." } : { ok: false, t: r.error });
        if (r.ok) router.refresh();
      })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</Button>
    </div>
  );
}

export function GiveHours({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [client, setClient] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const id = clients.find((c) => c.name.toLowerCase() === client.trim().toLowerCase())?.id ?? "";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
        <div><Label htmlFor="gh-client">Client</Label><Input id="gh-client" list="gh-clients" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Start typing a name" /><datalist id="gh-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist></div>
        <div><Label htmlFor="gh-hours">Hours</Label><Input id="gh-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 5" /></div>
      </div>
      <div><Label htmlFor="gh-note">Why (the client sees this)</Label><Input id="gh-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Prepaid before the Care Hub — invoice 1234" /></div>
      {msg && <p role="status" className={`text-[0.7812rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.t}</p>}
      <Button size="sm" disabled={pending || !id} onClick={() => start(async () => {
        setMsg(null);
        const r = await giveHours(id, Number(hours), note);
        setMsg(r.ok ? { ok: true, t: `Added ${hours} hours.` } : { ok: false, t: r.error });
        if (r.ok) { setHours(""); setNote(""); router.refresh(); }
      })}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Add hours</Button>
    </div>
  );
}

export function VoidBlockButton({ id }: { id: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  if (!sure) return <button type="button" onClick={() => setSure(true)} className="text-[0.75rem] text-ink-faint hover:text-rose-600">Remove</button>;
  return (
    <span className="inline-flex items-center gap-2 text-[0.75rem]">
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await voidBlock(id); if (r.ok) router.refresh(); })} className="font-medium text-rose-600">{pending ? "Removing…" : "Remove these hours"}</button>
      <button type="button" onClick={() => setSure(false)} className="text-ink-muted">Keep</button>
    </span>
  );
}
