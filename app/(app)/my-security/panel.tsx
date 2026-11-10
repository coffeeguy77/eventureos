"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { confirmTwoStep, linkGoogle, removeTwoStep, startTwoStep } from "./actions";

export function SecurityPanel({ email, twoStep, twoStepSince, googleOn, googleEmail }: { email: string; twoStep: boolean; twoStepSince: string | null; googleOn: boolean; googleEmail: string | null }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, go] = useTransition();

  const start = () => go(async () => { setMsg(null); const r = await startTwoStep(); if (r.ok) setSetup(r.data); else setMsg({ ok: false, text: r.error }); });
  const confirm = () => go(async () => {
    if (!setup) return;
    const r = await confirmTwoStep(setup.factorId, code);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setSetup(null); setCode(""); setMsg({ ok: true, text: "Two-step sign-in is on. Next time you sign in, you'll be asked for a code from the app." }); router.refresh();
  });
  const remove = () => go(async () => { const r = await removeTwoStep(); setSure(false); setMsg(r.ok ? { ok: true, text: "Two-step sign-in is off." } : { ok: false, text: r.error }); if (r.ok) router.refresh(); });
  const google = () => go(async () => { const r = await linkGoogle(); if (r.ok) window.location.href = r.data; else setMsg({ ok: false, text: r.error }); });

  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <CardHeader title="Two-step sign-in" subtitle="After your password (or Google), enter a 6-digit code from an authenticator app on your phone — so a stolen password alone can't get in. Optional, and just for your login." />
        <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
          {twoStep ? (
            <>
              <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" />On{twoStepSince ? ` since ${new Date(twoStepSince).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
              {!sure ? <Button variant="ghost" onClick={() => setSure(true)}>Turn off</Button> : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
                  <span className="flex-1">Turn off two-step sign-in? Your password alone will get you in.</span>
                  <Button size="sm" variant="primary" disabled={pending} onClick={remove}>Turn off</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSure(false)}>Keep it on</Button>
                </div>
              )}
            </>
          ) : !setup ? (
            <>
              <p className="text-ink-muted">Off. You&apos;ll need an authenticator app — Google Authenticator, Microsoft Authenticator, 1Password or your phone&apos;s built-in passwords app all work.</p>
              <Button variant="primary" disabled={pending} onClick={start}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}Set up two-step sign-in</Button>
            </>
          ) : (
            <div className="space-y-3">
              <p className="font-medium text-ink">1. Scan this with your authenticator app</p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {/* QR on white so phones can read it in dark mode too */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qr} alt="QR code for your authenticator app" width={176} height={176} className="h-44 w-44 shrink-0 rounded-lg bg-white p-2 ring-1 ring-line" />
                <div className="min-w-0 text-ink-muted">
                  <p>Can&apos;t scan it? Add an account in the app by hand with this key:</p>
                  <p className="mt-1 break-all rounded-md bg-canvas px-2 py-1.5 font-mono text-[0.8125rem] text-ink">{setup.secret}</p>
                </div>
              </div>
              <p className="font-medium text-ink">2. Enter the 6-digit code it shows</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="sm:w-44"><Input id="ts-code" aria-label="Code from the app" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} className="text-center font-mono tracking-[0.25em]" /></div>
                <Button variant="primary" disabled={pending || code.replace(/\s/g, "").length !== 6} onClick={confirm}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Turn on</Button>
                <Button variant="ghost" onClick={() => { setSetup(null); setCode(""); }}>Cancel</Button>
              </div>
            </div>
          )}
          {msg && <p role="status" className={msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>{msg.text}</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Google" subtitle="Sign in with your Google account instead of typing your password." />
        <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
          {googleEmail ? (
            <p className="flex items-center gap-2 text-ink"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Linked to {googleEmail}. Use <b>Continue with Google</b> on the sign-in page.</p>
          ) : !googleOn ? (
            <p className="text-ink-muted">Google sign-in isn&apos;t switched on for EventureOS yet.</p>
          ) : (
            <>
              <p className="text-ink-muted">If your Google account uses the same email ({email}), just use <b>Continue with Google</b> on the sign-in page — it&apos;s linked automatically. For a different Google account, link it here.</p>
              <Button disabled={pending} onClick={google}><KeyRound className="h-4 w-4" />Link a Google account</Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
