"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, Loader2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { setInvoiceBonus } from "@/app/(app)/my-bonuses/actions";
import type { BonusKind } from "@/lib/bonuses/core";

/** Who made this sale, and whether it's a new build or maintenance — their bonus is worked out as the invoice is paid. */
export function InvoiceBonus({ invoiceId, people, current, exGst, currency, locked }: {
  invoiceId: string; people: { id: string; name: string; build: number; maintenance: number }[];
  current: { userId: string; kind: BonusKind; rate: number; status: string } | null; exGst: number; currency: string; locked: boolean;
}) {
  const router = useRouter();
  const [who, setWho] = useState(current?.userId ?? people[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  const person = people.find((p) => p.id === who);
  const set = (kind: BonusKind | null) => start(async () => {
    setMsg(null);
    const r = await setInvoiceBonus(invoiceId, kind ? who : null, kind ?? "other");
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  if (!people.length) return null;
  const btn = (kind: BonusKind, label: string, rate: number) => (
    <button key={kind} type="button" disabled={pending || locked || !rate} onClick={() => set(kind)}
      className={`rounded-lg px-3 py-2 text-left text-[0.8125rem] ring-1 ring-inset disabled:opacity-40 ${current?.kind === kind && current.userId === who ? "bg-brand-50 font-semibold text-brand-800 ring-brand-300" : "ring-line hover:bg-zinc-50"}`}>
      {label} · {rate}%<span className="block text-[0.75rem] font-normal text-ink-muted">{fmt(Math.round(exGst * rate) / 100)} on {fmt(exGst)} ex GST</span>
    </button>
  );
  return (
    <Card>
      <CardHeader title="Sales bonus" subtitle={current ? `${people.find((p) => p.id === current.userId)?.name ?? "Team member"} · ${current.kind === "build" ? "new website build" : current.kind} · ${current.rate}%${current.status === "paid" ? " · paid" : ""}` : "Who made this sale?"} action={<Award className="h-4 w-4 text-ink-faint" />} />
      <div className="space-y-2 border-t border-line px-5 py-4">
        {people.length > 1 && <Select aria-label="Who made the sale" value={who} onChange={(e) => setWho(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
        {person && <div className="grid gap-2 sm:grid-cols-2">{btn("build", "New website build", person.build)}{btn("maintenance", "Maintenance", person.maintenance)}</div>}
        {current && !locked && <button type="button" disabled={pending} onClick={() => set(null)} className="text-[0.75rem] text-ink-muted underline hover:text-ink">No bonus on this invoice</button>}
        {locked && <p className="text-[0.75rem] text-ink-muted">This bonus has been paid.</p>}
        {pending && <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />}
        {msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}
