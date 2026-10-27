"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { priceJob, type PrintSettings } from "@/lib/printing/core";
import { savePrintSettings } from "@/app/(app)/printing/actions";

export function PrintSettingsForm({ initial, pageUrl }: { initial: PrintSettings; pageUrl: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<PrintSettings>) => setS((o) => ({ ...o, ...p }));
  const n = (k: keyof PrintSettings, label: string, step = "1", hint?: string) => (
    <div><Label htmlFor={`ps-${k}`} hint={hint}>{label}</Label><Input id={`ps-${k}`} type="number" min={0} step={step} value={String(s[k] ?? "")} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<PrintSettings>)} /></div>
  );
  const ex1 = priceJob({ items: [{ description: "", width_m: 1.2, length_m: 1, qty: 1 }], setup: true, cut: false }, s);
  const ex3 = priceJob({ items: [{ description: "", width_m: 1.2, length_m: 3, qty: 1 }], setup: true, cut: true }, s);
  const save = () => start(async () => {
    setMsg(null);
    const r = await savePrintSettings({ ...s, intro: s.intro ?? null, equipment: s.equipment.map((x) => x.trim()).filter(Boolean) });
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <CardHeader title="Printing page on your events website" subtitle="Customers send their job and upload artwork. Files are private — only your team can open them." />
        <div className="space-y-3 border-t border-line px-5 py-4">
          <label className="flex items-center gap-2 text-[0.875rem]"><input type="checkbox" className="h-4 w-4" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Show the Printing page and menu link</label>
          {s.enabled && <p className="text-[0.75rem] text-ink-muted">Page: <a href={pageUrl} target="_blank" rel="noreferrer" className="underline">{pageUrl}</a></p>}
          <div><Label htmlFor="ps-eq" hint="one per line — shown on the page">Your equipment</Label><Textarea id="ps-eq" rows={2} value={s.equipment.join("\n")} onChange={(e) => set({ equipment: e.target.value.split("\n") })} placeholder={"e.g. Wide-format latex printer\nPrecision plotter cutter"} /></div>
          <div><Label htmlFor="ps-intro" hint="optional">Intro on the page</Label><Textarea id="ps-intro" rows={3} maxLength={800} value={s.intro ?? ""} onChange={(e) => set({ intro: e.target.value })} placeholder="e.g. Banners, signage, stickers and decals printed in-house. Send your artwork and we'll quote." /></div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Rates" subtitle="Before GST. Lineal metres are added up across all the prints in a job." />
        <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2">
          {n("firstMetre", "First lineal metre ($)", "0.01")}
          {n("perMetre", "Each metre after ($)", "0.01")}
          {n("setup", "Setup per job ($)", "0.01")}
          {n("cut", "Cutting per job ($)", "0.01")}
          {n("rollWidth", "Roll width (m)", "0.01", "wider prints are flagged")}
          {n("gstPct", "GST (%)", "0.1")}
          <div><Label htmlFor="ps-round">Round metres</Label><Select id="ps-round" value={s.rounding} onChange={(e) => set({ rounding: e.target.value as PrintSettings["rounding"] })}><option value="exact">Exactly (to the cm)</option><option value="0.1">Up to the next 10 cm</option><option value="1">Up to the next whole metre</option></Select></div>
        </div>
        <div className="border-t border-line px-5 py-3 text-[0.75rem] text-ink-muted">
          <p>1 m print + setup: ${ex1.exGst.toFixed(2)} + GST = <strong className="text-ink">${ex1.total.toFixed(2)}</strong></p>
          <p>3 m print + setup + cutting: ${ex3.exGst.toFixed(2)} + GST = <strong className="text-ink">${ex3.total.toFixed(2)}</strong></p>
        </div>
      </Card>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>
        {msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
