"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea, inputClass } from "@/components/ui/form";
import {
  addLesson, confirmHire, endAccess, giveAccessByEmail, importPack, saveChallenge, saveLearnSettings, saveLesson, saveLevel, saveModule, saveVenue, setActive, setHireStatus,
  type LessonInput, type Result,
} from "@/app/(app)/learn/actions";
import { priceStory, type LearnSettings, type Plan } from "@/lib/learn/core";
import { cn } from "@/lib/cn";

function useAct() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const run = <T,>(fn: () => Promise<Result<T>>, ok = "Saved.", after?: (d: T) => void) => start(async () => {
    setMsg(null);
    const r = await fn().catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "Couldn't save." }));
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: ok }); after?.(r.data); router.refresh();
  });
  return { pending, msg, run, setMsg };
}
const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) => (m ? m.ok ? <span className="inline-flex items-center gap-1 text-[0.7812rem] text-emerald-700"><Check className="h-3.5 w-3.5" />{m.text}</span> : <FormError message={m.text} /> : null);
const Toggle = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start gap-2.5 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={on} onChange={(e) => onChange(e.target.checked)} /><span>{label}{hint && <span className="block text-[0.75rem] text-ink-muted">{hint}</span>}</span></label>
);

/* ------------------------------------------------------------------ import */

export function ImportPack({ counts }: { counts: { levels: number; modules: number; lessons: number; trainer: number } }) {
  const a = useAct();
  return (
    <div className="space-y-2">
      <p className="text-[0.8125rem] text-ink-muted">Bring in everything from the Replit “Barista Course” app: {counts.levels} levels, {counts.modules} modules, {counts.lessons} lessons with their knowledge checks, the badges, the daily challenges and the trainer manual ({counts.trainer} items). You can edit any of it afterwards.</p>
      <Button variant="primary" disabled={a.pending} onClick={() => a.run(importPack, "Imported.")}>{a.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Import the course</Button>
      <Msg m={a.msg} />
    </div>
  );
}

/* ------------------------------------------------------------------ settings */

export function LearnSettingsForm({ initial, courses, currency }: { initial: LearnSettings; courses: { id: string; name: string }[]; currency: string }) {
  const [s, setS] = useState<LearnSettings>(initial);
  const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  const a = useAct();
  const st = priceStory(s);
  const price = (p: Plan) => (
    <div><Label htmlFor={`p-${p}`}>{p === "with_course" ? "With a barista course" : p === "monthly" ? "Monthly" : "Yearly"}</Label>
      <Input id={`p-${p}`} inputMode="decimal" value={String(s.prices[p])} onChange={(e) => setS({ ...s, prices: { ...s.prices, [p]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } })} />
      <div className="mt-1.5"><Toggle on={s.plans[p]} onChange={(v) => setS({ ...s, plans: { ...s.plans, [p]: v } })} label="Offer this" /></div>
    </div>
  );
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); a.run(() => saveLearnSettings(s)); }}>
      <div className={cn("rounded-xl p-4 ring-1", s.enabled ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200")}>
        <Toggle on={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} label={s.enabled ? "Selling is ON — people can buy the online course" : "Selling is OFF — nobody can buy it yet"}
          hint="Turn on when you're ready. While it's off, the add-on doesn't show at checkout, the plans can't be bought and monthly plans don't renew. People already given access keep it." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="l-name">Name</Label><Input id="l-name" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} maxLength={80} /></div>
        <div><Label htmlFor="l-months" hint="for with-a-course and yearly">Months of access</Label><Input id="l-months" inputMode="numeric" value={String(s.accessMonths)} onChange={(e) => setS({ ...s, accessMonths: Number(e.target.value) || 12 })} /></div>
        <div className="sm:col-span-2"><Label htmlFor="l-tag">One-line description</Label><Input id="l-tag" value={s.tagline} onChange={(e) => setS({ ...s, tagline: e.target.value })} maxLength={240} /></div>
      </div>
      <div>
        <p className="mb-2 text-[0.8438rem] font-semibold text-ink">Prices</p>
        <div className="grid gap-4 sm:grid-cols-3">{price("with_course")}{price("monthly")}{price("yearly")}</div>
        <p className="mt-2 text-[0.75rem] text-ink-muted">Works out as: yearly saves {money(st.yearlySaving)} ({st.monthsFree} months free) against monthly; with a course is {st.courseSavePct}% off the yearly price ({money(st.perMonthCourse)} a month).</p>
      </div>
      <div>
        <p className="mb-1 text-[0.8438rem] font-semibold text-ink">Offer it at checkout for</p>
        <p className="mb-2 text-[0.75rem] text-ink-muted">Leave all unticked to offer it with every course.</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {courses.map((c) => <Toggle key={c.id} on={s.addonCourseIds.includes(c.id)} label={c.name} onChange={(v) => setS({ ...s, addonCourseIds: v ? [...s.addonCourseIds, c.id] : s.addonCourseIds.filter((x) => x !== c.id) })} />)}
        </div>
        <div className="mt-3 max-w-xs"><Label htmlFor="l-past" hint="0 = only when booking">Course price for past students for (days)</Label><Input id="l-past" inputMode="numeric" value={String(s.pastStudentDays)} onChange={(e) => setS({ ...s, pastStudentDays: Number(e.target.value) || 0 })} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3"><Toggle on={s.ai.enabled} onChange={(v) => setS({ ...s, ai: { ...s.ai, enabled: v } })} label="AI coach and photo scoring" hint="Uses your Claude (Anthropic) key. The limits below cap the cost per learner." /></div>
        <div><Label htmlFor="l-aim">Coach questions a day</Label><Input id="l-aim" inputMode="numeric" value={String(s.ai.dailyMessages)} onChange={(e) => setS({ ...s, ai: { ...s.ai, dailyMessages: Number(e.target.value) || 0 } })} /></div>
        <div><Label htmlFor="l-aip">Photo scores a day</Label><Input id="l-aip" inputMode="numeric" value={String(s.ai.dailyPhotos)} onChange={(e) => setS({ ...s, ai: { ...s.ai, dailyPhotos: Number(e.target.value) || 0 } })} /></div>
      </div>
      <div className="space-y-2">
        <Toggle on={s.leaderboard} onChange={(v) => setS({ ...s, leaderboard: v })} label="Show the leaderboard" />
        <Toggle on={s.welcomeEmail} onChange={(v) => setS({ ...s, welcomeEmail: v })} label="Email learners a welcome when their access starts" hint="Off by default — the payment page already shows them how to start." />
      </div>
      <div className="flex items-center gap-3"><Button variant="primary" disabled={a.pending}>{a.pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button><Msg m={a.msg} /></div>
    </form>
  );
}

