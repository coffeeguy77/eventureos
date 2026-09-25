"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export type ActionState = { error?: string; ok?: string } | undefined;
type FormAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

/**
 * A form bound to a server action that returns { error } / { ok }.
 * Inputs keep what the user typed when the action fails (no automatic reset);
 * pass `resetOnOk` to clear the form after success.
 */
export function ActionForm({ action, children, className, resetOnOk, confirm, showOk = true }: {
  action: FormAction; children: React.ReactNode; className?: string; resetOnOk?: boolean; confirm?: string; showOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) fd.set(submitter.name, submitter.value);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>
        <fieldset disabled={pending} className="min-w-0">
          {children}
        </fieldset>
      </PendingContext.Provider>
      {state?.error && <div className="mt-3"><FormError message={state.error} /></div>}
      {showOk && state?.ok && !pending && (
        <p role="status" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700">
          <Check className="h-3.5 w-3.5" /> {state.ok}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({ children, pendingLabel, variant = "primary", size = "md", className, name, value }: {
  children: React.ReactNode; pendingLabel?: string; variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md"; className?: string; name?: string; value?: string;
}) {
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" variant={variant} size={size} className={className} name={name} value={value} disabled={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/** One-click action (toggle, delete…) calling a server action that throws on failure. */
export function ActionButton({ action, children, confirm, variant = "secondary", size = "sm", className, title }: {
  action: () => Promise<void>; children: React.ReactNode; confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; className?: string; title?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        title={title}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            try {
              await action();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Something went wrong");
            }
          });
        }}
      >
        {children}
      </Button>
      {error && <span role="alert" className="mt-1 max-w-[260px] text-right text-[11.5px] text-rose-700">{error}</span>}
    </span>
  );
}

/** Accessible on/off switch that calls a server action. */
export function Toggle({ on, action, label, disabled }: {
  on: boolean; action: (next: boolean) => Promise<void>; label: string; disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        title={disabled ? "You don't have permission to change this" : label}
        disabled={pending || disabled}
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              await action(!on);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Something went wrong");
            }
          });
        }}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-60",
          on ? "bg-brand-500" : "bg-zinc-300"
        )}
      >
        <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-[2px]")} />
      </button>
      {error && <span role="alert" className="mt-1 max-w-[260px] text-right text-[11.5px] text-rose-700">{error}</span>}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          window.prompt("Copy this:", text);
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
