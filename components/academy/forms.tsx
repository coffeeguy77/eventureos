"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, Sparkles, Target } from "lucide-react";
import {
  buyAction, cancelMonthlyAction, challengeAction, enquireRoomAction, learnLoginAction, learnSignInAction, listRoomAction, payHireAction, saveProfileAction,
} from "@/app/academy/actions";
import type { Plan } from "@/lib/learn/core";
import { AU_STATES } from "@/lib/learn/core";
import { btn, btnGhost, field } from "./ui";

const label = "mb-1.5 block text-[0.8125rem] font-medium text-ink";
const Err = ({ text }: { text: string | null }) => (text ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[0.875rem] font-medium text-rose-800">{text}</p> : null);

/** Sign in (or sign up) with an emailed link. */
export function LearnLogin({ slug, signup = true }: { slug: string; signup?: boolean }) {
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <div className="rounded-xl bg-emerald-50 p-4 text-[0.9375rem] text-emerald-900"><Mail className="mb-2 h-6 w-6" />{msg.text}</div>;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await learnLoginAction(slug, email, name).catch(() => ({ ok: false as const, error: "Couldn't reach us — try again." })); setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); }); }}>
      {signup && <div><label className={label} htmlFor="l-name">Your name <span className="font-normal text-ink-faint">(new here? we&apos;ll set you up)</span></label><input id="l-name" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={160} /></div>}
      <div><label className={label} htmlFor="l-email">Email</label><input id="l-email" type="email" inputMode="email" autoComplete="email" required className={field} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <button type="submit" disabled={pending} className={`${btn} w-full`}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Email me a sign-in link</button>
      {msg && !msg.ok && <p className="text-[0.875rem] font-medium text-rose-700">{msg.text}</p>}
      <p className="text-[0.8125rem] text-ink-muted">No password — we email you a link that signs you in. Booked a class with us? Use the same email.</p>
    </form>
  );
}

export function LearnSignIn({ slug, token }: { slug: string; token: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await learnSignInAction(slug, token); if (r && !r.ok) setErr(r.error); })} className={`${btn} w-full`}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}Sign in
      </button>
      {err && <p className="mt-3 text-[0.875rem] font-medium text-rose-700">{err}</p>}
    </div>
  );
}

/** Buy a plan: signed-in learners just pick; others give a name and email first. */
export function JoinForm({ slug, plans, initial, signedIn }: { slug: string; plans: { plan: Plan; title: string; price: string; note: string; badge?: string | null }[]; initial: Plan | null; signedIn: boolean }) {
  const [plan, setPlan] = useState<Plan | null>(initial && plans.some((p) => p.plan === initial) ? initial : plans[0]?.plan ?? null);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [marketing, setMarketing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault(); if (!plan) return; setErr(null);
      start(async () => {
        const r = await buyAction(slug, plan, signedIn ? {} : { name, email, marketing }).catch(() => ({ ok: false as const, error: "Couldn't reach us — try again." }));
        if (!r.ok) { setErr(r.error); return; }
        window.location.href = r.redirect;
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Choose a plan">
        {plans.map((p) => (
          <button key={p.plan} type="button" role="radio" aria-checked={plan === p.plan} onClick={() => setPlan(p.plan)}
            className={`relative rounded-2xl border p-4 text-left transition ${plan === p.plan ? "border-[var(--b)] ring-2 ring-[var(--b)]" : "border-line hover:bg-zinc-50"}`}>
            {p.badge && <span className="absolute -top-2.5 right-3 rounded-full bg-[var(--b)] px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--on-b)]">{p.badge}</span>}
            <span className="block text-[0.9375rem] font-semibold text-ink">{p.title}</span>
            <span className="mt-1 block text-[1.375rem] font-bold tracking-tight text-ink">{p.price}</span>
            <span className="mt-1 block text-[0.8125rem] text-ink-muted">{p.note}</span>
          </button>
        ))}
      </div>
      {!signedIn && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="j-name">Your name</label><input id="j-name" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={160} /></div>
          <div><label className={label} htmlFor="j-email">Email <span className="font-normal text-ink-faint">(you&apos;ll sign in with this)</span></label><input id="j-email" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
          <label className="flex items-start gap-3 text-[0.875rem] text-ink-muted sm:col-span-2"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--b)]" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />Email me about new classes and offers.</label>
        </div>
      )}
      <Err text={err} />
      <button type="submit" disabled={pending || !plan} className={`${btn} h-14 w-full text-[1.0625rem]`}>{pending && <Loader2 className="h-5 w-5 animate-spin" />}Continue to secure payment</button>
      <p className="text-center text-[0.75rem] text-ink-faint">Payments by Stripe.</p>
    </form>
  );
}