export function MarketplaceSettings({ initial }: { initial: LearnSettings }) {
  const [m, setM] = useState(initial.marketplace);
  const a = useAct();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); a.run(() => saveLearnSettings({ ...initial, marketplace: m })); }}>
      <Toggle on={m.enabled} onChange={(v) => setM({ ...m, enabled: v })} label={m.enabled ? "Marketplace is open" : "Marketplace is closed"} hint="When open, venues can send listings and people can ask to hire approved rooms (from the online course pages)." />
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div><Label htmlFor="m-c" hint="% of each hire">Your commission</Label><Input id="m-c" inputMode="decimal" value={String(m.commissionPct)} onChange={(e) => setM({ ...m, commissionPct: Number(e.target.value) || 0 })} /></div>
      </div>
      <div className="flex items-center gap-3"><Button variant="primary" size="sm" disabled={a.pending}>{a.pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button><Msg m={a.msg} /></div>
    </form>
  );
}

/* ------------------------------------------------------------------ content */

export function LessonEditor({ id, initial }: { id: string; initial: LessonInput }) {
  const [v, setV] = useState<LessonInput>(initial);
  const [quizOn, setQuizOn] = useState(!!initial.quiz);
  const q = v.quiz ?? { question: "", options: ["", "", "", ""], correct_index: 0, explanation: "" };
  const a = useAct();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); a.run(() => saveLesson(id, { ...v, quiz: quizOn ? q : null })); }}>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
        <div><Label htmlFor="ls-t">Title</Label><Input id="ls-t" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={200} /></div>
        <div><Label htmlFor="ls-m">Minutes</Label><Input id="ls-m" inputMode="numeric" value={String(v.duration_minutes)} onChange={(e) => setV({ ...v, duration_minutes: Number(e.target.value) || 0 })} /></div>
        <div><Label htmlFor="ls-x">XP</Label><Input id="ls-x" inputMode="numeric" value={String(v.xp_reward)} onChange={(e) => setV({ ...v, xp_reward: Number(e.target.value) || 0 })} /></div>
      </div>
      <div><Label htmlFor="ls-c" hint="## heading · ### subheading · - bullet · | table |">Lesson text</Label><Textarea id="ls-c" rows={18} className="font-mono text-[0.8125rem]" value={v.content} onChange={(e) => setV({ ...v, content: e.target.value })} /></div>
      <div><Label htmlFor="ls-k" hint="one per line">Key points</Label><Textarea id="ls-k" rows={4} value={v.key_points.join("\n")} onChange={(e) => setV({ ...v, key_points: e.target.value.split("\n") })} /></div>
      <div className="rounded-xl border border-line p-4">
        <Toggle on={quizOn} onChange={setQuizOn} label="Knowledge check (they answer it to finish the lesson)" />
        {quizOn && (
          <div className="mt-3 space-y-2">
            <Input placeholder="Question" value={q.question} onChange={(e) => setV({ ...v, quiz: { ...q, question: e.target.value } })} />
            {q.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" className="h-4 w-4 accent-brand-500" checked={q.correct_index === i} onChange={() => setV({ ...v, quiz: { ...q, correct_index: i } })} aria-label={`Answer ${i + 1} is right`} />
                <Input placeholder={`Answer ${i + 1}`} value={o} onChange={(e) => setV({ ...v, quiz: { ...q, options: q.options.map((x, j) => (j === i ? e.target.value : x)) } })} />
              </div>
            ))}
            {q.options.length < 6 && <Button type="button" size="sm" variant="ghost" onClick={() => setV({ ...v, quiz: { ...q, options: [...q.options, ""] } })}><Plus className="h-3.5 w-3.5" />Add an answer</Button>}
            <Textarea placeholder="Why the right answer is right (shown after they answer)" rows={2} value={q.explanation} onChange={(e) => setV({ ...v, quiz: { ...q, explanation: e.target.value } })} />
          </div>
        )}
      </div>
      <Toggle on={v.published} onChange={(p) => setV({ ...v, published: p })} label="Published (learners can see it)" />
      <div className="flex items-center gap-3"><Button variant="primary" disabled={a.pending}>{a.pending && <Loader2 className="h-4 w-4 animate-spin" />}Save lesson</Button><Msg m={a.msg} /></div>
    </form>
  );
}

