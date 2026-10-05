"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Copy, Loader2, Mail, Pencil, Send, UserPlus } from "lucide-react";
import { agencyCodeAction, agentDetailsAction, agentJoinAction, agentLinkAction, agentPickAction, agentResendAction, agentSignInAction, agentUpdateSeekerAction, type AgencyCheck } from "@/app/book/agent-actions";

const input = "h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-ink-faint focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_25%,transparent)]";
const btn = "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--b)] px-5 text-[0.9375rem] font-semibold text-[var(--on-b)] hover:opacity-90 disabled:opacity-50";
const btn2 = "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[0.9375rem] font-semibold text-ink ring-1 ring-line-strong hover:bg-zinc-50 disabled:opacity-50";
const small = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold text-ink ring-1 ring-line hover:bg-zinc-50 disabled:opacity-50";
const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => <label htmlFor={htmlFor} className="mb-1.5 block text-[0.8125rem] font-medium text-ink">{children}</label>;
const Sent = ({ text }: { text: string }) => <div role="status" className="rounded-xl bg-emerald-50 p-4 text-[0.9375rem] text-emerald-900"><Mail className="mb-2 h-6 w-6" />{text}</div>;

/** Agency code → pick your name (or add yourself) → book a job seeker, or get a link to see your job seekers. */
export function AgencyStart({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [agency, setAgency] = useState<AgencyCheck | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", site: "" });
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const check = () => start(async () => {
    setErr(null);
    const r = await agencyCodeAction(orgSlug, code).catch(() => ({ ok: false as const, error: "Couldn't check it — try again." }));
    if (r.ok) { setAgency(r.data); setAdding(r.data.managers.length === 0); } else setErr(r.error);
  });
  const book = () => start(async () => {
    setErr(null);
    const r = await agentPickAction(orgSlug, code, picked!);
    if (r.ok) router.push(`/book/${orgSlug}`); else setErr(r.error);
  });
  const link = () => start(async () => {
    setErr(null);
    const r = await agentLinkAction(orgSlug, code, picked!);
    if (r.ok) setSent(r.data); else setErr(r.error);
  });
  const join = () => start(async () => {
    setErr(null);
    const r = await agentJoinAction(orgSlug, code, f);
    if (r.ok) router.refresh(); else setErr(r.error);
  });

  if (sent) return <Sent text={sent} />;

  if (!agency) return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); check(); }}>
      <Label htmlFor="ag-code">Agency code</Label>
      <div className="flex gap-2">
        <input id="ag-code" className={`${input} uppercase tracking-wider`} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" maxLength={40} required />
        <button type="submit" disabled={pending || code.trim().length < 3} className={btn}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Next</button>
      </div>
      {err && <p className="text-[0.875rem] font-medium text-rose-700">{err}</p>}
      <p className="text-[0.8125rem] text-ink-muted">The same code your organisation uses to book. Don&apos;t have it? Contact us.</p>
    </form>
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => { setAgency(null); setPicked(null); setAdding(false); }} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><ChevronLeft className="h-4 w-4" />{agency.name}</button>
      {!adding ? (<>
        <p className="text-[1rem] font-semibold text-ink">Who are you?</p>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Choose your name">
          {agency.managers.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={picked === m.id} onClick={() => { setPicked(m.id); setErr(null); }}
              className={`flex min-h-12 items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left ${picked === m.id ? "border-[var(--b)] ring-2 ring-[var(--b)]" : "border-line hover:bg-zinc-50"}`}>
              <span><span className="block font-semibold text-ink">{m.label}</span>{m.site && <span className="block text-[0.78rem] text-ink-muted">{m.site}</span>}</span>
              {picked === m.id && <Check className="h-5 w-5 text-[var(--b)]" />}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { setAdding(true); setPicked(null); }} className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-[var(--b)] hover:underline"><UserPlus className="h-4 w-4" />I&apos;m not on the list</button>
        {picked && (
          <div className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
            <button type="button" disabled={pending} onClick={book} className={btn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Book a job seeker</button>
            <button type="button" disabled={pending} onClick={link} className={btn2}><Mail className="h-4 w-4" />See my job seekers</button>
            <p className="text-[0.75rem] text-ink-muted sm:col-span-2">To keep your job seekers&apos; details private, we email you a sign-in link to see them.</p>
          </div>
        )}
      </>) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); join(); }}>
          <p className="text-[1rem] font-semibold text-ink">Add your details</p>
          <p className="text-[0.8125rem] text-ink-muted">Next time you&apos;ll just pick your name from the list.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="ag-n">Your name</Label><input id="ag-n" className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" required maxLength={160} /></div>
            <div><Label htmlFor="ag-e">Work email</Label><input id="ag-e" type="email" className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required maxLength={254} /></div>
            <div><Label htmlFor="ag-p">Phone</Label><input id="ag-p" type="tel" className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" maxLength={40} /></div>
            <div><Label htmlFor="ag-s">Office / site</Label><input id="ag-s" className={input} value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} maxLength={160} placeholder="e.g. Belconnen" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={btn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Continue</button>
            {agency.managers.length > 0 && <button type="button" onClick={() => setAdding(false)} className={btn2}>Back to the list</button>}
          </div>
        </form>
      )}
      {err && <p className="text-[0.875rem] font-medium text-rose-700">{err}</p>}
    </div>
  );
}

