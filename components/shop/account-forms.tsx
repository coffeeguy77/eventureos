"use client";

import { useState, useTransition } from "react";
import { Loader2, LogOut, Mail } from "lucide-react";
import { myDetailsAction, shopLoginAction, shopSignOutAction, shopVerifyAction } from "@/app/shop/actions";

export function ShopSignIn({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await shopLoginAction(slug, email); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); }); }}
      className="rounded-[26px] bg-[#FFFDFC] p-6 ring-1 ring-[#EAE1D7] sm:p-8">
      <h2 className="text-[1.375rem] font-semibold">Sign in</h2>
      <p className="mt-1 text-[0.9688rem] text-[#5b5955]">We&apos;ll email you a link — no password needed. Use the email you order with.</p>
      <label className="mt-5 block text-[0.875rem] font-medium" htmlFor="si-e">Email</label>
      <div className="relative mt-1.5"><Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8a817a]" />
        <input id="si-e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-12 w-full rounded-xl border border-[#E2D8CD] bg-white pl-11 pr-3 text-base focus:border-[var(--b)] focus:outline-none" /></div>
      {msg && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-[0.9375rem] ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}
      <button type="submit" disabled={pending} className="shop-btn mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--b)] font-semibold text-[var(--on-b)] disabled:opacity-60">{pending && <Loader2 className="h-4 w-4 animate-spin" />}Email me a sign-in link</button>
    </form>
  );
}

export function ShopVerify({ slug, token }: { slug: string; token: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-[26px] bg-[#FFFDFC] p-8 text-center ring-1 ring-[#EAE1D7]">
      <h1 className="text-[1.5rem] font-semibold">Sign in to your coffee account</h1>
      {err && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-rose-800">{err}</p>}
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await shopVerifyAction(slug, token); if (r && !r.ok) setErr(r.error); })}
        className="shop-btn mt-6 inline-flex h-14 items-center gap-2 rounded-2xl bg-[var(--b)] px-8 text-[1.0625rem] font-semibold text-[var(--on-b)]">{pending && <Loader2 className="h-5 w-5 animate-spin" />}Sign in</button>
    </div>
  );
}

export function DetailsForm({ slug, name, phone, marketing }: { slug: string; name: string; phone: string; marketing: boolean }) {
  const [f, setF] = useState({ name, phone, marketing });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "h-11 w-full rounded-xl border border-[#E2D8CD] bg-white px-3 focus:border-[var(--b)] focus:outline-none";
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await myDetailsAction(slug, f); setMsg(r.ok ? r.data : r.error); }); }} className="space-y-3">
      <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" placeholder="Name" />
      <input className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} aria-label="Mobile" placeholder="Mobile" type="tel" />
      <label className="flex items-center gap-2 text-[0.9063rem]"><input type="checkbox" checked={f.marketing} onChange={(e) => setF({ ...f, marketing: e.target.checked })} className="h-5 w-5 accent-[var(--b)]" />News about new coffees and offers</label>
      <div className="flex items-center gap-3"><button type="submit" disabled={pending} className="h-11 rounded-xl bg-[#171714] px-4 font-semibold text-white">Save</button>{msg && <span className="text-[0.875rem] text-[#5b5955]">{msg}</span>}</div>
    </form>
  );
}

export function SignOutButton({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => start(() => shopSignOutAction(slug))} className="inline-flex items-center gap-1.5 text-[0.875rem] font-medium text-[#6b655f] hover:text-[#171714]"><LogOut className="h-4 w-4" />Sign out</button>;
}