export function AddLesson({ moduleId }: { moduleId: string }) {
  const [t, setT] = useState("");
  const a = useAct();
  const router = useRouter();
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); a.run(() => addLesson(moduleId, t), "Added.", (id) => router.push(`/learn?tab=lessons&lesson=${id}`)); }}>
      <Input placeholder="New lesson title" value={t} onChange={(e) => setT(e.target.value)} className="h-8" />
      <Button size="sm" disabled={a.pending || !t.trim()}><Plus className="h-3.5 w-3.5" />Add</Button>
      <Msg m={a.msg?.ok ? null : a.msg} />
    </form>
  );
}

export function ModuleEditor({ id, initial }: { id: string; initial: { title: string; description: string; xp_reward: number; published: boolean } }) {
  const [v, setV] = useState(initial);
  const a = useAct();
  return (
    <form className="grid gap-2 sm:grid-cols-[1fr_90px_auto]" onSubmit={(e) => { e.preventDefault(); a.run(() => saveModule(id, v)); }}>
      <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} aria-label="Module title" />
      <Input inputMode="numeric" value={String(v.xp_reward)} onChange={(e) => setV({ ...v, xp_reward: Number(e.target.value) || 0 })} aria-label="Mastery XP" title="XP for passing the mastery quiz" />
      <div className="flex items-center gap-2"><Toggle on={v.published} onChange={(p) => setV({ ...v, published: p })} label="Published" /><Button size="sm" disabled={a.pending}>Save</Button></div>
      <Textarea rows={2} className="sm:col-span-3" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} aria-label="Module description" />
      <div className="sm:col-span-3"><Msg m={a.msg} /></div>
    </form>
  );
}

