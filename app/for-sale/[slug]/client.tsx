"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InteractiveTour, type TourSpace } from "@/components/sales/tour";
import { requestAccess, signNda } from "./actions";
import s from "./sale.module.css";

export function SaleTour({ spaces }: { spaces: TourSpace[] }) {
  return <InteractiveTour spaces={spaces} plain height="clamp(380px, 68vh, 760px)" />;
}

export function NdaForm({ slug, token, text }: { slug: string; token: string; text: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { setErr(null); const r = await signNda(slug, token, name, agreed); if (!r.ok) setErr(r.error); else router.refresh(); }); }}>
      <div className={s.nda}>{text}</div>
      <label className={s.check}><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />I agree to keep this information confidential, as set out above.</label>
      <label className={s.field}>Your full name, as your signature<input className={s.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First and last name" /></label>
      <button className={s.btn} type="submit" disabled={pending}>{pending ? "Signing…" : "Sign and open the full information"}</button>
      {err && <p className={s.err} role="alert">{err}</p>}
    </form>
  );
}

export function RequestForm({ slug, contact }: { slug: string; contact: string | null }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <div><h3 className={s.gateTitle} style={{ fontSize: "1.4rem" }}>Request sent</h3><p className={s.gateText}>The seller will be in touch. If they approve it, you&apos;ll get a private link to the full information.</p></div>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { setErr(null); const r = await requestAccess(slug, f); if (!r.ok) setErr(r.error); else setDone(true); }); }}>
      <label className={s.field}>Your name<input className={s.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
      <label className={s.field}>Email<input className={s.input} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
      <label className={s.field}>Phone (optional)<input className={s.input} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></label>
      <label className={s.field}>Anything the seller should know (optional)<textarea className={s.input} style={{ height: "5.5rem", paddingTop: "0.7rem" }} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="e.g. I run two cafés in Sydney and I'm looking at Canberra" /></label>
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
      <button className={s.btn} type="submit" disabled={pending}>{pending ? "Sending…" : "Ask for access"}</button>
      {err && <p className={s.err} role="alert">{err}{contact ? <> — <a href={`mailto:${contact}`}>{contact}</a></> : null}</p>}
    </form>
  );
}

export function PrintButton() {
  return <button type="button" className={s.print} onClick={() => window.print()}>Save as PDF</button>;
}
