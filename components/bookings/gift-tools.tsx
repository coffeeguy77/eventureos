"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2 } from "lucide-react";
import { createOfficeGift, resendGift, voidGift } from "@/app/(app)/bookings/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const fail = { ok: false as const, error: "Couldn't reach the server." };

export function NewGift({ courses }: { courses: { id: string; name: string; price: number }[] }) {
  const router = useRouter();
  const [f, setF] = useState({ courseId: courses[0]?.id ?? "", amount: String(courses[0]?.price ?? ""), recipientName: "", purchaserName: "", purchaserEmail: "", recipientEmail: "", message: "", email: true, paid: true });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  return (
    <div className="h-fit rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink"><Gift className="h-4 w-4" />Make a gift certificate</p>
      <p className="mb-3 text-[0.78rem] text-ink-muted">For one sold in person, a prize, or a credit after a cancellation.</p>
      <div className="grid gap-2.5">
        <div><Label>For</Label><Select value={f.courseId} onChange={(e) => { const c = courses.find((x) => x.id === e.target.value); setF({ ...f, courseId: e.target.value, amount: c ? String(c.price) : f.amount }); }}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="">Any class (dollar value)</option></Select></div>
        <div><Label>Value ($)</Label><Input inputMode="decimal" value={f.amount} onChange={set("amount")} /></div>
        <div><Label hint="on the certificate">Recipient name</Label><Input value={f.recipientName} onChange={set("recipientName")} /></div>
        <div className="grid grid-cols-2 gap-2"><div><Label>Buyer name</Label><Input value={f.purchaserName} onChange={set("purchaserName")} /></div><div><Label>Buyer email</Label><Input type="email" value={f.purchaserEmail} onChange={set("purchaserEmail")} /></div></div>
        <div><Label hint="optional">Recipient email</Label><Input type="email" value={f.recipientEmail} onChange={set("recipientEmail")} /></div>
        <div><Label hint="optional">Message</Label><Textarea value={f.message} onChange={set("message")} className="min-h-[60px]" /></div>
        <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" checked={f.email} onChange={set("email")} />Email it now</label>
        <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" checked={f.paid} onChange={set("paid")} />It was paid for (untick for a free / credit one)</label>
        {msg && <p className={cn("text-[0.8125rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
        <Button variant="primary" disabled={pending} onClick={() => start(async () => {
          setMsg(null);
          const r = await createOfficeGift({ ...f, courseId: f.courseId || null }).catch(() => fail);
          if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
          setMsg({ ok: true, text: `Made ${r.data.code}${f.email && (f.purchaserEmail || f.recipientEmail) ? " and emailed it" : ""}.` });
          setF({ ...f, recipientName: "", purchaserName: "", purchaserEmail: "", recipientEmail: "", message: "" });
          router.refresh();
        })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Make certificate</Button>
      </div>
    </div>
  );
}

export function GiftActions({ id, active, viewUrl }: { id: string; active: boolean; viewUrl: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<{ ok: true; data: string } | { ok: false; error: string }>) => start(async () => { const r = await fn().catch(() => fail); setMsg(r.ok ? r.data : r.error); setAsk(false); router.refresh(); });
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
      <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg px-2 py-1 text-[0.75rem] font-medium text-brand-700 hover:bg-brand-50">View</a>
      {active && <button type="button" disabled={pending} onClick={() => go(() => resendGift(id))} className="rounded-lg px-2 py-1 text-[0.75rem] font-medium text-ink-muted hover:bg-zinc-100">Resend</button>}
      {active && !ask && <button type="button" onClick={() => setAsk(true)} className="rounded-lg px-2 py-1 text-[0.75rem] font-medium text-rose-700 hover:bg-rose-50">Void</button>}
      {ask && <span className="flex items-center gap-1 text-[0.75rem]">Void it?<button type="button" onClick={() => setAsk(false)} className="rounded px-1.5 py-0.5 ring-1 ring-line">No</button><button type="button" disabled={pending} onClick={() => go(() => voidGift(id))} className="rounded bg-rose-600 px-1.5 py-0.5 text-white">Void</button></span>}
      {msg && <span className="text-[0.72rem] text-ink-muted">{msg}</span>}
    </div>
  );
}
