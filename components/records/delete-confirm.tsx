"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Result = { ok: false; error: string } | { ok: true } | { error?: string } | undefined | void;

/**
 * A Delete button that asks once, inline (no browser pop-ups). `run` is a server action; on success it usually
 * redirects, so the page simply moves on.
 */
export function DeleteConfirm({ label, title, children, run, variant = "button", className }: {
  /** Button text, e.g. "Delete quote" */
  label: string;
  /** Bold first line of the confirmation */
  title: string;
  /** What will (and won't) happen */
  children: React.ReactNode;
  run: () => Promise<Result>;
  variant?: "button" | "chip";
  className?: string;
}) {
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className={cn(ask ? "w-full basis-full" : "", className)}>
      {variant === "chip" ? (
        <button type="button" onClick={() => { setAsk((v) => !v); setErr(null); }} aria-expanded={ask}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-[0.75rem] font-medium text-rose-700 hover:bg-rose-50 sm:py-1">
          <Trash2 className="h-3.5 w-3.5" />{label}
        </button>
      ) : (
        <Button size="sm" variant="danger" onClick={() => { setAsk((v) => !v); setErr(null); }} aria-expanded={ask} className="h-10 sm:h-9"><Trash2 className="h-4 w-4" />{label}</Button>
      )}
      {ask && (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-[0.8125rem] text-rose-900">
          <p className="font-semibold">{title}</p>
          <div className="mt-1 space-y-1 text-[0.78rem] leading-relaxed">{children}</div>
          {err && <p className="mt-2 font-medium text-rose-700">{err}</p>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" onClick={() => setAsk(false)}>Cancel</Button>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => start(async () => {
              const r = await run().catch((e: unknown) => {
                // A redirect after a successful delete arrives as a thrown NEXT_REDIRECT — let Next handle it
                if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
                return { ok: false as const, error: "Couldn't reach the server." };
              });
              const msg = r && "error" in r ? r.error : null;
              if (msg) setErr(msg);
            })}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}{pending ? "Deleting…" : label}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
