"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Eye, EyeOff, Loader2, Lock, Mail, Send, Trash2 } from "lucide-react";
import {
  baristaReplyAction, contactBaristaAction, employerLoginAction, employerRegisterAction, employerReplyAction, employerSignInAction, interestedAction, joinAction,
  jobsLoginAction, jobsSignInAction, postJobAction, requestContactAction, saveEmployerAction, saveProfileAction, setPostStatusAction, shareContactAction,
  unsubscribeAction, uploadPhotoAction, type PostInput,
} from "@/app/jobs/actions";
import { DAY_LABEL, DAYS, EQUIPMENT_BRANDS, EQUIPMENT_TYPES, EXPERIENCE, JOB_KINDS, SKILLS, SLOT_LABEL, SLOTS, WORK_TYPES, equipmentLabel, type Availability, type Equipment, type EquipmentType } from "@/lib/jobs/core";
import type { Profile } from "@/lib/jobs/server";
import { btn2Cls as btn2, btnCls as btn, inputCls as input } from "./styles";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-[0.875rem] font-medium ${m.ok ? "text-emerald-700" : "text-rose-700"}`}>{m.text}</p> : null);
const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => <label htmlFor={htmlFor} className="mb-1 block text-[0.8125rem] font-medium text-ink">{children}</label>;
const chip = (on: boolean) => `inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[0.8438rem] font-medium ring-1 transition ${on ? "bg-[var(--b)] text-[var(--on-b)] ring-[var(--b)]" : "bg-surface text-ink ring-line-strong hover:bg-zinc-50"}`;

/* ------------------------------------------------------------------ sign in / sign up */

export function BaristaAuth({ slug, startWith = "signin", tone = "light" }: { slug: string; startWith?: "signin" | "signup"; tone?: "light" | "dark" }) {
  const [mode, setMode] = useState(startWith);
  const [f, setF] = useState({ name: "", email: "" });
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dark = tone === "dark";
  const field = dark
    ? "h-12 w-full rounded-xl border border-white/15 bg-white/5 pl-11 pr-3.5 text-base text-white placeholder:text-white/40 focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_35%,transparent)]"
    : input;
  const lab = dark ? "mb-1.5 block text-[0.8438rem] font-medium text-white/85" : "mb-1 block text-[0.8125rem] font-medium text-ink";
  if (done) return <div className={`rounded-xl p-4 text-[0.9375rem] ${dark ? "bg-emerald-500/15 text-emerald-100" : "bg-emerald-50 text-emerald-900"}`}><Mail className="mb-2 h-6 w-6" />{done}</div>;
  return (
    <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => {
      const r = await jobsLoginAction(slug, f.email, mode === "signup" ? f.name : undefined).catch(() => ({ ok: false as const, error: "Couldn't reach us — try again." }));
      if (r.ok) setDone(r.data); else setErr(r.error);
    }); }}>
      <div className={`grid grid-cols-2 gap-1 rounded-xl p-1 text-[0.9063rem] font-semibold ${dark ? "bg-white/5 ring-1 ring-white/10" : "bg-zinc-100"}`}>
        {(["signin", "signup"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
            className={`h-11 rounded-lg transition ${mode === m ? (dark ? "bg-[var(--b)] text-[var(--on-b)]" : "bg-surface text-ink shadow-sm") : (dark ? "text-white/80 hover:text-white" : "text-ink-muted")}`}>
            {m === "signin" ? "I trained with you" : <>I&apos;m new here</>}
          </button>
        ))}
      </div>
      {mode === "signup" && <div><label htmlFor="ba-n" className={lab}>Your name</label><input id="ba-n" required autoComplete="name" className={dark ? field.replace("pl-11", "pl-3.5") : input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>}
      <div><label htmlFor="ba-e" className={lab}>{mode === "signup" ? "Email" : "Email you booked with"}</label>
        <div className="relative">{dark && <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/60" />}
          <input id="ba-e" type="email" inputMode="email" autoComplete="email" required className={field} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div></div>
      <button type="submit" disabled={pending} className={`${btn} w-full ${dark ? "h-[52px] text-[1rem]" : ""}`}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "signup" ? "Create my free profile" : "Email me a sign-in link"}{dark && !pending && <span aria-hidden>→</span>}</button>
      {err && <p className={`text-[0.875rem] font-medium ${dark ? "text-rose-300" : "text-rose-700"}`}>{err}</p>}
      <p className={`text-[0.8125rem] ${dark ? "text-white/60" : "text-ink-muted"}`}>No password — we email you a link that signs you in.</p>
    </form>
  );
}

/** One tap to use an emailed link (opening the link alone doesn't use it up). */
export function LinkSignIn({ slug, token, kind, label = "Sign in" }: { slug: string; token: string; kind: "barista" | "employer" | "join"; label?: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    const r = kind === "barista" ? await jobsSignInAction(slug, token) : kind === "employer" ? await employerSignInAction(slug, token) : await joinAction(slug, token);
    if (r && !r.ok) setErr(r.error);
  });
  return (
    <div className="space-y-3">
      <button type="button" disabled={pending} onClick={go} className={`${btn} w-full`}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{label}</button>
      {err && <p className="text-[0.875rem] font-medium text-rose-700">{err}</p>}
      {err && kind !== "employer" && <BaristaAuth slug={slug} />}
    </div>
  );
}

export function UnsubscribeButton({ slug, token }: { slug: string; token: string }) {
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  if (m?.ok) return <p className="rounded-xl bg-emerald-50 p-4 text-[0.9375rem] text-emerald-900">{m.text}</p>;
  return (
    <div className="space-y-3">
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await unsubscribeAction(slug, token); setM(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); })} className={`${btn} w-full`}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}Unsubscribe me
      </button>
      <Note m={m} />
    </div>
  );
}

/* ------------------------------------------------------------------ barista profile */

/** Shrink a photo in the browser to at most 600px, as a JPEG. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't read that photo.")); i.src = url; });
    const s = Math.min(1, 600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export function ProfileEditor({ slug, initial, student, certificates }: { slug: string; initial: Profile; student: { name: string; email: string | null; phone: string | null }; certificates: string[] }) {
  const router = useRouter();
  const [p, setP] = useState({
    display_name: initial.display_name ?? "", headline: initial.headline ?? "", bio: initial.bio ?? "", suburb: initial.suburb ?? "", state: initial.state ?? "", postcode: initial.postcode ?? "",
    travel_km: initial.travel_km, experience: initial.experience ?? "", skills: initial.skills, work_types: initial.work_types, availability: initial.availability as Availability,
    availability_note: initial.availability_note ?? "", share_email: initial.share_email, share_phone: initial.share_phone, show_certificates: initial.show_certificates, phone: student.phone ?? "",
  });
  const [photo, setPhoto] = useState(initial.photo_url);
  const [status, setStatus] = useState(initial.status);
  const [m, setM] = useState<Msg>(null);
  const [pm, setPm] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP((x) => ({ ...x, [k]: v }));
  const toggle = (k: "skills" | "work_types", v: string) => set(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v]);
  const toggleSlot = (d: (typeof DAYS)[number], s: (typeof SLOTS)[number]) => {
    const cur = p.availability[d] ?? [];
    set("availability", { ...p.availability, [d]: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] });
  };
  const preset = (days: (typeof DAYS)[number][]) => set("availability", Object.fromEntries(days.map((d) => [d, [...SLOTS]])) as Availability);

  const save = (next?: "active" | "hidden") => start(async () => {
    setM(null);
    const r = await saveProfileAction(slug, { ...p, experience: p.experience || null, travel_km: Number(p.travel_km), ...(next ? { status: next } : {}) });
    if (r.ok) { if (next) setStatus(next); setM({ ok: true, text: r.data }); router.refresh(); } else setM({ ok: false, text: r.error });
  });
  const pick = async (f: File) => {
    setUploading(true); setPm(null);
    try {
      const data = await shrink(f);
      const r = await uploadPhotoAction(slug, data);
      if (r.ok) setPhoto(r.data); else setPm({ ok: false, text: r.error });
    } catch (e) { setPm({ ok: false, text: e instanceof Error ? e.message : "Couldn't upload." }); }
    setUploading(false);
  };

  const live = status === "active";
  return (
    <div className="space-y-5">
      <section className={`rounded-2xl border p-5 shadow-card ${live ? "border-emerald-300 bg-emerald-50" : "border-line bg-surface"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[1.0625rem] font-semibold text-ink">{live ? "Your profile is on" : "Your profile is off"}</p>
            <p className="text-[0.875rem] text-ink-muted">{live ? "Your card is on the public job board (first name and initial, photo, suburb, skills and availability), and employers can message you. Your phone and email stay private." : "Nobody can see it until you switch it on. When it's on, your card (first name and initial, photo, suburb, skills and availability) shows on the public job board. Add your suburb first."}</p>
          </div>
          {live
            ? <button type="button" disabled={pending} onClick={() => save("hidden")} className={btn2}><EyeOff className="h-4 w-4" />Switch off</button>
            : <button type="button" disabled={pending} onClick={() => save("active")} className={btn}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Save & switch on</button>}
        </div>
        {m && <div className="mt-3"><Note m={m} /></div>}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-[1rem] font-semibold text-ink">About you</h2>
        <div className="mb-5 flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-zinc-100 ring-1 ring-line">
            {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[1.5rem] font-semibold text-ink-faint">{student.name.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className={btn2}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{photo ? "Change photo" : "Add a photo"}</button>
              {photo && <button type="button" disabled={uploading} onClick={async () => { const r = await uploadPhotoAction(slug, null); if (r.ok) setPhoto(null); }} className={btn2} aria-label="Remove photo"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <p className="text-[0.75rem] text-ink-muted">Optional. A friendly, clear photo of you.</p>
            <Note m={pm} />
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="p-dn">Name employers see</Label><input id="p-dn" className={input} maxLength={80} value={p.display_name} placeholder={(() => { const parts = student.name.trim().split(/\s+/); return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]; })()} onChange={(e) => set("display_name", e.target.value)} />
            <p className="mt-1 text-[0.75rem] text-ink-muted">Leave blank to show your first name and last initial.</p></div>
          <div><Label htmlFor="p-h">Headline</Label><input id="p-h" className={input} maxLength={120} value={p.headline} placeholder="Friendly barista, great with busy mornings" onChange={(e) => set("headline", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label htmlFor="p-b">A bit about you</Label><textarea id="p-b" rows={4} maxLength={1500} className={`${input} h-auto py-3`} value={p.bio} placeholder="Where you've worked, what you enjoy, anything an employer should know." onChange={(e) => set("bio", e.target.value)} /></div>
          <div><Label htmlFor="p-x">Experience</Label>
            <select id="p-x" className={input} value={p.experience} onChange={(e) => set("experience", e.target.value)}>
              <option value="">Choose…</option>{EXPERIENCE.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select></div>
        </div>
        {certificates.length > 0 && (
          <label className="mt-4 flex items-start gap-3 rounded-xl bg-zinc-50 p-3 text-[0.875rem] text-ink">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--b)]" checked={p.show_certificates} onChange={(e) => set("show_certificates", e.target.checked)} />
            <span>Show my certificates on my profile<span className="block text-[0.8125rem] text-ink-muted">{certificates.join(" · ")}</span></span>
          </label>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-1 text-[1rem] font-semibold text-ink">Where you can work</h2>
        <p className="mb-4 text-[0.8125rem] text-ink-muted">Employers search by location. Only your suburb is shown — never your address.</p>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_110px_120px]">
          <div><Label htmlFor="p-s">Suburb</Label><input id="p-s" className={input} maxLength={80} value={p.suburb} placeholder="e.g. Parramatta" onChange={(e) => set("suburb", e.target.value)} /></div>
          <div><Label htmlFor="p-st">State</Label>
            <select id="p-st" className={input} value={p.state} onChange={(e) => set("state", e.target.value)}>
              <option value="">—</option>{["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((s) => <option key={s}>{s}</option>)}
            </select></div>
          <div><Label htmlFor="p-pc">Postcode</Label><input id="p-pc" inputMode="numeric" maxLength={4} className={input} value={p.postcode} onChange={(e) => set("postcode", e.target.value.replace(/\D/g, ""))} /></div>
        </div>
        <div className="mt-4"><Label htmlFor="p-km">How far will you travel? <span className="font-semibold text-[var(--b)]">{p.travel_km} km</span></Label>
          <input id="p-km" type="range" min={2} max={100} step={1} value={p.travel_km} onChange={(e) => set("travel_km", Number(e.target.value))} className="w-full accent-[var(--b)]" /></div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-1 text-[1rem] font-semibold text-ink">When you&apos;re free</h2>
        <p className="mb-3 text-[0.8125rem] text-ink-muted">Tap the times you could work. Already working weekdays? Just choose the weekend.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" className={chip(false)} onClick={() => preset(["sat", "sun"])}>Weekends</button>
          <button type="button" className={chip(false)} onClick={() => preset(["mon", "tue", "wed", "thu", "fri"])}>Weekdays</button>
          <button type="button" className={chip(false)} onClick={() => preset([...DAYS])}>Any day</button>
          <button type="button" className={chip(false)} onClick={() => set("availability", {})}>Clear</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-separate border-spacing-1 text-[0.8125rem]">
            <thead><tr><th /><>{SLOTS.map((s) => <th key={s} className="pb-1 font-medium text-ink-muted">{SLOT_LABEL[s]}</th>)}</></tr></thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <th scope="row" className="pr-2 text-left font-semibold text-ink">{DAY_LABEL[d]}</th>
                  {SLOTS.map((s) => {
                    const on = (p.availability[d] ?? []).includes(s);
                    return <td key={s}><button type="button" aria-pressed={on} aria-label={`${DAY_LABEL[d]} ${SLOT_LABEL[s]}`} onClick={() => toggleSlot(d, s)}
                      className={`flex h-10 w-full items-center justify-center rounded-lg ring-1 ${on ? "bg-[var(--b)] text-[var(--on-b)] ring-[var(--b)]" : "bg-surface ring-line hover:bg-zinc-50"}`}>{on && <Check className="h-4 w-4" />}</button></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3"><Label htmlFor="p-an">Anything else about your availability?</Label><input id="p-an" className={input} maxLength={300} value={p.availability_note} placeholder="e.g. School holidays any day; can start at 6am" onChange={(e) => set("availability_note", e.target.value)} /></div>
        <div className="mt-4">
          <p className="mb-2 text-[0.8125rem] font-medium text-ink">Kind of work</p>
          <div className="flex flex-wrap gap-2">{WORK_TYPES.map((w) => <button key={w.id} type="button" aria-pressed={p.work_types.includes(w.id)} className={chip(p.work_types.includes(w.id))} onClick={() => toggle("work_types", w.id)}>{w.label}</button>)}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-[1rem] font-semibold text-ink">Skills</h2>
        <div className="flex flex-wrap gap-2">{SKILLS.map((s) => <button key={s} type="button" aria-pressed={p.skills.includes(s)} className={chip(p.skills.includes(s))} onClick={() => toggle("skills", s)}>{s}</button>)}</div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-1 flex items-center gap-2 text-[1rem] font-semibold text-ink"><Lock className="h-4 w-4 text-[var(--b)]" />Your contact details</h2>
        <p className="mb-4 text-[0.8125rem] text-ink-muted">Private by default. Employers message you through the board, and you choose who gets your number — or show it to everyone below.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="p-e">Email</Label><input id="p-e" className={`${input} bg-zinc-50`} value={student.email ?? ""} readOnly /></div>
          <div><Label htmlFor="p-ph">Mobile</Label><input id="p-ph" type="tel" className={input} value={p.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        </div>
        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-3 text-[0.875rem] text-ink"><input type="checkbox" className="h-5 w-5 accent-[var(--b)]" checked={p.share_phone} onChange={(e) => set("share_phone", e.target.checked)} />Show my mobile to all approved employers</label>
          <label className="flex items-center gap-3 text-[0.875rem] text-ink"><input type="checkbox" className="h-5 w-5 accent-[var(--b)]" checked={p.share_email} onChange={(e) => set("share_email", e.target.checked)} />Show my email to all approved employers</label>
        </div>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
        <button type="button" disabled={pending} onClick={() => save()} className={btn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</button>
        {!live && <button type="button" disabled={pending} onClick={() => save("active")} className={btn2}><Eye className="h-4 w-4" />Save & switch on</button>}
        <Note m={m} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ jobs & messages */

export function InterestButton({ slug, postId, business }: { slug: string; postId: string; business: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(`Hi! I'm interested in this job and available. Let me know if you'd like to chat.`);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn}>I&apos;m interested</button>;
  return (
    <div className="w-full space-y-2">
      <label htmlFor={`int-${postId}`} className="block text-[0.8125rem] font-medium text-ink">Message to {business}</label>
      <textarea id={`int-${postId}`} rows={3} maxLength={3000} className={`${input} h-auto py-3`} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} className={btn} onClick={() => start(async () => {
          const r = await interestedAction(slug, postId, text);
          if (r.ok) router.push(`/jobs/${slug}/messages?t=${r.data}`); else setM({ ok: false, text: r.error });
        })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send</button>
        <button type="button" onClick={() => setOpen(false)} className={btn2}>Cancel</button>
      </div>
      <p className="text-[0.75rem] text-ink-muted">Your phone and email aren&apos;t shared — you can choose to share them later.</p>
      <Note m={m} />
    </div>
  );
}

export function Composer({ slug, threadId, side }: { slug: string; threadId: string; side: "barista" | "employer" }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; start(async () => {
      const r = side === "barista" ? await baristaReplyAction(slug, threadId, text) : await employerReplyAction(slug, threadId, text);
      if (r.ok) { setText(""); setM(null); router.refresh(); } else setM({ ok: false, text: r.error });
    }); }}>
      <div className="min-w-0 flex-1">
        <label htmlFor="compose" className="sr-only">Message</label>
        <textarea id="compose" rows={2} maxLength={3000} className={`${input} h-auto py-3`} placeholder="Write a message…" value={text} onChange={(e) => setText(e.target.value)} />
        <Note m={m} />
      </div>
      <button type="submit" disabled={pending || !text.trim()} className={btn} aria-label="Send">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
    </form>
  );
}

export function ShareContactButton({ slug, threadId, business }: { slug: string; threadId: string; business: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  if (!sure) return <button type="button" onClick={() => setSure(true)} className={btn2}><Lock className="h-4 w-4" />Share my phone & email</button>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 p-3 text-[0.8438rem] text-amber-950">
      <span className="min-w-0 flex-1">Share your mobile and email with {business}? This can&apos;t be undone.</span>
      <button type="button" disabled={pending} onClick={() => start(async () => { await shareContactAction(slug, threadId); router.refresh(); })} className={btn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Yes, share</button>
      <button type="button" onClick={() => setSure(false)} className={btn2}>Not now</button>
    </div>
  );
}

export function RequestContactButton({ slug, threadId }: { slug: string; threadId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => start(async () => { await requestContactAction(slug, threadId); router.refresh(); })} className={btn2}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Ask for their phone & email</button>;
}

/* ------------------------------------------------------------------ employers */

export function EmployerAuth({ slug, approval = false }: { slug: string; approval?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [f, setF] = useState({ business: "", name: "", email: "", phone: "", website: "", instagram: "", address: "", suburb: "", state: "", postcode: "", about: "" });
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  if (done) return <div className="rounded-xl bg-emerald-50 p-4 text-[0.9375rem] text-emerald-900"><Mail className="mb-2 h-6 w-6" />{done}</div>;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => {
      const r = mode === "signup" ? await employerRegisterAction(slug, f) : await employerLoginAction(slug, f.email);
      if (r.ok) setDone(r.data); else setErr(r.error);
    }); }}>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-[0.875rem] font-semibold">
        <button type="button" onClick={() => setMode("signup")} className={`h-10 rounded-lg ${mode === "signup" ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}>New employer</button>
        <button type="button" onClick={() => setMode("signin")} className={`h-10 rounded-lg ${mode === "signin" ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}>Sign in</button>
      </div>
      {mode === "signup" && (<div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="em-b">Business name</Label><input id="em-b" required className={input} value={f.business} onChange={up("business")} /></div>
        <div><Label htmlFor="em-n">Your name</Label><input id="em-n" required autoComplete="name" className={input} value={f.name} onChange={up("name")} /></div>
      </div>)}
      <div><Label htmlFor="em-e">Email</Label><input id="em-e" type="email" required autoComplete="email" className={input} value={f.email} onChange={up("email")} /></div>
      {mode === "signup" && (<>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="em-p">Phone</Label><input id="em-p" type="tel" className={input} value={f.phone} onChange={up("phone")} /></div>
        </div>
        <AddressFields idp="em" f={f} up={up as UpFn} />
        <LinkFields idp="em" f={f} up={up as UpFn} />
        <div><Label htmlFor="em-a">About your business</Label><textarea id="em-a" rows={3} maxLength={1500} className={`${input} h-auto py-3`} value={f.about} onChange={up("about")} placeholder="Café, coffee cart, events… what kind of staff you need." /></div>
      </>)}
      <button type="submit" disabled={pending} className={`${btn} w-full`}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "signup" ? "Sign up" : "Email me a sign-in link"}</button>
      {err && <p className="text-[0.875rem] font-medium text-rose-700">{err}</p>}
      <p className="text-[0.8125rem] text-ink-muted">{mode === "signup" ? (approval ? "We check every employer before they can search or post — usually within a day." : "No password — we email you a link to sign in, and you can start searching straight away.") : "No password — we email you a link."}</p>
    </form>
  );
}

type Addr = { address: string; suburb: string; state: string; postcode: string };
type UpFn = (k: never) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;

/** Street address — baristas see where the business is (and distance search uses it). */
function AddressFields({ idp, f, up }: { idp: string; f: Addr; up: UpFn }) {
  const u = up as unknown as (k: keyof Addr) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_110px]">
      <div className="sm:col-span-3"><Label htmlFor={`${idp}-ad`}>Street address</Label><input id={`${idp}-ad`} className={input} value={f.address} onChange={u("address")} autoComplete="street-address" maxLength={200} placeholder="e.g. Shop 2, 15 Lonsdale St" /></div>
      <div><Label htmlFor={`${idp}-s`}>Suburb</Label><input id={`${idp}-s`} className={input} value={f.suburb} onChange={u("suburb")} autoComplete="address-level2" maxLength={80} /></div>
      <div><Label htmlFor={`${idp}-st`}>State</Label><select id={`${idp}-st`} className={input} value={f.state} onChange={u("state")}><option value="">—</option>{["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((x) => <option key={x}>{x}</option>)}</select></div>
      <div><Label htmlFor={`${idp}-pc`}>Postcode</Label><input id={`${idp}-pc`} inputMode="numeric" maxLength={4} className={input} value={f.postcode} onChange={u("postcode")} autoComplete="postal-code" /></div>
    </div>
  );
}

/** Website and Instagram as separate fields — only the Instagram username is needed. */
function LinkFields({ idp, f, up }: { idp: string; f: { website: string; instagram: string }; up: UpFn }) {
  const u = up as unknown as (k: "website" | "instagram") => (e: React.ChangeEvent<HTMLInputElement>) => void;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor={`${idp}-w`}>Website <span className="font-normal text-ink-faint">(optional)</span></Label><input id={`${idp}-w`} className={input} value={f.website} onChange={u("website")} inputMode="url" placeholder="yourcafe.com.au" maxLength={200} /></div>
      <div><Label htmlFor={`${idp}-ig`}>Instagram username <span className="font-normal text-ink-faint">(optional)</span></Label>
        <div className="flex items-center rounded-xl border border-line-strong bg-surface focus-within:border-[var(--b)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--b)_25%,transparent)]">
          <span className="pl-3.5 text-base text-ink-faint">@</span>
          <input id={`${idp}-ig`} className="h-12 min-w-0 flex-1 rounded-xl bg-transparent px-1.5 text-base text-ink focus:outline-none" value={f.instagram} onChange={u("instagram")} autoCapitalize="none" autoCorrect="off" maxLength={60} placeholder="yourcafe" />
        </div></div>
    </div>
  );
}

/** The business's coffee gear: pick from leading brands or type your own. */
export function EquipmentPicker({ value, onChange }: { value: Equipment[]; onChange: (v: Equipment[]) => void }) {
  const [type, setType] = useState<EquipmentType>("machine");
  const [brand, setBrand] = useState("");
  const [own, setOwn] = useState("");
  const [model, setModel] = useState("");
  const chosen = brand === "__own" ? own.trim() : brand;
  const add = () => {
    if (!chosen) return;
    onChange([...value, { type, brand: chosen.slice(0, 60), model: model.trim().slice(0, 60) || null }].slice(0, 12));
    setBrand(""); setOwn(""); setModel("");
  };
  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((e, i) => (
            <li key={i} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 py-1.5 pl-3 pr-1.5 text-[0.8438rem] text-ink">
              <span className="text-ink-muted">{EQUIPMENT_TYPES.find((t) => t.id === e.type)?.label}:</span> {equipmentLabel(e)}
              <button type="button" aria-label={`Remove ${equipmentLabel(e)}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="grid h-6 w-6 place-items-center rounded-full text-ink-muted hover:bg-zinc-200 hover:text-ink"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select aria-label="Type of equipment" className={input} value={type} onChange={(e) => { setType(e.target.value as EquipmentType); setBrand(""); }}>
          {EQUIPMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {brand === "__own"
          ? <input aria-label="Brand" className={input} value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Brand" maxLength={60} autoFocus />
          : <select aria-label="Brand" className={input} value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Choose a brand…</option>
              {EQUIPMENT_BRANDS[type].map((b) => <option key={b} value={b}>{b}</option>)}
              <option value="__own">Other — type it in</option>
            </select>}
        <input aria-label="Model (optional)" className={input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model (optional) e.g. Linea PB" maxLength={60} />
        <button type="button" onClick={add} disabled={!chosen || value.length >= 12} className={btn2}>Add</button>
      </div>
    </div>
  );
}

type EmpForm = { business: string; name: string; phone: string; website: string; instagram: string; address: string; suburb: string; state: string; postcode: string; about: string; equipment: Equipment[] };

export function EmployerDetailsForm({ slug, initial }: { slug: string; initial: EmpForm }) {
  const [f, setF] = useState(initial);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const up = (k: keyof EmpForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveEmployerAction(slug, f); setM(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="ed-b">Business name</Label><input id="ed-b" className={input} value={f.business} onChange={up("business")} /></div>
        <div><Label htmlFor="ed-n">Your name</Label><input id="ed-n" className={input} value={f.name} onChange={up("name")} /></div>
        <div><Label htmlFor="ed-p">Phone</Label><input id="ed-p" type="tel" className={input} value={f.phone} onChange={up("phone")} /></div>
      </div>
      <AddressFields idp="ed" f={f} up={up as UpFn} />
      <LinkFields idp="ed" f={f} up={up as UpFn} />
      <div><Label htmlFor="ed-a">About your business</Label><textarea id="ed-a" rows={3} className={`${input} h-auto py-3`} value={f.about} onChange={up("about")} placeholder="Café, coffee cart, events… the vibe, how busy you are, what you're looking for." /></div>
      <div>
        <p className="mb-1 text-[0.8125rem] font-medium text-ink">Your coffee gear</p>
        <p className="mb-2 text-[0.75rem] text-ink-muted">Baristas like to know what they&apos;ll be working on.</p>
        <EquipmentPicker value={f.equipment} onChange={(v) => setF({ ...f, equipment: v })} />
      </div>
      <div className="flex items-center gap-3"><button type="submit" disabled={pending} className={btn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</button><Note m={m} /></div>
    </form>
  );
}

export function PostJobForm({ slug, initial, postId, defaultSuburb }: { slug: string; initial?: PostInput; postId?: string; defaultSuburb: string }) {
  const router = useRouter();
  const [f, setF] = useState<PostInput>(initial ?? { title: "", kind: "one_off", description: "", suburb: defaultSuburb, starts_on: "", ends_on: "", times: "", pay: "", positions: 1 });
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const up = (k: keyof PostInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const dated = f.kind === "one_off" || f.kind === "event";
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await postJobAction(slug, { ...f, positions: Number(f.positions) }, postId);
      if (r.ok) router.push(`/jobs/${slug}/employers?posted=1`); else setM({ ok: false, text: r.error });
    }); }}>
      <div><p className="mb-2 text-[0.8125rem] font-medium text-ink">Type of job</p>
        <div className="flex flex-wrap gap-2">{JOB_KINDS.map((k) => <button key={k.id} type="button" aria-pressed={f.kind === k.id} className={chip(f.kind === k.id)} onClick={() => setF({ ...f, kind: k.id })}>{k.label}</button>)}</div></div>
      <div><Label htmlFor="pj-t">Title</Label><input id="pj-t" required maxLength={120} className={input} value={f.title} onChange={up("title")} placeholder="e.g. Barista for Saturday markets" /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="pj-s">{dated ? "Date" : "Start date (optional)"}</Label><input id="pj-s" type="date" className={input} value={f.starts_on} onChange={up("starts_on")} /></div>
        {dated && <div><Label htmlFor="pj-e">Until (if more than one day)</Label><input id="pj-e" type="date" className={input} value={f.ends_on} onChange={up("ends_on")} /></div>}
        <div><Label htmlFor="pj-h">Times</Label><input id="pj-h" maxLength={120} className={input} value={f.times} onChange={up("times")} placeholder={f.kind === "regular" ? "Sat & Sun 7am–1pm" : "6am–12pm"} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="pj-l">Suburb</Label><input id="pj-l" maxLength={80} className={input} value={f.suburb} onChange={up("suburb")} /></div>
        <div><Label htmlFor="pj-p">Pay</Label><input id="pj-p" maxLength={80} className={input} value={f.pay} onChange={up("pay")} placeholder="$32/hr" /></div>
        <div><Label htmlFor="pj-n">Baristas needed</Label><input id="pj-n" type="number" min={1} max={50} className={input} value={f.positions} onChange={(e) => setF({ ...f, positions: Number(e.target.value) })} /></div>
      </div>
      <div><Label htmlFor="pj-d">Details</Label><textarea id="pj-d" rows={5} maxLength={3000} className={`${input} h-auto py-3`} value={f.description} onChange={up("description")} placeholder="What the job involves, the machine you use, what you're looking for." /></div>
      <div className="flex items-center gap-3"><button type="submit" disabled={pending} className={btn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{postId ? "Save job" : "Post job"}</button><Note m={m} /></div>
    </form>
  );
}

export function PostStatusButtons({ slug, postId, status }: { slug: string; postId: string; status: string }) {
  const router = useRouter();
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const go = (s: "open" | "filled" | "closed") => start(async () => { const r = await setPostStatusAction(slug, postId, s); setM(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "open" ? (<>
        <button type="button" disabled={pending} onClick={() => go("filled")} className={btn}><Check className="h-4 w-4" />Filled</button>
        <button type="button" disabled={pending} onClick={() => go("closed")} className={btn2}>Close</button>
      </>) : <button type="button" disabled={pending} onClick={() => go("open")} className={btn2}>Re-open</button>}
      <Note m={m} />
    </div>
  );
}

export function ContactBarista({ slug, profileId, name, posts, hasContact }: { slug: string; profileId: string; name: string; posts: { id: string; title: string }[]; hasContact: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(`Hi ${name.split(" ")[0]}, we're looking for a barista and your profile looks great. Would you be interested?`);
  const [post, setPost] = useState("");
  const [ask, setAsk] = useState(!hasContact);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {posts.length > 0 && <div><Label htmlFor="cb-p">About a job (optional)</Label>
        <select id="cb-p" className={input} value={post} onChange={(e) => setPost(e.target.value)}><option value="">General enquiry</option>{posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>}
      <div><Label htmlFor="cb-m">Message</Label><textarea id="cb-m" rows={4} maxLength={3000} className={`${input} h-auto py-3`} value={text} onChange={(e) => setText(e.target.value)} /></div>
      {!hasContact && <label className="flex items-center gap-3 text-[0.875rem] text-ink"><input type="checkbox" className="h-5 w-5 accent-[var(--b)]" checked={ask} onChange={(e) => setAsk(e.target.checked)} />Ask {name.split(" ")[0]} to share their phone & email</label>}
      <button type="button" disabled={pending} className={`${btn} w-full`} onClick={() => start(async () => {
        const r = await contactBaristaAction(slug, profileId, text, ask, post || null);
        if (r.ok) router.push(`/jobs/${slug}/employers/messages?t=${r.data}`); else setM({ ok: false, text: r.error });
      })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send message</button>
      <Note m={m} />
    </div>
  );
}
