"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Lock, Mail, MessageSquare, Printer, Send, UserRound } from "lucide-react";
import { giftCardAction } from "@/app/shop/actions";
import { GiftCard } from "@/components/gifts/gift-card";

const field = "h-12 w-full rounded-xl border border-[#E2D8CD] bg-white pl-11 pr-3.5 text-base placeholder:text-[#9A948F] focus:border-[var(--b)] focus:outline-none";
const label = "mb-1.5 block text-[0.9063rem] font-medium";
const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n).replace(/\.00$/, "");

export function ShopGiftForm({ slug, amounts, minDate, art, tagline, business, years, redeem }: { slug: string; amounts: number[]; minDate: string; art: string | null; tagline: string; business: string; years: number | null; redeem: string }) {
  const [amount, setAmount] = useState(amounts[Math.min(2, amounts.length - 1)] ?? amounts[0]);
  const [f, setF] = useState({ purchaserName: "", purchaserEmail: "", recipientName: "", recipientEmail: "", message: "", sendOn: "" });
  const [direct, setDirect] = useState(false);
  const [back, setBack] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const choice = (on: boolean) => `flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${on ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_6%,white)] ring-1 ring-[var(--b)]" : "border-[#E2D8CD] bg-white hover:border-[#CDBFB1]"}`;
  return (
    <form onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => {
      const r = await giftCardAction({ orgSlug: slug, amount, purchaserName: f.purchaserName, purchaserEmail: f.purchaserEmail, recipientName: f.recipientName, recipientEmail: direct ? f.recipientEmail : null, message: f.message, sendOn: direct ? f.sendOn : null })
        .catch(() => ({ ok: false as const, error: "Couldn't reach the shop — try again." }));
      if (!r.ok) setErr(r.error); else window.location.href = r.data;
    }); }} className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <GiftCard flipped={back} onFlip={setBack} label="See the back"
          front={{ art, words: { eyebrow: "A gift for you", title: "Fresh coffee", subtitle: "Gift card", tagline } }}
          back={{ to: f.recipientName.trim() || null, from: f.purchaserName.trim() || null, message: f.message.trim() || null, value: money(amount), valueNote: "to spend on coffee", code: "BEANS-XXXX-XXXX", business, art, redeem }} />
      </div>
      <div className="rounded-[28px] bg-[#FFFDFC] p-5 ring-1 ring-[#EAE1D7] sm:p-7">
        <h2 className="text-[1.25rem] font-semibold">Choose an amount</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {amounts.map((a) => <button key={a} type="button" onClick={() => { setAmount(a); setBack(false); }} className={`relative rounded-2xl border py-4 text-[1.25rem] font-bold transition ${a === amount ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_8%,white)] ring-1 ring-[var(--b)]" : "border-[#E2D8CD] bg-white hover:border-[#CDBFB1]"}`} aria-pressed={a === amount}>{money(a)}{a === amount && <Check className="absolute right-2 top-2 h-4 w-4 text-[var(--b)]" strokeWidth={3} />}</button>)}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="sg-rn">Their name</label><div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8F8984]" /><input id="sg-rn" className={field} value={f.recipientName} onChange={set("recipientName")} onFocus={() => setBack(true)} maxLength={120} /></div></div>
          <div><label className={label} htmlFor="sg-pn">Your name</label><div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8F8984]" /><input id="sg-pn" className={field} required value={f.purchaserName} onChange={set("purchaserName")} onFocus={() => setBack(true)} maxLength={120} autoComplete="name" /></div></div>
          <div className="sm:col-span-2"><label className={label} htmlFor="sg-pe">Your email</label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8F8984]" /><input id="sg-pe" type="email" required className={field} value={f.purchaserEmail} onChange={set("purchaserEmail")} autoComplete="email" /></div></div>
          <div className="sm:col-span-2"><label className={label} htmlFor="sg-m">Message for the back <span className="font-normal text-[#8a817a]">(optional)</span></label><div className="relative"><MessageSquare className="pointer-events-none absolute left-3.5 top-4 h-5 w-5 text-[#8F8984]" />
            <textarea id="sg-m" rows={3} className={`${field} h-auto py-3`} value={f.message} onChange={set("message")} onFocus={() => setBack(true)} maxLength={200} placeholder="Enjoy your coffee! …" /></div><p className="mt-1 text-right text-[0.8125rem] text-[#8a817a]">{f.message.length}/200</p></div>
        </div>
        <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
          <button type="button" onClick={() => setDirect(false)} className={choice(!direct)}><Printer className="h-6 w-6 shrink-0 text-[var(--b)]" /><span><span className="block font-semibold">Email to me</span><span className="block text-[0.8125rem] text-[#6b655f]">Print or forward it</span></span></button>
          <button type="button" onClick={() => setDirect(true)} className={choice(direct)}><Send className="h-6 w-6 shrink-0 text-[var(--b)]" /><span><span className="block font-semibold">Email to them</span><span className="block text-[0.8125rem] text-[#6b655f]">Now or on a date</span></span></button>
        </div>
        {direct && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><label className={label} htmlFor="sg-re">Their email</label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8F8984]" /><input id="sg-re" type="email" required className={field} value={f.recipientEmail} onChange={set("recipientEmail")} /></div></div>
            <div><label className={label} htmlFor="sg-d">Send on <span className="font-normal text-[#8a817a]">(blank = now)</span></label><input id="sg-d" type="date" min={minDate} className={`${field} pl-3.5`} value={f.sendOn} onChange={set("sendOn")} /></div>
          </div>
        )}
        {err && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-[0.9063rem] font-medium text-rose-800">{err}</p>}
        <button type="submit" disabled={pending} className="shop-btn mt-6 flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--b)] text-[1.125rem] font-semibold text-[var(--on-b)] shadow-[0_14px_30px_-14px_var(--b)] disabled:opacity-60">{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}Pay {money(amount)} securely</button>
        <p className="mt-3 text-center text-[0.8125rem] text-[#6b655f]">Spend it on any coffee or a prepaid subscription{years ? ` · valid for ${years} year${years === 1 ? "" : "s"}` : ""}.</p>
      </div>
    </form>
  );
}
