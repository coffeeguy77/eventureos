"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { welcomeAction } from "../actions";

export function WelcomeButton({ org, club, token, base, colour }: { org: string; club: string; token: string; base: string; colour: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const go = () => start(async () => {
    const r = await welcomeAction(org, club, token);
    if (r.ok) router.replace(base); else setErr(r.error);
  });
  return (
    <div className="mt-6">
      <button onClick={go} disabled={busy || !token} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[1rem] font-semibold text-white disabled:opacity-50" style={{ background: colour }}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Open my booking page</button>
      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[0.8125rem] text-red-700 ring-1 ring-red-100">{err}</p>}
      {err && <a href={base} className="mt-3 inline-block text-[0.875rem] font-medium underline" style={{ color: colour }}>Sign in with your email or mobile</a>}
    </div>
  );
}
