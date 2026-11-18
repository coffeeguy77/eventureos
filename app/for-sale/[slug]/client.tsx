"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InteractiveTour, type TourSpace } from "@/components/sales/tour";
import { signNda } from "./actions";
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
