"use client";
import { useState, useTransition } from "react";
import { Mail, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { CART_SECTIONS, DEFAULT_WORDING, fill, SECTION_NAMES, type CartSection, type ReminderSettings, type SectionReminder, type Wording } from "@/lib/reminders/core";
import { saveReminderSettings } from "@/app/(app)/website/actions";

const SAMPLE: Record<CartSection, { summary: string; fomo: string; date: string }> = {
  shop: { summary: "1kg of your house blend", fomo: "", date: "" },
  classes: { summary: "Home Barista Basics — Sat 14 Nov", fomo: "", date: "" },
  gifts: { summary: "Home Barista Basics", fomo: "", date: "" },
  giftcards: { summary: "$50 gift card", fomo: "", date: "" },
  events: { summary: "Coffee van · Sat 14 Nov", fomo: "Our only coffee van is still free on Sat 14 Nov — for now.", date: "Sat 14 Nov" },
  catering: { summary: "Catering · 3 items · Fri 13 Nov", fomo: "", date: "Fri 13 Nov" },
};

export function RemindersForm({ initial, business, counts }: { initial: ReminderSettings; business: string; counts: Record<string, { open: number; sent: number }> }) {
  const [v, setV] = useState(initial);
  const [open, setOpen] = useState<CartSection | null>("events");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const setSec = (k: CartSection, s: Partial<SectionReminder>) => setV({ ...v, sections: { ...v.sections, [k]: { ...v.sections[k], ...s } } });
  const save = () => start(async () => { const r = await saveReminderSettings(v); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); });

  const editor = (k: CartSection, which: "first" | "last", w: Wording) => {
    const vars = { first: "Sam", business, ...SAMPLE[k] };
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div><Label htmlFor={`${k}-${which}-s`}>Subject</Label><Input id={`${k}-${which}-s`} value={w.subject} onChange={(e) => setSec(k, { [which]: { ...w, subject: e.target.value } })} /></div>
          <div><Label htmlFor={`${k}-${which}-b`}>Message</Label><Textarea id={`${k}-${which}-b`} value={w.body} onChange={(e) => setSec(k, { [which]: { ...w, body: e.target.value } })} /></div>
          <div><Label htmlFor={`${k}-${which}-c`}>Button</Label><Input id={`${k}-${which}-c`} value={w.button} onChange={(e) => setSec(k, { [which]: { ...w, button: e.target.value } })} /></div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-inset ring-line" aria-label="Preview">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Preview</p>
          <p className="mt-2 font-semibold text-ink">{fill(w.subject, vars)}</p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">{fill(w.body, vars)}</p>
          <span className="mt-3 inline-flex rounded-md bg-brand-500 px-3 py-1.5 text-[0.75rem] font-semibold text-on-brand">{w.button}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ink">Come back and finish — reminders</h2>
            <p className="mt-0.5 max-w-2xl text-[0.8125rem] text-ink-muted">When someone types their email into a checkout, the quote builder or the catering order and then leaves, we can send a friendly nudge. Each section has its own words. Words you can use: <code>{"{first}"}</code> first name, <code>{"{summary}"}</code> what they left, <code>{"{date}"}</code> their date, <code>{"{fomo}"}</code> live availability for event hire, <code>{"{business}"}</code>. Every email has a link to stop them.</p>
          </div>
          <label className="flex items-center gap-2 text-[0.8438rem] font-medium"><input type="checkbox" className="h-4 w-4" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />Reminders on</label>
        </div>
        {!v.enabled && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-800 ring-1 ring-inset ring-amber-100">Off — nothing is sent. Unfinished checkouts are still listed below so you can see them.</p>}
      </Card>

      {CART_SECTIONS.map((k) => {
        const s = v.sections[k];
        const c = counts[k] ?? { open: 0, sent: 0 };
        return (
          <Card key={k} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="text-left" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                <p className="font-semibold text-ink">{SECTION_NAMES[k]}</p>
                <p className="text-[0.7812rem] text-ink-muted">{c.open} unfinished right now · {c.sent} reminders sent in total</p>
              </button>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" className="h-4 w-4" checked={s.on} onChange={(e) => setSec(k, { on: e.target.checked })} />Send</label>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(open === k ? null : k)}><Mail className="h-3.5 w-3.5" />{open === k ? "Close" : "Edit words"}</Button>
              </div>
            </div>
            {open === k && (
              <div className="mt-4 space-y-5 border-t border-line pt-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div><Label htmlFor={`${k}-h1`}>First reminder after (hours)</Label><Input id={`${k}-h1`} type="number" min={1} max={336} className="w-28" value={s.firstAfterHours} onChange={(e) => setSec(k, { firstAfterHours: Number(e.target.value) })} /></div>
                  <label className="flex items-center gap-2 pb-2 text-[0.8125rem]"><input type="checkbox" className="h-4 w-4" checked={s.second} onChange={(e) => setSec(k, { second: e.target.checked })} />Send a last call</label>
                  {s.second && <div><Label htmlFor={`${k}-h2`}>…this many hours later</Label><Input id={`${k}-h2`} type="number" min={1} max={336} className="w-28" value={s.secondAfterHours} onChange={(e) => setSec(k, { secondAfterHours: Number(e.target.value) })} /></div>}
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSec(k, DEFAULT_WORDING[k])}><RotateCcw className="h-3.5 w-3.5" />Original words</Button>
                </div>
                <p className="text-[0.7812rem] text-ink-muted">Reminders go out with the daily run, so timings are rounded to the next run.</p>
                <div><p className="mb-2 text-[0.8125rem] font-semibold text-ink">First reminder</p>{editor(k, "first", s.first)}</div>
                {s.second && <div><p className="mb-2 text-[0.8125rem] font-semibold text-ink">Last call</p>{editor(k, "last", s.last)}</div>}
              </div>
            )}
          </Card>
        );
      })}

      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
        <Button type="button" variant="primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save reminders"}</Button>
        {msg && <span className={`text-[0.8125rem] ${msg.ok ? "text-ink-muted" : "text-rose-700"}`} role="status">{msg.text}</span>}
      </div>
    </div>
  );
}
