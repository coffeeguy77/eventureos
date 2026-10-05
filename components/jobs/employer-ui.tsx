"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CalendarDays, Check, Clock, DollarSign, FileText, Loader2, Mail, MapPin, Plus, RefreshCw, Users, X, CalendarRange } from "lucide-react";
import { employerLoginAction, employerRegisterAction, postJobAction, saveEmployerAction, setPostStatusAction, type PostInput } from "@/app/jobs/actions";
import { EQUIPMENT_BRANDS, EQUIPMENT_TYPES, JOB_KINDS, equipmentLabel, type Equipment, type EquipmentType } from "@/lib/jobs/core";

/* Dark form styles from the employer page designs */
export const dInput = "h-11 w-full min-w-0 rounded-lg border border-white/[0.18] bg-black/30 px-3 text-[0.9375rem] text-white placeholder:text-white/40 transition focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_30%,transparent)]";
const dSelect = `${dInput} cursor-pointer appearance-none truncate bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23ffffffb3' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9 [&>option]:bg-[#1b1517] [&>option]:text-white`;
const dLabel = "mb-1.5 block text-[0.8125rem] font-medium text-white/90";
const opt = <span className="font-normal text-white/55"> (optional)</span>;
export const dBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--b)] px-5 text-[0.9375rem] font-semibold text-[var(--on-b)] transition hover:brightness-105 disabled:opacity-50";
export const dBtn2 = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-black/20 px-4 text-[0.875rem] font-semibold text-white/90 transition hover:bg-white/10 disabled:opacity-40";
type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-[0.875rem] font-medium ${m.ok ? "text-emerald-400" : "text-rose-300"}`}>{m.text}</p> : null);
const STATES = ["ACT", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT"];

type Addr = { address: string; suburb: string; state: string; postcode: string; website: string; instagram: string };
function AddressLinks<T extends Addr>({ idp, f, set }: { idp: string; f: T; set: (k: keyof Addr, v: string) => void }) {
  return (
    <>
      <div><label htmlFor={`${idp}-ad`} className={dLabel}>Street address</label><input id={`${idp}-ad`} className={dInput} value={f.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" maxLength={200} placeholder="e.g. Shop 2, 15 Lonsdale St" /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(80px,112px)_minmax(84px,112px)]">
        <div className="col-span-2 sm:col-span-1"><label htmlFor={`${idp}-s`} className={dLabel}>Suburb</label><input id={`${idp}-s`} className={dInput} value={f.suburb} onChange={(e) => set("suburb", e.target.value)} autoComplete="address-level2" maxLength={80} /></div>
        <div><label htmlFor={`${idp}-st`} className={dLabel}>State</label><select id={`${idp}-st`} className={dSelect} value={f.state} onChange={(e) => set("state", e.target.value)}><option value="">—</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label htmlFor={`${idp}-pc`} className={dLabel}>Postcode</label><input id={`${idp}-pc`} inputMode="numeric" maxLength={4} className={dInput} value={f.postcode} onChange={(e) => set("postcode", e.target.value.replace(/\D/g, ""))} autoComplete="postal-code" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={`${idp}-w`} className={dLabel}>Website{opt}</label><input id={`${idp}-w`} className={dInput} value={f.website} onChange={(e) => set("website", e.target.value)} inputMode="url" placeholder="yourcafe.com.au" maxLength={200} /></div>
        <div><label htmlFor={`${idp}-ig`} className={`${dLabel} whitespace-nowrap`}>Instagram{opt}</label>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/60">@</span><input id={`${idp}-ig`} className={`${dInput} pl-8`} value={f.instagram} onChange={(e) => set("instagram", e.target.value.replace(/^@+/, ""))} autoCapitalize="none" autoCorrect="off" maxLength={60} placeholder="yourcafe" /></div></div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ sign up / sign in */

export function EmployerAuthDark({ slug, approval = false }: { slug: string; approval?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [f, setF] = useState({ business: "", name: "", email: "", phone: "", website: "", instagram: "", address: "", suburb: "", state: "", postcode: "", about: "" });
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  if (done) return <div className="rounded-xl bg-emerald-500/15 p-4 text-[0.9375rem] text-emerald-100"><Mail className="mb-2 h-6 w-6" />{done}</div>;
  return (
    <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => {
      const r = mode === "signup" ? await employerRegisterAction(slug, f) : await employerLoginAction(slug, f.email);
      if (r.ok) setDone(r.data); else setErr(r.error);
    }); }}>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.14] bg-black/25 p-1 text-[0.875rem] font-semibold">
        {(["signup", "signin"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`h-10 rounded-lg transition ${mode === m ? "bg-[var(--b)] text-[var(--on-b)]" : "text-white/85 hover:text-white"}`}>{m === "signup" ? "New employer" : "Sign in"}</button>
        ))}
      </div>
      {mode === "signup" && (
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="ea-b" className={dLabel}>Business name</label><input id="ea-b" required className={dInput} value={f.business} onChange={(e) => set("business", e.target.value)} autoComplete="organization" /></div>
          <div><label htmlFor="ea-n" className={dLabel}>Your name</label><input id="ea-n" required autoComplete="name" className={dInput} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        </div>
      )}
      <div><label htmlFor="ea-e" className={dLabel}>Email</label><input id="ea-e" type="email" required autoComplete="email" className={dInput} value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
      {mode === "signup" && (
        <>
          <div className="grid grid-cols-2 gap-3"><div><label htmlFor="ea-p" className={dLabel}>Phone</label><input id="ea-p" type="tel" autoComplete="tel" className={dInput} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div></div>
          <AddressLinks idp="ea" f={f} set={(k, v) => set(k, v)} />
          <div><label htmlFor="ea-a" className={dLabel}>About your business</label><textarea id="ea-a" rows={3} maxLength={1500} className={`${dInput} h-auto min-h-[84px] py-2.5 leading-relaxed`} value={f.about} onChange={(e) => set("about", e.target.value)} placeholder="Café, coffee cart, events… what kind of staff you need." /></div>
        </>
      )}
      <button type="submit" disabled={pending} className={`${dBtn} h-12 w-full text-[1rem]`}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "signup" ? "Sign up" : "Email me a sign-in link"}</button>
      {err && <p className="text-[0.875rem] font-medium text-rose-300">{err}</p>}
      <p className="text-[0.8125rem] leading-relaxed text-white/65">{mode === "signup" ? (approval ? "No password — we check every employer first (usually within a day), then email you a link to sign in." : "No password — we email you a link to sign in, and you can start searching straight away.") : "No password — we email you a link."}</p>
    </form>
  );
}

/* ------------------------------------------------------------------ coffee gear */

/** Pick from leading brands or type your own. Roomy on every screen size — nothing gets cut off. */
export function EquipmentPickerDark({ value, onChange }: { value: Equipment[]; onChange: (v: Equipment[]) => void }) {
  const [type, setType] = useState<EquipmentType>("grinder");
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
            <li key={i} className="inline-flex max-w-full items-start gap-2 rounded-lg border border-white/15 bg-white/[0.07] py-1.5 pl-3 pr-1.5 text-[0.8438rem] text-white">
              <span className="min-w-0 break-words"><span className="text-white/70">{EQUIPMENT_TYPES.find((t) => t.id === e.type)?.label}:</span> {equipmentLabel(e)}</span>
              <button type="button" aria-label={`Remove ${equipmentLabel(e)}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/70 hover:bg-white/15 hover:text-white"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(150px,0.75fr)_minmax(190px,1.4fr)_minmax(190px,1.6fr)_auto]">
        <select aria-label="Type of equipment" className={dSelect} value={type} onChange={(e) => { setType(e.target.value as EquipmentType); setBrand(""); }}>
          {EQUIPMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {brand === "__own"
          ? <input aria-label="Brand" className={dInput} value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Brand" maxLength={60} autoFocus />
          : <select aria-label="Brand" className={dSelect} value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Choose a brand…</option>
              {EQUIPMENT_BRANDS[type].map((b) => <option key={b} value={b}>{b}</option>)}
              <option value="__own">Other — type it in</option>
            </select>}
        <input aria-label="Model (optional)" className={dInput} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model (optional) e.g. Linea PB" maxLength={60} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} disabled={!chosen || value.length >= 12} className={`${dBtn2} h-11 px-5`}><Plus className="h-4 w-4" />Add</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ business details */

type EmpForm = { business: string; name: string; phone: string; website: string; instagram: string; address: string; suburb: string; state: string; postcode: string; about: string; equipment: Equipment[] };

export function EmployerDetailsDark({ slug, initial }: { slug: string; initial: EmpForm }) {
  const [f, setF] = useState(initial);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof EmpForm, v: string) => { setF({ ...f, [k]: v }); setM(null); };
  return (
    <form className="grid gap-3.5" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveEmployerAction(slug, f); setM(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="ed-b" className={dLabel}>Business name</label><input id="ed-b" className={dInput} value={f.business} onChange={(e) => set("business", e.target.value)} /></div>
        <div><label htmlFor="ed-n" className={dLabel}>Your name</label><input id="ed-n" className={dInput} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label htmlFor="ed-p" className={dLabel}>Phone</label><input id="ed-p" type="tel" className={dInput} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
      </div>
      <AddressLinks idp="ed" f={f} set={(k, v) => set(k, v)} />
      <div><label htmlFor="ed-a" className={dLabel}>About your business</label><textarea id="ed-a" rows={3} className={`${dInput} h-auto min-h-[84px] py-2.5 leading-relaxed`} value={f.about} onChange={(e) => set("about", e.target.value)} placeholder="Café, coffee cart, events… the vibe, how busy you are, what you're looking for." /></div>
      <div>
        <p className="text-[0.875rem] font-semibold text-white">Your coffee gear</p>
        <p className="mb-2.5 text-[0.75rem] text-white/65">Baristas like to know what they&apos;ll be working on.</p>
        <EquipmentPickerDark value={f.equipment} onChange={(v) => { setF({ ...f, equipment: v }); setM(null); }} />
      </div>
      <div className="flex items-center gap-4 pt-1"><button type="submit" disabled={pending} className={`${dBtn} px-7`}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</button><Note m={m} /></div>
    </form>
  );
}

/* ------------------------------------------------------------------ post a job */

const KIND_ICON: Record<string, React.ElementType> = { one_off: CalendarDays, event: CalendarRange, regular: RefreshCw, ongoing: Briefcase };

function IconInput({ icon: I, ...p }: { icon: React.ElementType } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div className="relative"><I className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/70" strokeWidth={1.8} /><input {...p} className={`${dInput} h-12 pl-11 ${p.className ?? ""}`} /></div>;
}

/** A date box that says "Select date" until one is picked (the browser's own picker opens on tap/click). */
function DateField({ id, value, onChange, placeholder, min }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; min?: string }) {
  const [focus, setFocus] = useState(false);
  const show = !value && !focus;
  return (
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-white/70" strokeWidth={1.8} />
      <input id={id} type="date" min={min} value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        className={`${dInput} relative h-12 pl-11 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 ${show ? "text-transparent" : ""}`} />
      {show && <span className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-[0.9375rem] text-white/40">{placeholder}</span>}
    </div>
  );
}

/** "8:00 AM–4:00 PM" ↔ start and finish */
const splitTimes = (t: string) => { const [a, b] = t.split(/\s*[–—-]\s*/); return { start: a?.trim() ?? "", finish: b?.trim() ?? "" }; };

export function PostJobDark({ slug, initial, postId, defaultSuburb }: { slug: string; initial?: PostInput; postId?: string; defaultSuburb: string }) {
  const router = useRouter();
  const [f, setF] = useState<PostInput>(initial ?? { title: "", kind: "one_off", description: "", suburb: defaultSuburb, starts_on: "", ends_on: "", times: "", pay: "", positions: 1 });
  const t0 = splitTimes(initial?.times ?? "");
  const [times, setTimes] = useState(t0);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const dated = f.kind === "one_off" || f.kind === "event";
  const lab = "mb-2 block text-[0.9375rem] font-semibold text-white";
  return (
    <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const t = dated ? [times.start.trim(), times.finish.trim()].filter(Boolean).join("–") : f.times;
      const r = await postJobAction(slug, { ...f, times: t, positions: Number(f.positions) || 1 }, postId);
      if (r.ok) router.push(`/jobs/${slug}/employers?posted=1`); else setM({ ok: false, text: r.error });
    }); }}>
      <div>
        <p className={lab}>Job type</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label="Job type">
          {JOB_KINDS.map((k) => {
            const I = KIND_ICON[k.id] ?? CalendarDays;
            const on = f.kind === k.id;
            return (
              <button key={k.id} type="button" role="radio" aria-checked={on} onClick={() => setF({ ...f, kind: k.id })}
                className={`flex h-[54px] items-center justify-center gap-2 rounded-lg border px-2 text-[0.875rem] font-semibold transition ${on ? "border-[var(--b)] bg-[var(--b)] text-[var(--on-b)]" : "border-white/[0.16] bg-black/25 text-white hover:border-white/35"}`}>
                <I className="h-5 w-5 shrink-0" strokeWidth={1.8} /><span className="whitespace-nowrap">{k.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div><label htmlFor="pd-t" className={lab}>Job title</label><input id="pd-t" required maxLength={120} className={`${dInput} h-12`} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Barista, Senior Barista, Café All-rounder" /></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label htmlFor="pd-s" className={lab}>{dated ? "Date" : <>Start date{opt}</>}</label><DateField id="pd-s" value={f.starts_on} onChange={(v) => setF({ ...f, starts_on: v })} placeholder="Select date" /></div>
        {dated
          ? <div><label htmlFor="pd-e" className={lab}>Until{opt}</label><DateField id="pd-e" min={f.starts_on || undefined} value={f.ends_on} onChange={(v) => setF({ ...f, ends_on: v })} placeholder="Select end date" /></div>
          : <div><label htmlFor="pd-h" className={lab}>Days &amp; times</label><IconInput icon={Clock} id="pd-h" maxLength={120} value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} placeholder={f.kind === "regular" ? "e.g. Sat & Sun 7am–1pm" : "e.g. Mon–Fri, 30 hrs"} /></div>}
      </div>
      {dated && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div><label htmlFor="pd-st" className={lab}>Start time</label><IconInput icon={Clock} id="pd-st" maxLength={20} value={times.start} onChange={(e) => setTimes({ ...times, start: e.target.value })} placeholder="e.g. 8:00 AM" /></div>
          <div><label htmlFor="pd-ft" className={lab}>Finish time</label><IconInput icon={Clock} id="pd-ft" maxLength={20} value={times.finish} onChange={(e) => setTimes({ ...times, finish: e.target.value })} placeholder="e.g. 4:00 PM" /></div>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label htmlFor="pd-l" className={lab}>Suburb</label><IconInput icon={MapPin} id="pd-l" maxLength={80} value={f.suburb} onChange={(e) => setF({ ...f, suburb: e.target.value })} placeholder="e.g. Richmond" /></div>
        <div><label htmlFor="pd-p" className={lab}>Pay</label><IconInput icon={DollarSign} id="pd-p" maxLength={80} value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value })} placeholder="e.g. $30–$35/hr" /></div>
      </div>
      <div><label htmlFor="pd-n" className={lab}>Baristas needed</label><IconInput icon={Users} id="pd-n" type="number" min={1} max={50} value={String(f.positions)} onChange={(e) => setF({ ...f, positions: Number(e.target.value) })} placeholder="e.g. 1" /></div>
      <div><label htmlFor="pd-d" className={lab}>Details about the job or shift</label>
        <div className="relative"><FileText className="pointer-events-none absolute left-3.5 top-3.5 h-[18px] w-[18px] text-white/70" strokeWidth={1.8} />
          <textarea id="pd-d" rows={4} maxLength={3000} className={`${dInput} h-auto min-h-[96px] py-3 pl-11 leading-relaxed`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Tell baristas what to expect, what the role involves, and any other important information..." /></div></div>
      <button type="submit" disabled={pending} className={`${dBtn} h-12 w-full text-[1.0625rem]`}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{postId ? "Save job" : "Post job"}</button>
      <Note m={m} />
    </form>
  );
}

export function PostStatusDark({ slug, postId, status }: { slug: string; postId: string; status: string }) {
  const router = useRouter();
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const go = (s: "open" | "filled" | "closed") => start(async () => { const r = await setPostStatusAction(slug, postId, s); setM(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "open" ? (<>
        <button type="button" disabled={pending} onClick={() => go("filled")} className={`${dBtn} h-10 px-4 text-[0.875rem]`}><Check className="h-4 w-4" />Filled</button>
        <button type="button" disabled={pending} onClick={() => go("closed")} className={dBtn2}>Close</button>
      </>) : <button type="button" disabled={pending} onClick={() => go("open")} className={dBtn2}>Re-open</button>}
      <Note m={m} />
    </div>
  );
}