export function ChallengeCard({ slug, challenge, done }: { slug: string; challenge: { id: string; title: string; description: string | null; xp_reward: number }; done: boolean }) {
  const [note, setNote] = useState(""); const [state, setState] = useState<{ done: boolean; text: string | null }>({ done, text: null });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      <p className="flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-[var(--b)]"><Target className="h-4 w-4" />Today&apos;s challenge · +{challenge.xp_reward} XP</p>
      <p className="mt-1 text-[1.0625rem] font-semibold text-ink">{challenge.title}</p>
      {challenge.description && <p className="mt-1 text-[0.9375rem] text-ink-muted">{challenge.description}</p>}
      {state.done ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[0.9063rem] font-medium text-emerald-800"><Check className="h-4 w-4" />{state.text ?? "Done for today — see you tomorrow."}</p>
      ) : (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => {
          const r = await challengeAction(slug, challenge.id, note);
          if (!r.ok) { setErr(r.error); return; }
          setState({ done: true, text: r.message ?? `Nice work! +${r.xp} XP${r.badges.length ? ` · New badge: ${r.badges.join(", ")}` : ""}` }); router.refresh();
        }); }}>
          <textarea rows={2} className={`${field} h-auto py-3`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="How did it go? (optional)" />
          <button className={btn} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}I did it</button>
          <Err text={err} />
        </form>
      )}
    </div>
  );
}

