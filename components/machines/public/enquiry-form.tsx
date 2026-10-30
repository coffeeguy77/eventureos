"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, CheckCircle2, Loader2, Send } from "lucide-react";
import { notServicedBrand } from "@/lib/machines/core";

const input = "h-12 w-full rounded-xl border border-[#E4DCD5] bg-white px-4 text-[1rem] text-[#151312] outline-none focus:border-[var(--pk)]";
const label = "mb-1.5 block text-[0.875rem] font-semibold text-[#2A2522]";

/**
 * The website enquiry form. "service" = repairs, servicing and installs (brands you don't service can't be sent);
 * "sale" = buying a machine (the machine chooser can pick the machine for them).
 */
export function MachineEnquiryForm({ slug, mode, notServiced, machines = [], initialMachine = "" }: {
  slug: string; mode: "service" | "sale"; notServiced: string[]; machines?: { slug: string; name: string }[]; initialMachine?: string;
}) {
  const [f, setF] = useState({ kind: mode === "sale" ? "sale" : "repair", name: "", email: "", phone: "", company: "", address: "", brand: "", model: "", serial: "", issue: "", preferred: "", machine: initialMachine, website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const loaded = useRef(Date.now());
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }));
  const blocked = useMemo(() => (mode === "service" ? notServicedBrand(`${f.brand} ${f.model}`, { notServiced }) : null), [mode, f.brand, f.model, notServiced]);

  // the machine chooser (same page) tells the form which machine they picked
  useEffect(() => {
    if (mode !== "sale") return;
    const on = (e: Event) => { const name = (e as CustomEvent<string>).detail; if (name) set({ machine: name }); };
    window.addEventListener("machine-pick", on);
    return () => window.removeEventListener("machine-pick", on);
  }, [mode]);

  const send = async () => {
    setErr(null);
    if (blocked) return;
    setBusy(true);
    try {
      const r = await fetch("/api/public/machines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, ...f, t: loaded.current }) }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error ?? "Couldn't send — please try again.");
      setDone(r.number || "sent");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send — please try again."); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="rounded-[24px] bg-white p-8 text-center shadow-[0_18px_40px_-28px_rgba(80,45,40,.35)]">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <p className="mt-4 text-[1.375rem] font-semibold">Thanks {f.name.split(/\s+/)[0]} — we&apos;ve got it.</p>
        <p className="mt-2 text-[1rem] text-[#5E5853]">{done !== "sent" ? <>Your reference is <b>{done}</b>. </> : null}We&apos;ll be in touch by email or phone{mode === "service" ? " to book a time" : " with pricing and delivery"}.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_40px_-28px_rgba(80,45,40,.35)] sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "service" && (
          <div className="sm:col-span-2">
            <span className={label}>What do you need?</span>
            <div className="grid grid-cols-3 gap-2">
              {([["repair", "Repair"], ["service", "Service"], ["install", "Install"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => set({ kind: k })} className={`h-12 rounded-xl text-[0.9375rem] font-semibold ring-1 transition ${f.kind === k ? "bg-[#151312] text-white ring-[#151312]" : "bg-white text-[#2A2522] ring-[#E4DCD5] hover:ring-[#151312]"}`}>{l}</button>
              ))}
            </div>
          </div>
        )}
        {mode === "service" ? (
          <>
            <div><label className={label} htmlFor="me-brand">Machine brand *</label><input id="me-brand" className={input} value={f.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="e.g. Dr Coffee, Rancilio" autoComplete="off" /></div>
            <div><label className={label} htmlFor="me-model">Model</label><input id="me-model" className={input} value={f.model} onChange={(e) => set({ model: e.target.value })} /></div>
            {blocked && (
              <div role="alert" className="flex items-start gap-3 rounded-2xl bg-[#B42318] p-4 text-white sm:col-span-2">
                <Ban className="mt-0.5 h-6 w-6 shrink-0" />
                <div><p className="text-[1.0625rem] font-bold">Sorry — we don&apos;t service {blocked} machines.</p><p className="mt-1 text-[0.9375rem] opacity-90">Please contact {blocked} or the store you bought it from for repairs.</p></div>
              </div>
            )}
          </>
        ) : (
          <div className="sm:col-span-2">
            <label className={label} htmlFor="me-machine">Which machine?</label>
            <select id="me-machine" className={input} value={f.machine} onChange={(e) => set({ machine: e.target.value })}>
              <option value="">Not sure yet — help me choose</option>
              {machines.map((m) => <option key={m.slug} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={label} htmlFor="me-issue">{mode === "service" ? "What's wrong, or what do you need? *" : "Tell us about your workplace"}</label>
          <textarea id="me-issue" rows={4} className={`${input} h-auto py-3`} value={f.issue} onChange={(e) => set({ issue: e.target.value })}
            placeholder={mode === "service" ? "e.g. Leaking from the group head, error code on screen, no steam…" : "How many people, how many coffees a day, fresh milk or not, plumbed water…"} />
        </div>
        <div><label className={label} htmlFor="me-name">Your name *</label><input id="me-name" className={input} value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" /></div>
        <div><label className={label} htmlFor="me-co">Business</label><input id="me-co" className={input} value={f.company} onChange={(e) => set({ company: e.target.value })} autoComplete="organization" /></div>
        <div><label className={label} htmlFor="me-email">Email *</label><input id="me-email" type="email" className={input} value={f.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" /></div>
        <div><label className={label} htmlFor="me-phone">Mobile *</label><input id="me-phone" type="tel" className={input} value={f.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" /></div>
        <div className="sm:col-span-2"><label className={label} htmlFor="me-addr">{mode === "service" ? "Where's the machine? (address or suburb)" : "Suburb"}</label><input id="me-addr" className={input} value={f.address} onChange={(e) => set({ address: e.target.value })} autoComplete="street-address" /></div>
        {mode === "service" && <div className="sm:col-span-2"><label className={label} htmlFor="me-when">When suits you?</label><input id="me-when" className={input} value={f.preferred} onChange={(e) => set({ preferred: e.target.value })} placeholder="e.g. weekday mornings, after 2pm, ASAP" /></div>}
        <input tabIndex={-1} aria-hidden className="hidden" value={f.website} onChange={(e) => set({ website: e.target.value })} autoComplete="off" />
      </div>
      {err && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-[0.9375rem] text-rose-700">{err}</p>}
      <button type="button" onClick={send} disabled={busy || !!blocked} className="shop-btn mt-6 inline-flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-8 text-[1.0625rem] font-semibold text-white disabled:opacity-50">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}{mode === "service" ? "Send my service request" : "Send my enquiry"}
      </button>
    </div>
  );
}
