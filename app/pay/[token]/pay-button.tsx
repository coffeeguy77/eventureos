"use client";

import { useActionState } from "react";
import { CreditCard, Lock } from "lucide-react";
import { payByCard } from "./actions";

export function PayButton({ token, label, colour }: { token: string; label: string; colour: string }) {
  const [state, action, pending] = useActionState(payByCard.bind(null, token), undefined);
  return (
    <form action={action}>
      <button disabled={pending} style={{ background: colour }}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[1rem] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60">
        <CreditCard className="h-5 w-5" />{pending ? "Opening secure payment…" : label}
      </button>
      {state?.error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[0.8125rem] text-rose-800 ring-1 ring-inset ring-rose-200">{state.error}</p>}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[0.75rem] text-ink-faint"><Lock className="h-3.5 w-3.5" />Card details are handled securely by Stripe.</p>
    </form>
  );
}
