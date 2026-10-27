"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { saveTemplates } from "@/app/(app)/accounts/actions";
import type { Template } from "@/lib/accounts/core";

/** The chasing emails, in your words. Words in {braces} are filled in for each invoice. */
export function TemplatesEditor({ initial, defaults }: { initial: Template[]; defaults: Template[] }) {
  const [list, setList] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, p: Partial<Template>) => setList(list.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const builtIn = (k: string) => defaults.some((d) => d.key === k);
  return (
    <div className="space-y-4">
      <p className="text-[0.8125rem] text-ink-muted">Words you can use: <code>{"{first_name}"}</code> <code>{"{invoice}"}</code> <code>{"{amount}"}</code> <code>{"{due_date}"}</code> <code>{"{days_overdue}"}</code> <code>{"{promise_date}"}</code> <code>{"{business}"}</code>. Every email has the invoice and a Pay button under your message.</p>
      {list.map((t, i) => (
        <Card key={t.key} className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1"><Label htmlFor={`tn-${i}`}>Name</Label><Input id={`tn-${i}`} value={t.name} maxLength={60} onChange={(e) => set(i, { name: e.target.value })} /></div>
            {builtIn(t.key)
              ? <Button size="sm" variant="ghost" onClick={() => set(i, defaults.find((d) => d.key === t.key)!)}><RotateCcw className="h-4 w-4" />Original words</Button>
              : <Button size="sm" variant="ghost" onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" />Remove</Button>}
          </div>
          {t.key === "promise" && <p className="text-[0.75rem] text-emerald-800">Sent automatically on the morning someone promised to pay.</p>}
          <div><Label htmlFor={`ts-${i}`}>Subject</Label><Input id={`ts-${i}`} value={t.subject} maxLength={200} onChange={(e) => set(i, { subject: e.target.value })} /></div>
          <div><Label htmlFor={`tm-${i}`}>Message</Label><Textarea id={`tm-${i}`} rows={7} value={t.message} onChange={(e) => set(i, { message: e.target.value })} /></div>
        </Card>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setList([...list, { key: `custom${Date.now().toString(36).slice(-5)}`, name: "New template", subject: "Invoice {invoice}", message: "Hi {first_name},\n\n\n\n{business}" }])}><Plus className="h-4 w-4" />Add a template</Button>
        <Button variant="primary" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await saveTemplates(list); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save templates</Button>
        {msg && <span className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
