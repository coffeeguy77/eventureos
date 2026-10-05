"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { cancelQueuedWelcome, queueWelcomeLetter, removePost, saveJobSettings, sendTestWelcome, setEmployerStatus } from "@/app/(app)/bookings/jobs-actions";
import type { JobSettings } from "@/lib/jobs/core";
import { Button } from "@/components/ui/button";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <span role="status" className={`text-[0.8125rem] font-medium ${m.ok ? "text-emerald-700" : "text-rose-700"}`}>{m.text}</span> : null);
const field = "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[0.875rem] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function EmployerButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const go = (s: "approved" | "blocked" | "pending") => start(async () => { const r = await setEmployerStatus(id, s); setM(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "approved" && <Button variant="primary" size="sm" disabled={pending} onClick={() => go("approved")}>Approve</Button>}
      {status !== "blocked" && <Button size="sm" variant="danger" disabled={pending} onClick={() => go("blocked")}>Block</Button>}
      {status === "blocked" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => go("pending")}>Unblock</Button>}
      <Note m={m} />
    </div>
  );
}

export function RemovePostButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await removePost(id); router.refresh(); })}>Remove</Button>;
}

export function WelcomeLetter({ initial, previewHtml, eligible, queued, publicUrl }: { initial: JobSettings; previewHtml: string; eligible: number; queued: number; publicUrl: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [m, setM] = useState<Msg>(null);
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const save = () => start(async () => { const r = await saveJobSettings(s); setM(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); if (r.ok) router.refresh(); });
  const days = Math.ceil(eligible / Math.max(1, s.dailyLimit));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-[0.8125rem] font-medium text-ink" htmlFor="j-n">Job board name</label><input id="j-n" className={field} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></div>
          <label className="mt-6 flex items-center gap-2 text-[0.875rem] text-ink"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />Job board is open</label>
        </div>
        <div><label className="mb-1 block text-[0.8125rem] font-medium text-ink" htmlFor="j-s">Welcome letter subject</label><input id="j-s" className={field} value={s.welcomeSubject} onChange={(e) => setS({ ...s, welcomeSubject: e.target.value })} /></div>
        <div>
          <label className="mb-1 block text-[0.8125rem] font-medium text-ink" htmlFor="j-b">Letter</label>
          <textarea id="j-b" rows={16} className={`${field} h-auto py-2 font-[inherit] leading-relaxed`} value={s.welcomeBody} onChange={(e) => setS({ ...s, welcomeBody: e.target.value })} />
          <p className="mt-1 text-[0.75rem] text-ink-muted">Use {"{first_name}"} for their first name. A “Set up my free profile” button and an unsubscribe link are added automatically.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-[0.8125rem] font-medium text-ink" htmlFor="j-d">Letters per day (at most)</label><input id="j-d" type="number" min={10} max={5000} className={field} value={s.dailyLimit} onChange={(e) => setS({ ...s, dailyLimit: Number(e.target.value) })} />
            <p className="mt-1 text-[0.75rem] text-ink-muted">Leaves room in your email plan for booking emails.</p></div>
          <div><label className="mb-1 block text-[0.8125rem] font-medium text-ink" htmlFor="j-z">Per background run</label><input id="j-z" type="number" min={5} max={200} className={field} value={s.batchSize} onChange={(e) => setS({ ...s, batchSize: Number(e.target.value) })} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={pending || !dirty} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
          <Button variant="secondary" disabled={pending || dirty} onClick={() => start(async () => { const r = await sendTestWelcome(); setM(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); })}>Send a test to me</Button>
          <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[0.8125rem] font-semibold text-brand-700 hover:underline">Open the job board ↗</a>
          <Note m={m} />
        </div>
        {dirty && <p className="text-[0.75rem] text-ink-muted">Save to update the preview and the test email.</p>}

        <div className="mt-2 rounded-xl border border-line bg-zinc-50 p-4">
          {queued > 0 ? (<>
            <p className="text-[0.9375rem] font-semibold text-ink">Sending — {queued} still to go</p>
            <p className="mb-3 text-[0.8125rem] text-ink-muted">Up to {s.dailyLimit} a day, in small batches in the background.</p>
            <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await cancelQueuedWelcome(); setM(r.ok ? { ok: true, text: `Stopped — ${r.data} not sent.` } : { ok: false, text: r.error }); router.refresh(); })}>Stop sending</Button>
          </>) : eligible === 0 ? (
            <p className="text-[0.875rem] text-ink-muted">Everyone on your list with an email has been sent the letter (or is already on the board).</p>
          ) : !sure ? (<>
            <p className="text-[0.9375rem] font-semibold text-ink">{eligible} people will get this letter</p>
            <p className="mb-3 text-[0.8125rem] text-ink-muted">Past and present students with an email who haven&apos;t had it. At {s.dailyLimit} a day that takes about {days} {days === 1 ? "day" : "days"}.</p>
            <Button variant="primary" disabled={pending || dirty || !s.enabled} onClick={() => setSure(true)}><Send className="h-4 w-4" />Send the welcome letter…</Button>
          </>) : (<>
            <p className="mb-3 text-[0.9375rem] font-semibold text-ink">Send to {eligible} people? Emails can&apos;t be unsent (you can stop the rest at any time).</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={pending} onClick={() => start(async () => { const r = await queueWelcomeLetter(eligible); setSure(false); setM(r.ok ? { ok: true, text: `Started — ${r.data} letters queued.` } : { ok: false, text: r.error }); router.refresh(); })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Yes, send to {eligible}</Button>
              <Button variant="secondary" onClick={() => setSure(false)}>Cancel</Button>
            </div>
          </>)}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[0.8125rem] font-medium text-ink">Preview</p>
        <iframe title="Welcome letter preview" srcDoc={previewHtml} sandbox="" className="h-[760px] w-full rounded-xl border border-line bg-white" />
      </div>
    </div>
  );
}

/** Whether new businesses need approval before they can search baristas and post jobs. */
export function EmployerApprovalToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-start gap-3">
      <label className="flex min-w-0 flex-1 items-start gap-2 text-[0.8125rem] text-ink">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={on} disabled={pending} onChange={(e) => {
          const v = e.target.checked; setOn(v);
          start(async () => { const r = await saveJobSettings({ employerApproval: v }); setM(r.ok ? { ok: true, text: v ? "New businesses now wait for your approval." : "New businesses can start straight away." } : { ok: false, text: r.error }); if (!r.ok) setOn(!v); router.refresh(); });
        }} />
        <span><b className="font-semibold">Approve new businesses first</b>
          <span className="block text-ink-muted">Off: businesses can search baristas and post jobs as soon as they sign up (you get an email and can block anyone). Turn on if you start getting random sign-ups.</span></span>
      </label>
      <Note m={m} />
    </div>
  );
}
