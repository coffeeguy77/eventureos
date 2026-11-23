"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Pause, Play, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { AUDIENCE_LABEL, bodyHtml, personalise, type Audience } from "@/lib/nerdherd/mailout";
import { countAudience, deleteDraft, saveMailout, sendTest, setMailoutStatus, startMailout } from "@/app/(app)/nerd-herd/mailouts/actions";

export function MailoutEditor({ id: initialId, initial, me, starter }: { id: string | null; initial: { subject: string; body: string; audience: Audience }; me: string; starter: boolean }) {
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [audience, setAudience] = useState<Audience>(initial.audience);
  const [testTo, setTestTo] = useState(me);
  const [count, setCount] = useState<number | null>(null);
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  void starter;
  useEffect(() => { setCount(null); setSure(false); countAudience(audience).then((r) => setCount(r.ok ? r.data : null)); }, [audience]);
  const v = { subject, body, audience };
  const run = (fn: () => Promise<void>) => start(async () => { setMsg(null); await fn(); });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <div><Label htmlFor="mo-aud">Send to</Label>
          <Select id="mo-aud" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
            {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
          </Select>
          <p className="mt-1 text-[0.75rem] text-ink-muted">{count === null ? "Counting…" : `${count.toLocaleString()} people (one email per address; anyone who unsubscribed is left out)`}</p>
        </div>
        <div><Label htmlFor="mo-sub">Subject</Label><Input id="mo-sub" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></div>
        <div><Label htmlFor="mo-body" hint="Blank line = new paragraph · lines starting with • become a list">Email</Label><Textarea id="mo-body" rows={18} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-56"><Label htmlFor="mo-test">Send a test to</Label><Input id="mo-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
          <Button disabled={pending} onClick={() => run(async () => { const r = await sendTest(v, testTo); setMsg(r.ok ? { ok: true, t: `Test sent to ${r.data} — check how it looks.` } : { ok: false, t: r.error }); })}><Send className="h-4 w-4" />Send test</Button>
        </div>
        {msg && <p role="status" className={`text-[0.7812rem] font-medium ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{msg.t}</p>}
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button disabled={pending} onClick={() => run(async () => { const r = await saveMailout(id, v); if (!r.ok) setMsg({ ok: false, t: r.error }); else { setId(r.data); setMsg({ ok: true, t: "Draft saved." }); router.refresh(); } })}>Save draft</Button>
          {!sure
            ? <Button variant="primary" disabled={pending || !count} onClick={() => setSure(true)}><Send className="h-4 w-4" />Send to {count?.toLocaleString() ?? "…"} clients</Button>
            : (
              <span className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
                Send “{subject}” to {count?.toLocaleString()} clients now? It can&apos;t be unsent.
                <Button size="sm" variant="primary" disabled={pending} onClick={() => run(async () => {
                  let mid = id;
                  if (!mid) { const s = await saveMailout(null, v); if (!s.ok) { setMsg({ ok: false, t: s.error }); return; } mid = s.data; setId(mid); }
                  else { const s = await saveMailout(mid, v); if (!s.ok) { setMsg({ ok: false, t: s.error }); return; } }
                  const r = await startMailout(mid, v);
                  setSure(false);
                  if (!r.ok) setMsg({ ok: false, t: r.error }); else { setMsg({ ok: true, t: `Sending to ${r.data.toLocaleString()} clients — about 40 every 5 minutes. You can pause it any time.` }); router.push("/nerd-herd/mailouts?edit=new"); router.refresh(); }
                })}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Yes, send it</Button>
                <Button size="sm" variant="ghost" onClick={() => setSure(false)}>Cancel</Button>
              </span>
            )}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">Preview</p>
        <div className="overflow-hidden rounded-xl bg-[#F5F4FA] p-4 ring-1 ring-line">
          <p className="mb-3 text-[0.8125rem] text-[#575270]"><span className="font-semibold text-[#0F0B1E]">{personalise(subject, "Sam")}</span></p>
          <div className="rounded-xl bg-white p-5 text-[0.875rem] leading-relaxed text-[#0F0B1E] [&_a]:break-all" dangerouslySetInnerHTML={{ __html: bodyHtml(personalise(body, "Sam")) }} />
          <p className="mt-3 text-center text-[0.6875rem] text-[#8A86A0]">Footer: you&apos;re receiving this because you&apos;re a client · your business details · Unsubscribe</p>
        </div>
        <p className="mt-2 text-[0.75rem] text-ink-muted">Preview uses “Sam” as the first name.</p>
      </div>
    </div>
  );
}

export function MailoutControls({ id, status }: { id: string; status: "draft" | "sending" | "paused" | "done" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  if (status === "draft") return (
    <div className="flex gap-3 text-[0.75rem]">
      <Link href={`/nerd-herd/mailouts?edit=${id}`} className="font-medium text-brand-600 hover:underline">Edit</Link>
      <button type="button" disabled={pending} onClick={() => go(() => deleteDraft(id))} className="inline-flex items-center gap-1 text-ink-muted hover:text-rose-600"><Trash2 className="h-3 w-3" />Delete</button>
    </div>
  );
  if (status === "sending") return <Button size="sm" disabled={pending} onClick={() => go(() => setMailoutStatus(id, "paused"))}><Pause className="h-3.5 w-3.5" />Pause</Button>;
  if (status === "paused") return <Button size="sm" disabled={pending} onClick={() => go(() => setMailoutStatus(id, "sending"))}><Play className="h-3.5 w-3.5" />Resume</Button>;
  return null;
}