export function ProfileForm({ slug, initial }: { slug: string; initial: { displayName: string; coachStyle: string; onLeaderboard: boolean } }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveProfileAction(slug, f); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); }); }}>
      <div><label className={label} htmlFor="p-dn">Name on the leaderboard</label><input id="p-dn" className={field} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} maxLength={40} placeholder="First name and last initial" /></div>
      <div><label className={label} htmlFor="p-cs">AI coach style</label>
        <select id="p-cs" className={field} value={f.coachStyle} onChange={(e) => setF({ ...f, coachStyle: e.target.value })}>
          <option value="mentor">Mentor — warm and encouraging</option><option value="strict">Strict — direct, high standards</option><option value="funny">Funny — puns and jokes</option>
        </select></div>
      <label className="flex items-center gap-3 text-[0.9063rem] text-ink"><input type="checkbox" className="h-5 w-5 accent-[var(--b)]" checked={f.onLeaderboard} onChange={(e) => setF({ ...f, onLeaderboard: e.target.checked })} />Show me on the leaderboard</label>
      <div className="flex items-center gap-3"><button className={btn} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>{msg && <span className={`text-[0.875rem] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}</div>
    </form>
  );
}

export function CancelMonthly({ slug, until }: { slug: string; until: string }) {
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!sure) return <button type="button" className={btnGhost} onClick={() => setSure(true)}>Cancel monthly plan</button>;
  return (
    <div className="space-y-2 rounded-xl bg-amber-50 p-4 text-[0.875rem] text-amber-900">
      <p>Stop the monthly payments? You keep access until {until}.</p>
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={pending} onClick={() => start(async () => { const r = await cancelMonthlyAction(slug); if (!r.ok) setErr(r.error); else router.refresh(); })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Yes, cancel</button>
        <button type="button" className={btnGhost} onClick={() => setSure(false)}>Keep it</button>
      </div>
      <Err text={err} />
    </div>
  );
}

/* ------------------------------------------------------------------ training rooms */

export function ListRoomForm({ slug, commission }: { slug: string; commission: number }) {
  const [f, setF] = useState<Record<string, string>>({ state: "" });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  if (done) return <p className="rounded-xl bg-emerald-50 p-4 text-[0.9375rem] text-emerald-900"><Sparkles className="mb-2 h-6 w-6" />Thanks! We&apos;ll check your listing and be in touch before it goes live.</p>;
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await listRoomAction(slug, f); if (r.ok) setDone(true); else setErr(r.error); }); }}>
      <div className="sm:col-span-2"><label className={label} htmlFor="v-name">Room or venue name</label><input id="v-name" className={field} required maxLength={160} value={f.name ?? ""} onChange={set("name")} /></div>
      <div><label className={label} htmlFor="v-biz">Business</label><input id="v-biz" className={field} maxLength={160} value={f.business_name ?? ""} onChange={set("business_name")} /></div>
      <div><label className={label} htmlFor="v-cn">Your name</label><input id="v-cn" className={field} maxLength={160} value={f.contact_name ?? ""} onChange={set("contact_name")} /></div>
      <div><label className={label} htmlFor="v-em">Email</label><input id="v-em" type="email" className={field} required value={f.email ?? ""} onChange={set("email")} /></div>
      <div><label className={label} htmlFor="v-ph">Phone</label><input id="v-ph" type="tel" className={field} maxLength={40} value={f.phone ?? ""} onChange={set("phone")} /></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="v-ad">Street address</label><input id="v-ad" className={field} maxLength={300} value={f.address ?? ""} onChange={set("address")} /></div>
      <div><label className={label} htmlFor="v-sub">Suburb</label><input id="v-sub" className={field} maxLength={120} value={f.suburb ?? ""} onChange={set("suburb")} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label} htmlFor="v-st">State</label><select id="v-st" className={field} required value={f.state} onChange={set("state")}><option value="">—</option>{AU_STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className={label} htmlFor="v-pc">Postcode</label><input id="v-pc" inputMode="numeric" className={field} maxLength={4} value={f.postcode ?? ""} onChange={set("postcode")} /></div>
      </div>
      <div><label className={label} htmlFor="v-cap">How many people</label><input id="v-cap" inputMode="numeric" className={field} value={f.capacity ?? ""} onChange={set("capacity")} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label} htmlFor="v-hr">$ per hour</label><input id="v-hr" inputMode="decimal" className={field} value={f.hourly_rate ?? ""} onChange={set("hourly_rate")} /></div>
        <div><label className={label} htmlFor="v-dr">$ per day</label><input id="v-dr" inputMode="decimal" className={field} value={f.day_rate ?? ""} onChange={set("day_rate")} /></div>
      </div>
      <div className="sm:col-span-2"><label className={label} htmlFor="v-eq">Equipment <span className="font-normal text-ink-faint">(machines, grinders, roaster…)</span></label><textarea id="v-eq" rows={2} className={`${field} h-auto py-3`} maxLength={2000} value={f.equipment ?? ""} onChange={set("equipment")} /></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="v-de">About the room</label><textarea id="v-de" rows={4} className={`${field} h-auto py-3`} maxLength={4000} value={f.description ?? ""} onChange={set("description")} /></div>
      <p className="text-[0.8125rem] text-ink-muted sm:col-span-2">Listing is free to set up. When a hire comes through us we take {commission}% and pay you the rest.</p>
      <div className="sm:col-span-2"><Err text={err} /></div>
      <button className={`${btn} sm:col-span-2`} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Send my listing</button>
    </form>
  );
}

export function EnquiryForm({ slug, venueId }: { slug: string; venueId: string }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  if (done) return <p className="rounded-xl bg-emerald-50 p-4 text-[0.9375rem] text-emerald-900"><Mail className="mb-2 h-6 w-6" />Thanks — we&apos;ll check the date with the venue and get back to you.</p>;
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await enquireRoomAction(slug, venueId, f); if (r.ok) setDone(true); else setErr(r.error); }); }}>
      <div><label className={label} htmlFor="e-n">Your name</label><input id="e-n" className={field} required maxLength={160} value={f.name ?? ""} onChange={set("name")} /></div>
      <div><label className={label} htmlFor="e-e">Email</label><input id="e-e" type="email" className={field} required value={f.email ?? ""} onChange={set("email")} /></div>
      <div><label className={label} htmlFor="e-p">Phone</label><input id="e-p" type="tel" className={field} maxLength={40} value={f.phone ?? ""} onChange={set("phone")} /></div>
      <div><label className={label} htmlFor="e-d">Date</label><input id="e-d" type="date" className={field} value={f.wanted_on ?? ""} onChange={set("wanted_on")} /></div>
      <div><label className={label} htmlFor="e-h">Hours</label><input id="e-h" inputMode="decimal" className={field} value={f.hours ?? ""} onChange={set("hours")} /></div>
      <div><label className={label} htmlFor="e-pp">People</label><input id="e-pp" inputMode="numeric" className={field} value={f.people ?? ""} onChange={set("people")} /></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="e-m">What&apos;s it for?</label><textarea id="e-m" rows={3} className={`${field} h-auto py-3`} maxLength={2000} value={f.message ?? ""} onChange={set("message")} /></div>
      <div className="sm:col-span-2"><Err text={err} /></div>
      <button className={`${btn} sm:col-span-2`} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Ask about this room</button>
    </form>
  );
}

export function PayHire({ token, label: text }: { token: string; label: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button type="button" className={`${btn} h-14 w-full`} disabled={pending} onClick={() => start(async () => { const r = await payHireAction(token); if (r.ok) window.location.href = r.redirect; else setErr(r.error); })}>{pending && <Loader2 className="h-5 w-5 animate-spin" />}{text}</button>
      <Err text={err} />
    </div>
  );
}
