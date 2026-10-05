"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { requestCertificateAction, requestLoginAction, saveDetailsAction, signInAction } from "@/app/book/account-actions";

const input = "h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-ink-faint focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_25%,transparent)]";
const btn = "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--b)] px-5 text-[0.9375rem] font-semibold text-[var(--on-b)] hover:opacity-90 disabled:opacity-50";

export function LoginForm({ orgSlug }: { orgSlug: string }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await requestLoginAction(orgSlug, email).catch(() => ({ ok: false as const, error: "Couldn't reach us — try again." })); setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); }); }} className="space-y-3">
      {msg?.ok ? (
        <div className="rounded-xl bg-emerald-50 p-4 text-[0.9375rem] text-emerald-900"><Mail className="mb-2 h-6 w-6" />{msg.text}</div>
      ) : (<>
        <label className="block text-[0.875rem] font-medium text-ink" htmlFor="acc-email">Email you booked with</label>
        <input id="acc-email" type="email" inputMode="email" autoComplete="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" disabled={pending} className={`${btn} w-full`}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Email me a sign-in link</button>
        {msg && <p className="text-[0.875rem] font-medium text-rose-700">{msg.text}</p>}
        <p className="text-[0.8125rem] text-ink-muted">No password needed — we email you a link that signs you in.</p>
      </>)}
    </form>
  );
}

export function SignInButton({ orgSlug, token }: { orgSlug: string; token: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await signInAction(orgSlug, token); if (r && !r.ok) setErr(r.error); })} className={`${btn} w-full`}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}Sign in
      </button>
      {err && <p className="mt-3 text-[0.875rem] font-medium text-rose-700">{err}</p>}
    </div>
  );
}

export function DetailsForm({ orgSlug, initial }: { orgSlug: string; initial: { name: string; phone: string; marketing: boolean } }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveDetailsAction(orgSlug, f); setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); }); }} className="grid gap-3 sm:grid-cols-2">
      <div><label className="mb-1 block text-[0.8125rem] font-medium text-ink" htmlFor="d-n">Name (as it appears on your certificate)</label><input id="d-n" className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><label className="mb-1 block text-[0.8125rem] font-medium text-ink" htmlFor="d-p">Mobile</label><input id="d-p" type="tel" className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <label className="flex items-center gap-3 text-[0.875rem] text-ink sm:col-span-2"><input type="checkbox" className="h-5 w-5 accent-[var(--b)]" checked={f.marketing} onChange={(e) => setF({ ...f, marketing: e.target.checked })} />Email me about new classes and offers</label>
      <div className="flex items-center gap-3 sm:col-span-2"><button type="submit" disabled={pending} className={btn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>{msg && <span className={`text-[0.875rem] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}</div>
    </form>
  );
}

export function RequestCertificate({ orgSlug, requested }: { orgSlug: string; requested: boolean }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(requested ? "We've got your request — we'll be in touch." : null);
  const [pending, start] = useTransition();
  if (msg) return <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[0.875rem] text-emerald-900">{msg}</p>;
  return (
    <div className="space-y-2">
      <input className={input} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Which course and roughly when? (e.g. Looking for work, March 2023)" />
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await requestCertificateAction(orgSlug, note); setMsg(r.ok ? r.message : r.error); })} className={btn}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}Request my certificate
      </button>
    </div>
  );
}
