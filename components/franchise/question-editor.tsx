"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, Pencil, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { KINDS, KIND_LABEL, qText, type Question } from "@/lib/franchise/core";
import { resetFranchiseQuestions, saveFranchiseQuestions } from "@/app/(app)/franchise/actions";

type Step = { id: string; name: string; qs: (Question & { uid: string })[] };
const uid = () => Math.random().toString(36).slice(2, 10);
const toSteps = (qs: Question[]): Step[] => {
  const steps: Step[] = [];
  for (const q of qs) {
    let s = steps.find((x) => x.name === q.section);
    if (!s) { s = { id: uid(), name: q.section, qs: [] }; steps.push(s); }
    s.qs.push({ ...q, uid: uid() });
  }
  return steps;
};
const toFlat = (steps: Step[]): Question[] => steps.flatMap((s) => s.qs.map(({ uid: _u, ...q }) => ({ ...q, section: s.name.trim() || "Questions" })));
function move<T>(l: T[], from: number, to: number) { if (to < 0 || to >= l.length) return l; const n = [...l]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; }

/** Franchise → Application questions: steps of questions the applicant fills in. */
export function QuestionEditor({ initial, custom, business }: { initial: Question[]; custom: boolean; business: string }) {
  const [steps, setSteps] = useState<Step[]>(() => toSteps(initial));
  const [open, setOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [removed, setRemoved] = useState<{ step: string; i: number; q: Step["qs"][number] } | null>(null);
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const change = (fn: (s: Step[]) => Step[]) => { setSteps(fn); setDirty(true); setMsg(null); };
  const setQ = (sid: string, quid: string, patch: Partial<Question>) => change((all) => all.map((s) => s.id !== sid ? s : { ...s, qs: s.qs.map((q) => (q.uid === quid ? { ...q, ...patch } : q)) }));
  const addQ = (sid: string) => { const q = { uid: uid(), key: "", label: "", kind: "text" as const, section: "" }; change((all) => all.map((s) => (s.id === sid ? { ...s, qs: [...s.qs, q] } : s))); setOpen(q.uid); };
  const save = () => start(async () => {
    const r = await saveFranchiseQuestions(toFlat(steps));
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) setDirty(false);
  });
  const reset = () => start(async () => {
    const r = await resetFranchiseQuestions();
    if (r.ok) window.location.reload(); else setMsg({ ok: false, text: r.error });
  });
  const total = steps.reduce((n, s) => n + s.qs.length, 0);

  return (
    <div className="space-y-4">
      {steps.map((s, si) => (
        <Card key={s.id} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-zinc-50 px-4 py-2.5">
            <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-brand-600">Step {si + 1}</span>
            <input aria-label={`Step ${si + 1} name`} value={s.name} maxLength={60} onChange={(e) => change((all) => all.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
              className="min-w-[10rem] flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[1rem] font-semibold text-ink hover:border-line focus:border-brand-400 focus:bg-white focus:outline-none" />
            <button type="button" aria-label="Move step up" disabled={si === 0} onClick={() => change((all) => move(all, si, si - 1))} className="p-1 text-ink-faint hover:text-ink disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
            <button type="button" aria-label="Move step down" disabled={si === steps.length - 1} onClick={() => change((all) => move(all, si, si + 1))} className="p-1 text-ink-faint hover:text-ink disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
            {!s.qs.length && <button type="button" aria-label="Remove empty step" onClick={() => change((all) => all.filter((x) => x.id !== s.id))} className="p-1 text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
          </div>
          <ul className="divide-y divide-line">
            {s.qs.map((q, qi) => {
              const editing = open === q.uid;
              return (
                <li key={q.uid} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span className="flex flex-col pt-0.5">
                      <button type="button" aria-label="Move up" disabled={qi === 0} onClick={() => change((all) => all.map((x) => (x.id === s.id ? { ...x, qs: move(x.qs, qi, qi - 1) } : x)))} className="text-ink-faint hover:text-ink disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="Move down" disabled={qi === s.qs.length - 1} onClick={() => change((all) => all.map((x) => (x.id === s.id ? { ...x, qs: move(x.qs, qi, qi + 1) } : x)))} className="text-ink-faint hover:text-ink disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </span>
                    <button type="button" onClick={() => setOpen(editing ? null : q.uid)} className="min-w-0 flex-1 text-left">
                      <span className="block text-[0.9375rem] font-medium text-ink">{qText(q.label, business) || <span className="text-ink-faint">New question</span>}{q.required && <span className="text-rose-500"> *</span>}</span>
                      <span className="block text-[0.75rem] text-ink-muted">{KIND_LABEL[q.kind]}{q.kind === "choice" && q.options?.length ? ` · ${q.options.length} choices` : ""}{q.hint ? ` · ${q.hint}` : ""}</span>
                    </button>
                    <button type="button" aria-label="Edit" onClick={() => setOpen(editing ? null : q.uid)} className="p-1 text-ink-faint hover:text-ink">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</button>
                    <button type="button" aria-label="Duplicate" onClick={() => change((all) => all.map((x) => (x.id === s.id ? { ...x, qs: [...x.qs.slice(0, qi + 1), { ...q, uid: uid(), key: "" }, ...x.qs.slice(qi + 1)] } : x)))} className="p-1 text-ink-faint hover:text-ink"><Copy className="h-4 w-4" /></button>
                    <button type="button" aria-label="Remove" onClick={() => { setRemoved({ step: s.id, i: qi, q }); change((all) => all.map((x) => (x.id === s.id ? { ...x, qs: x.qs.filter((y) => y.uid !== q.uid) } : x))); }} className="p-1 text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {editing && (
                    <div className="mt-3 grid gap-3 rounded-lg bg-zinc-50 p-3 sm:grid-cols-2">
                      <div className="sm:col-span-2"><Label htmlFor={`ql-${q.uid}`} hint="{business} puts your business name in">Question</Label><Input id={`ql-${q.uid}`} autoFocus value={q.label} maxLength={300} onChange={(e) => setQ(s.id, q.uid, { label: e.target.value })} /></div>
                      <div><Label htmlFor={`qk-${q.uid}`}>Answer type</Label>
                        <Select id={`qk-${q.uid}`} value={q.kind} onChange={(e) => { const kind = e.target.value as Question["kind"]; setQ(s.id, q.uid, { kind, ...(kind === "choice" && !(q.options?.length) ? { options: ["", ""] } : {}) }); }}>
                          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                        </Select></div>
                      <div><Label htmlFor={`qs-${q.uid}`}>Step</Label>
                        <Select id={`qs-${q.uid}`} value={s.id} onChange={(e) => { const to = e.target.value; change((all) => all.map((x) => x.id === s.id ? { ...x, qs: x.qs.filter((y) => y.uid !== q.uid) } : x.id === to ? { ...x, qs: [...x.qs, q] } : x)); }}>
                          {steps.map((x, i) => <option key={x.id} value={x.id}>Step {i + 1}: {x.name || "Untitled"}</option>)}
                        </Select></div>
                      <div className="sm:col-span-2"><Label htmlFor={`qh-${q.uid}`} hint="optional">Help text</Label><Input id={`qh-${q.uid}`} value={q.hint ?? ""} maxLength={200} placeholder="e.g. Suburb and state" onChange={(e) => setQ(s.id, q.uid, { hint: e.target.value })} /></div>
                      {q.kind === "choice" && (
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Choices</Label>
                          {(q.options ?? []).map((o, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <Input aria-label={`Choice ${oi + 1}`} value={o} maxLength={120} onChange={(e) => setQ(s.id, q.uid, { options: (q.options ?? []).map((x, j) => (j === oi ? e.target.value : x)) })} />
                              <button type="button" aria-label="Move choice up" disabled={oi === 0} onClick={() => setQ(s.id, q.uid, { options: move(q.options ?? [], oi, oi - 1) })} className="p-1 text-ink-faint disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
                              <button type="button" aria-label="Remove choice" onClick={() => setQ(s.id, q.uid, { options: (q.options ?? []).filter((_, j) => j !== oi) })} className="p-1 text-ink-faint hover:text-rose-600"><X className="h-4 w-4" /></button>
                            </div>
                          ))}
                          {(q.options?.length ?? 0) < 12 && <button type="button" onClick={() => setQ(s.id, q.uid, { options: [...(q.options ?? []), ""] })} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600"><Plus className="h-3.5 w-3.5" />Add a choice</button>}
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-[0.875rem] sm:col-span-2"><input type="checkbox" checked={!!q.required} onChange={(e) => setQ(s.id, q.uid, { required: e.target.checked })} className="h-4 w-4 accent-brand-600" />{q.kind === "yesno" ? "Must be ticked to send" : "Must be answered"}</label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="px-4 pb-3 pt-1"><button type="button" onClick={() => addQ(s.id)} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600"><Plus className="h-3.5 w-3.5" />Add a question</button></div>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => { const st = { id: uid(), name: "New step", qs: [] }; change((all) => [...all, st]); }}><Plus className="h-4 w-4" />Add a step</Button>
        <Button onClick={() => setPreview((p) => !p)}><Eye className="h-4 w-4" />{preview ? "Hide preview" : "Preview"}</Button>
        {custom && <button type="button" disabled={pending} onClick={reset} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-ink-muted hover:text-ink"><RotateCcw className="h-3.5 w-3.5" />Back to the built-in questions</button>}
      </div>

      {preview && (
        <Card className="p-5">
          <p className="mb-3 text-[0.8125rem] text-ink-muted">How applicants see it (not saved until you press Save):</p>
          <div className="space-y-5">
            {steps.map((s, i) => (
              <div key={s.id}>
                <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-brand-600">Step {i + 1} of {steps.length}</p>
                <p className="text-[1.25rem] font-semibold">{s.name}</p>
                <ul className="mt-2 space-y-3">
                  {s.qs.map((q) => (
                    <li key={q.uid}>
                      <p className="text-[0.9375rem] font-medium">{qText(q.label, business)}{q.required && q.kind !== "yesno" ? <span className="text-rose-500"> *</span> : null}{q.hint && <span className="font-normal text-ink-faint"> · {q.hint}</span>}</p>
                      {q.kind === "choice" ? <div className="mt-1 flex flex-wrap gap-2">{(q.options ?? []).filter(Boolean).map((o) => <span key={o} className="rounded-lg px-3 py-1.5 text-[0.8125rem] ring-1 ring-line">○ {o}</span>)}</div>
                        : q.kind === "yesno" ? <p className="mt-1 text-[0.8125rem] text-ink-muted">☐ tick box</p>
                        : <div className={`mt-1 rounded-lg ring-1 ring-line ${q.kind === "long" ? "h-16" : "h-9"}`} />}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-xl bg-white/95 p-3 shadow-lg ring-1 ring-line backdrop-blur">
        <Button variant="primary" disabled={pending || !dirty} onClick={save}>{pending ? "Saving…" : dirty ? "Save questions" : "Saved"}</Button>
        <span className="text-[0.8125rem] text-ink-muted">{total} question{total === 1 ? "" : "s"} in {steps.length} step{steps.length === 1 ? "" : "s"}</span>
        {removed && <button type="button" onClick={() => { const r = removed; change((all) => all.map((x) => (x.id === r.step ? { ...x, qs: [...x.qs.slice(0, r.i), r.q, ...x.qs.slice(r.i)] } : x))); setRemoved(null); }} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600"><Undo2 className="h-3.5 w-3.5" />Undo remove</button>}
        {msg && <span className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</span>}
      </div>
      <p className="text-[0.75rem] text-ink-faint">Changing or removing a question never deletes answers people have already sent — they still show on their application.</p>
    </div>
  );
}