export function AgentLinkButton({ orgSlug, label = "Email me a link to see my job seekers" }: { orgSlug: string; label?: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sent) return <Sent text={sent} />;
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await agentLinkAction(orgSlug); if (r.ok) setSent(r.data); else setErr(r.error); })} className={`${btn2} w-full`}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{label}
      </button>
      {err && <p className="text-[0.875rem] font-medium text-rose-700">{err}</p>}
    </div>
  );
}

export function AgentSignIn({ orgSlug, token }: { orgSlug: string; token: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await agentSignInAction(orgSlug, token); if (r && !r.ok) setErr(r.error); })} className={`${btn} w-full`}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}See my job seekers
      </button>
      {err && <p className="text-[0.875rem] font-medium text-rose-700">{err} <a href={`/book/${orgSlug}/agency`} className="font-semibold underline">Start again</a></p>}
    </div>
  );
}

export function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={small} onClick={() => navigator.clipboard?.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }).catch(() => undefined)}>
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{done ? "Copied" : label}
    </button>
  );
}

/** Per job seeker: send the details again, or add their email/phone. */
export function SeekerActions({ orgSlug, bookingId, email, phone, canResend }: { orgSlug: string; bookingId: string; email: string | null; phone: string | null; canResend: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ email: email ?? "", phone: phone ?? "" });
  const [pending, start] = useTransition();
  const resend = (to: "me" | "student") => start(async () => { const r = await agentResendAction(orgSlug, bookingId, to); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canResend && <button type="button" disabled={pending} onClick={() => resend("me")} className={small}><Send className="h-3.5 w-3.5" />Course details to me</button>}
        {canResend && email && <button type="button" disabled={pending} onClick={() => resend("student")} className={small}><Send className="h-3.5 w-3.5" />Resend to them</button>}
        <button type="button" onClick={() => setEdit(!edit)} className={small}><Pencil className="h-3.5 w-3.5" />{email ? "Edit contact" : "Add their email"}</button>
      </div>
      {edit && (
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); start(async () => {
          const r = await agentUpdateSeekerAction(orgSlug, bookingId, f);
          setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
          if (r.ok) { setEdit(false); router.refresh(); }
        }); }}>
          <label className="sr-only" htmlFor={`se-${bookingId}`}>Their email</label>
          <input id={`se-${bookingId}`} type="email" className={`${input} h-10 text-[0.875rem]`} placeholder="Their email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <label className="sr-only" htmlFor={`sp-${bookingId}`}>Their mobile</label>
          <input id={`sp-${bookingId}`} type="tel" className={`${input} h-10 text-[0.875rem]`} placeholder="Their mobile" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <button type="submit" disabled={pending} className={`${small} h-10 justify-center`}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button>
        </form>
      )}
      {msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}

export function AgentDetails({ orgSlug, initial }: { orgSlug: string; initial: { phone: string; site: string } }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await agentDetailsAction(orgSlug, f); setMsg(r.ok ? r.data : r.error); }); }}>
      <div><Label htmlFor="ad-p">Phone</Label><input id="ad-p" type="tel" className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <div><Label htmlFor="ad-s">Office / site</Label><input id="ad-s" className={input} value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} /></div>
      <div className="flex items-center gap-3"><button type="submit" disabled={pending} className={btn2}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>{msg && <span role="status" className="text-[0.8125rem] text-ink-muted">{msg}</span>}</div>
    </form>
  );
}