export function LevelEditor({ id, initial }: { id: string; initial: { title: string; description: string; min_xp: number; xp_reward: number; certificate_title: string; published: boolean } }) {
  const [v, setV] = useState(initial);
  const a = useAct();
  return (
    <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); a.run(() => saveLevel(id, v)); }}>
      <div className="sm:col-span-2"><Label>Title</Label><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
      <div><Label hint="to open">XP needed</Label><Input inputMode="numeric" value={String(v.min_xp)} onChange={(e) => setV({ ...v, min_xp: Number(e.target.value) || 0 })} /></div>
      <div><Label hint="when finished">XP reward</Label><Input inputMode="numeric" value={String(v.xp_reward)} onChange={(e) => setV({ ...v, xp_reward: Number(e.target.value) || 0 })} /></div>
      <div className="sm:col-span-2"><Label>Description</Label><Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <div className="sm:col-span-2"><Label hint="blank = no certificate">Certificate</Label><Input value={v.certificate_title} onChange={(e) => setV({ ...v, certificate_title: e.target.value })} /></div>
      <div className="flex items-center gap-3 sm:col-span-4"><Toggle on={v.published} onChange={(p) => setV({ ...v, published: p })} label="Published" /><Button size="sm" disabled={a.pending}>Save level</Button><Msg m={a.msg} /></div>
    </form>
  );
}

export function ActiveToggle({ table, id, active }: { table: "learn_badges" | "learn_challenges"; id: string; active: boolean }) {
  const a = useAct();
  return <label className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-muted"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={active} disabled={a.pending} onChange={(e) => a.run(() => setActive(table, id, e.target.checked))} />On</label>;
}

export function ChallengeEditor({ id, initial }: { id: string | null; initial: { title: string; description: string; xp_reward: number } }) {
  const [v, setV] = useState(initial);
  const a = useAct();
  return (
    <form className="grid gap-2 sm:grid-cols-[1fr_2fr_80px_auto]" onSubmit={(e) => { e.preventDefault(); a.run(() => saveChallenge(id, v), id ? "Saved." : "Added.", () => { if (!id) setV({ title: "", description: "", xp_reward: 25 }); }); }}>
      <Input placeholder="Title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      <Input placeholder="What to do" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      <Input inputMode="numeric" value={String(v.xp_reward)} onChange={(e) => setV({ ...v, xp_reward: Number(e.target.value) || 0 })} aria-label="XP" />
      <Button size="sm" disabled={a.pending}>{id ? "Save" : <><Plus className="h-3.5 w-3.5" />Add</>}</Button>
      {a.msg && !a.msg.ok && <div className="sm:col-span-4"><Msg m={a.msg} /></div>}
    </form>
  );
}

/* ------------------------------------------------------------------ learners */

export function GiveAccess() {
  const [v, setV] = useState({ name: "", email: "", months: 12, note: "" });
  const a = useAct();
  return (
    <form className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_1fr_auto]" onSubmit={(e) => { e.preventDefault(); a.run(() => giveAccessByEmail(v.name, v.email, v.months, v.note), "Access given.", () => setV({ name: "", email: "", months: 12, note: "" })); }}>
      <Input placeholder="Name (if new)" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <Input type="email" placeholder="Email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required />
      <Input inputMode="numeric" value={String(v.months)} onChange={(e) => setV({ ...v, months: Number(e.target.value) || 12 })} aria-label="Months" title="Months" />
      <Input placeholder="Why (optional)" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      <Button size="sm" variant="primary" disabled={a.pending}>Give free access</Button>
      <div className="sm:col-span-5"><Msg m={a.msg} /></div>
    </form>
  );
}

