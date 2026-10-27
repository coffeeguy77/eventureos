"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Pencil, Play, Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { previewMailRule, runMailRulesNow, saveMailRules } from "@/app/(app)/settings/integrations/mailbox-actions";
import type { MailRule } from "@/lib/mail/rules-core";

type Row = { id: string; from: string; fromEmail: string; subject: string; date: string | null; snippet: string };

/**
 * Rules for the second Gmail account. Like a Gmail filter: type what to look for, preview what it matches, refine,
 * then save. Only matching emails become enquiries — everything else in the mailbox is left alone.
 */
export function MailboxRules({ initial, account, tags, today }: { initial: MailRule[]; account: string; tags: string[]; today: string }) {
  const router = useRouter();
  const [rules, setRules] = useState<MailRule[]>(initial);
  const [edit, setEdit] = useState<MailRule | null>(null);
  const [preview, setPreview] = useState<{ estimate: number; rows: Row[]; query: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const persist = (next: MailRule[], note: string) => start(async () => {
    setMsg(null);
    const r = await saveMailRules(next);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setRules(r.data); setEdit(null); setPreview(null); setMsg({ ok: true, text: note }); router.refresh();
  });
  const look = async () => {
    if (!edit?.query.trim()) return;
    setBusy("preview"); setMsg(null);
    const r = await previewMailRule(edit.query, Math.max(30, Math.round((Date.now() - Date.parse(edit.since + "T00:00:00Z")) / 86_400_000) + 1));
    setBusy(null);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setPreview({ ...r.data, query: edit.query });
  };
  const runNow = async () => {
    setBusy("run"); setMsg(null);
    const r = await runMailRulesNow();
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    router.refresh();
  };
  const blank = (): MailRule => ({ id: Math.random().toString(36).slice(2, 10), name: "", query: "", tag: null, on: true, since: today });
  const stale = !!preview && !!edit && preview.query !== edit.query;

  return (
    <Card>
      <CardHeader title="Enquiry rules" subtitle={`Only emails in ${account} that match a rule become enquiries — nothing else comes in. Each new match is checked every 10 minutes.`}
        action={<div className="flex gap-2">
          {rules.some((r) => r.on) && <Button size="sm" disabled={!!busy} onClick={runNow}>{busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Check now</Button>}
          <Button size="sm" variant="primary" onClick={() => { setEdit(blank()); setPreview(null); }}><Plus className="h-4 w-4" />Add a rule</Button>
        </div>} />

      {edit && (
        <div className="space-y-3 border-t border-line bg-zinc-50/60 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="mr-name">Rule name</Label><Input id="mr-name" value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Espresso bar catering" /></div>
            <div><Label htmlFor="mr-tag" hint="the folder it goes in">Tag</Label>
              <Input id="mr-tag" list="mr-tags" value={edit.tag ?? ""} maxLength={40} onChange={(e) => setEdit({ ...edit, tag: e.target.value || null })} placeholder="e.g. Catering" />
              <datalist id="mr-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist></div>
          </div>
          <div>
            <Label htmlFor="mr-q" hint="like a Gmail search">Look for</Label>
            <div className="flex gap-2">
              <Input id="mr-q" value={edit.query} maxLength={300} onChange={(e) => setEdit({ ...edit, query: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void look(); } }} placeholder='catering OR platters OR "morning tea"' className="min-w-0 flex-1" />
              <Button disabled={busy === "preview" || !edit.query.trim()} onClick={look}>{busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Preview</Button>
            </div>
            <p className="mt-1 text-[0.7188rem] text-ink-faint">Examples: <code>catering</code> · <code>subject:(catering quote)</code> · <code>catering -invoice -newsletter</code> · <code>from:@company.com.au</code> · <code>&quot;office catering&quot; OR &quot;morning tea&quot;</code>. Use <code>-word</code> to leave things out.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div><Label htmlFor="mr-since" hint="also brings in past matches">Bring in matches from</Label><Input id="mr-since" type="date" value={edit.since} max={today} onChange={(e) => setEdit({ ...edit, since: e.target.value || today })} className="w-44" /></div>
            <label className="flex items-center gap-2 pb-2 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={edit.on} onChange={(e) => setEdit({ ...edit, on: e.target.checked })} />Switched on</label>
          </div>

          {preview && (
            <div className={`rounded-lg bg-surface ring-1 ring-line ${stale ? "opacity-60" : ""}`}>
              <p className="border-b border-line px-4 py-2.5 text-[0.8125rem] font-medium text-ink">
                {preview.rows.length ? <>About {preview.estimate} email{preview.estimate === 1 ? "" : "s"} match{edit.since < today ? ` since ${edit.since}` : " (last 30 days shown)"}. Each would become an enquiry{edit.tag ? <> tagged <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-800">{edit.tag}</span></> : null}. Anything here that isn&apos;t an enquiry? Add <code>-word</code> to leave it out.</> : "Nothing matches — try fewer or different words."}
                {stale && <span className="ml-2 text-amber-700">Search changed — press Preview again.</span>}
              </p>
              {preview.rows.length > 0 && (
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {preview.rows.map((r) => (
                    <li key={r.id} className="px-4 py-2 text-[0.8125rem]">
                      <p className="flex justify-between gap-3"><span className="truncate font-medium text-ink">{r.subject}</span><span className="shrink-0 text-[0.7188rem] text-ink-faint">{r.date ? new Date(r.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : ""}</span></p>
                      <p className="truncate text-[0.75rem] text-ink-muted">{r.from}{r.fromEmail && r.from !== r.fromEmail ? ` <${r.fromEmail}>` : ""} — {r.snippet}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={pending || !edit.query.trim()} onClick={() => persist([...rules.filter((r) => r.id !== edit.id), edit], edit.on ? "Rule saved. Matching emails come in as enquiries from now on — press Check now to bring them in straight away." : "Rule saved (switched off).")}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save rule</Button>
            <Button variant="ghost" onClick={() => { setEdit(null); setPreview(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-line border-t border-line">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-medium text-ink">{r.name}{!r.on && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[0.6875rem] text-ink-muted">off</span>}
                {r.tag && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[0.6875rem] font-medium text-brand-800"><Tag className="h-3 w-3" />{r.tag}</span>}</p>
              <p className="truncate font-mono text-[0.75rem] text-ink-faint">{r.query} · from {r.since}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { setEdit({ ...r }); setPreview(null); }}><Pencil className="h-4 w-4" />Edit</Button>
            <button type="button" aria-label={`Delete ${r.name}`} onClick={() => persist(rules.filter((x) => x.id !== r.id), "Rule deleted. Enquiries it already made stay.")} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {!rules.length && !edit && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">No rules yet — so nothing from this mailbox becomes an enquiry.</li>}
      </ul>
      {msg && <p role="status" className={`border-t border-line px-5 py-3 text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
    </Card>
  );
}
