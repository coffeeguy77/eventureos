"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { addTicketTab, deleteTicketTab, updateTicketTab } from "@/app/(app)/nerd-herd/actions";

export interface TabRow { id: string; name: string; assigned_to: string | null; done: boolean }
const IDEAS = ["Domain", "Hosting", "Email", "Website", "Updates", "Billing"];

/** The ticket's tabs: one per issue, each with its own person. Pick a tab to see and add to just that issue. */
export function TicketTabs({ ticketId, tabs, active, members, me }: { ticketId: string; tabs: TabRow[]; active: string | null; members: { id: string; name: string }[]; me: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ name: "", assignedTo: me as string | null });
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => { const r = await fn(); setErr(r.ok ? null : r.error ?? "Not saved."); if (r.ok) after?.(); router.refresh(); });
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Unassigned";
  const cur = tabs.find((t) => t.id === active) ?? null;
  const href = (id: string | null) => `/nerd-herd/tickets/${ticketId}${id ? `?tab=${id}` : ""}`;
  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <Link href={href(null)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium ring-1", !active ? "bg-ink text-surface ring-ink" : "bg-surface text-ink-muted ring-line hover:text-ink")}>Everything</Link>
        {tabs.map((t) => (
          <Link key={t.id} href={href(t.id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium ring-1", active === t.id ? "bg-ink text-surface ring-ink" : "bg-surface text-ink ring-line", t.done && active !== t.id && "text-ink-faint line-through")}>
            {t.done && <Check className="h-3.5 w-3.5" />}{t.name}<span className={cn("font-normal", active === t.id ? "text-surface/70" : "text-ink-muted")}>· {t.assigned_to ? name(t.assigned_to).split(" ")[0] : "unassigned"}</span>
          </Link>
        ))}
        <button onClick={() => setAdding(!adding)} className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium text-brand-600 ring-1 ring-line"><Plus className="h-3.5 w-3.5" />Tab</button>
      </div>
      {adding && (
        <div className="space-y-2 rounded-lg bg-canvas p-3 ring-1 ring-line">
          <div className="flex flex-wrap gap-1.5">{IDEAS.filter((x) => !tabs.some((t) => t.name === x)).map((x) => <button key={x} onClick={() => setV({ ...v, name: x })} className={cn("rounded-full px-2.5 py-1 text-[0.75rem] ring-1", v.name === x ? "bg-surface text-ink ring-brand-500" : "text-ink-muted ring-line")}>{x}</button>)}</div>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-[10rem] flex-1" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Tab name, e.g. Domain" />
            <Select className="w-48" value={v.assignedTo ?? ""} onChange={(e) => setV({ ...v, assignedTo: e.target.value || null })}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
            <Button size="sm" variant="primary" disabled={pending || !v.name.trim()} onClick={() => run(() => addTicketTab(ticketId, v.name, v.assignedTo), () => { setAdding(false); setV({ name: "", assignedTo: me }); })}>Add tab</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
      {cur && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-[0.8125rem] ring-1 ring-line">
          <b className="text-ink">{cur.name}</b>
          <Select className="h-8 w-48" value={cur.assigned_to ?? ""} disabled={pending} onChange={(e) => run(() => updateTicketTab(cur.id, { assigned_to: e.target.value || null }))}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          <Button size="sm" variant={cur.done ? "secondary" : "primary"} disabled={pending} onClick={() => run(() => updateTicketTab(cur.id, { done: !cur.done }))}><Check className="h-3.5 w-3.5" />{cur.done ? "Reopen" : "Mark this tab done"}</Button>
          <button className="ml-auto text-ink-faint hover:text-rose-700" disabled={pending} onClick={() => run(() => deleteTicketTab(cur.id), () => router.push(href(null)))} aria-label="Remove tab"><Trash2 className="h-4 w-4" /></button>
        </div>
      )}
      {err && <p className="text-[0.75rem] text-rose-700">{err}</p>}
    </div>
  );
}