export function EndAccess({ id }: { id: string }) {
  const [sure, setSure] = useState(false);
  const a = useAct();
  if (!sure) return <button type="button" onClick={() => setSure(true)} className="text-[0.75rem] text-ink-faint hover:text-rose-700" aria-label="End access"><Trash2 className="h-3.5 w-3.5" /></button>;
  return <span className="inline-flex items-center gap-1.5 text-[0.75rem]"><button type="button" className="font-medium text-rose-700" disabled={a.pending} onClick={() => a.run(() => endAccess(id), "Ended.")}>End now</button><button type="button" className="text-ink-muted" onClick={() => setSure(false)}>Keep</button></span>;
}

/* ------------------------------------------------------------------ training rooms */

export function VenueRow({ id, initial }: { id: string; initial: { status: "pending" | "approved" | "hidden"; commission_pct: number; image_url: string; office_note: string; hourly_rate: number | null; day_rate: number | null } }) {
  const [v, setV] = useState(initial);
  const a = useAct();
  return (
    <form className="grid gap-2 sm:grid-cols-[130px_90px_100px_100px_1fr_auto]" onSubmit={(e) => { e.preventDefault(); a.run(() => saveVenue(id, v)); }}>
      <Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as typeof v.status })} aria-label="Status"><option value="pending">Waiting</option><option value="approved">Approved (listed)</option><option value="hidden">Hidden</option></Select>
      <Input inputMode="decimal" value={String(v.commission_pct)} onChange={(e) => setV({ ...v, commission_pct: Number(e.target.value) || 0 })} aria-label="Commission %" title="Commission %" />
      <Input inputMode="decimal" placeholder="$/hr" value={v.hourly_rate ?? ""} onChange={(e) => setV({ ...v, hourly_rate: Number(e.target.value) || null })} aria-label="Per hour" />
      <Input inputMode="decimal" placeholder="$/day" value={v.day_rate ?? ""} onChange={(e) => setV({ ...v, day_rate: Number(e.target.value) || null })} aria-label="Per day" />
      <Input placeholder="Photo link (https://…)" value={v.image_url} onChange={(e) => setV({ ...v, image_url: e.target.value })} />
      <Button size="sm" disabled={a.pending}>Save</Button>
      <Input className="sm:col-span-6" placeholder="Office note (only you see this)" value={v.office_note} onChange={(e) => setV({ ...v, office_note: e.target.value })} />
      {a.msg && <div className="sm:col-span-6"><Msg m={a.msg} /></div>}
    </form>
  );
}

export function HireActions({ id, status, amount, venuePaid, payPath, base }: { id: string; status: string; amount: number | null; venuePaid: boolean; payPath: string | null; base: string }) {
  const [amt, setAmt] = useState(amount ? String(amount) : "");
  const [link, setLink] = useState<string | null>(payPath ? `${base}${payPath}` : null);
  const [copied, setCopied] = useState(false);
  const a = useAct();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "paid" && status !== "cancelled" && (
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); a.run(() => confirmHire(id, Number(amt)), "Confirmed.", (p) => setLink(`${base}${p}`)); }}>
          <input className={cn(inputClass, "h-8 w-24")} inputMode="decimal" placeholder="Price $" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Price" />
          <Button size="sm" disabled={a.pending}>{status === "confirmed" ? "Update" : "Confirm"}</Button>
        </form>
      )}
      {link && status !== "paid" && status !== "cancelled" && <Button size="sm" variant="ghost" type="button" onClick={() => { navigator.clipboard.writeText(link).then(() => setCopied(true)); }}><Copy className="h-3.5 w-3.5" />{copied ? "Copied" : "Copy pay link"}</Button>}
      {status === "paid" && !venuePaid && <Button size="sm" type="button" disabled={a.pending} onClick={() => a.run(() => setHireStatus(id, "venue_paid"), "Marked paid.")}>Mark venue paid</Button>}
      {status !== "paid" && status !== "cancelled" && <Button size="sm" variant="ghost" type="button" disabled={a.pending} onClick={() => a.run(() => setHireStatus(id, "cancelled"), "Cancelled.")}>Cancel</Button>}
      <Msg m={a.msg?.ok ? null : a.msg} />
    </div>
  );
}
