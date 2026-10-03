"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { CalendarCheck, CalendarOff, Check, Download, Hand, Loader2, Megaphone, Share, Wallet, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  acceptShift, addAway, claimExtraHours, crewLinkSignIn, crewSignIn, declineShift, postToBoard, removeAway, setInterest, takeOffBoard, takeOpenShift, takeSwap,
  type CrewResult, type CrewSignInState,
} from "./actions";

export const btn = (kind: "primary" | "secondary" | "ghost" | "danger" = "secondary", extra = "") => cn(
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[0.875rem] font-semibold transition active:scale-[0.98] disabled:opacity-60",
  kind === "primary" && "bg-[var(--crew-brand)] text-white shadow-sm",
  kind === "secondary" && "bg-surface text-ink ring-1 ring-inset ring-line-strong",
  kind === "ghost" && "text-ink-muted hover:bg-zinc-100",
  kind === "danger" && "bg-surface text-rose-700 ring-1 ring-inset ring-rose-200",
  extra,
);

/* ---------------- toast + action runner ---------------- */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = (fn: () => Promise<CrewResult>, after?: () => void) => start(async () => {
    const r = await fn().catch(() => ({ ok: false as const, error: "No connection — try again." }));
    setMsg(r.ok ? (r.message ? { text: r.message, ok: true } : null) : { text: r.error, ok: false });
    if (r.ok) { after?.(); router.refresh(); }
    setTimeout(() => setMsg(null), 6000);
  });
  const toast = msg && (
    <div role="status" className={cn("fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-xl px-4 py-3 text-[0.875rem] shadow-pop", msg.ok ? "bg-ink text-surface" : "bg-rose-600 text-white")}
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}>{msg.text}</div>
  );
  return { run, pending, toast };
}

/* ---------------- navigation ---------------- */
export function BottomNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/crew/${slug}`;
  const tabs = [
    { href: base, label: "Shifts", icon: CalendarCheck, on: path === base || path.startsWith(`${base}/shift`) },
    { href: `${base}/board`, label: "Job board", icon: Megaphone, on: path.startsWith(`${base}/board`) },
    { href: `${base}/away`, label: "Away", icon: CalendarOff, on: path.startsWith(`${base}/away`) },
    { href: `${base}/pay`, label: "Pay", icon: Wallet, on: path.startsWith(`${base}/pay`) },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto grid max-w-xl grid-cols-4">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium", t.on ? "text-[var(--crew-brand)]" : "text-ink-faint")}>
            <t.icon className="h-6 w-6" strokeWidth={t.on ? 2.2 : 1.8} />{t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function RegisterSW({ slug }: { slug: string }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`/crew/${slug}/sw.js`, { scope: `/crew/${slug}` }).catch(() => undefined);
  }, [slug]);
  return null;
}

/* ---------------- "Add to home screen" ---------------- */
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export function InstallPrompt({ appName }: { appName: string }) {
  const [mode, setMode] = useState<null | "ios" | "android" | "other">(null);
  const [evt, setEvt] = useState<BIP | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem("crew-install-dismissed") === "1"; } catch { /* private mode */ }
    if (standalone || dismissed) return;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) { setMode("ios"); return; }
    const onBip = (e: Event) => { e.preventDefault(); setEvt(e as BIP); setMode("android"); };
    window.addEventListener("beforeinstallprompt", onBip);
    const t = setTimeout(() => setMode((m) => m ?? (/Android/i.test(ua) ? "other" : null)), 2500);
    return () => { window.removeEventListener("beforeinstallprompt", onBip); clearTimeout(t); };
  }, []);
  if (!mode) return null;
  const close = () => { try { localStorage.setItem("crew-install-dismissed", "1"); } catch { /* ignore */ } setMode(null); };
  return (
    <div className="mb-4 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 h-5 w-5 shrink-0 text-[var(--crew-brand)]" />
        <div className="min-w-0 flex-1 text-[0.8125rem] text-ink">
          <p className="font-semibold">Put {appName} on your home screen</p>
          {mode === "ios" && <p className="mt-1 text-ink-muted">In Safari, tap <Share className="inline h-4 w-4 align-text-bottom" /> <b>Share</b>, then <b>Add to Home Screen</b>. It opens like an app.</p>}
          {mode === "android" && <p className="mt-1 text-ink-muted">Install it so it opens like an app.</p>}
          {mode === "other" && <p className="mt-1 text-ink-muted">In Chrome, tap the <b>⋮</b> menu, then <b>Add to Home screen</b> (or <b>Install app</b>).</p>}
          {mode === "android" && evt && (
            <button className={btn("primary", "mt-2 h-10")} onClick={async () => { await evt.prompt(); await evt.userChoice.catch(() => undefined); close(); }}>Install app</button>
          )}
        </div>
        <button onClick={close} aria-label="Dismiss" className="rounded-md p-1 text-ink-faint hover:bg-zinc-100"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/* ---------------- sign in ---------------- */
export function CrewSignInForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<CrewSignInState, FormData>(crewSignIn, { step: "email" });
  const input = "h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-[1rem] text-ink focus:border-[var(--crew-brand)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--crew-brand)_25%,transparent)]";
  if (state.step === "code" && state.email) {
    return (
      <div className="space-y-4">
        {state.message && <p className="rounded-xl bg-zinc-50 px-4 py-3 text-[0.875rem] text-ink ring-1 ring-line">{state.message} It can take a minute — check spam too.</p>}
        <form action={action} className="space-y-3">
          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="email" value={state.email} /><input type="hidden" name="intent" value="verify" />
          <label className="block text-[0.8125rem] font-medium text-ink-muted" htmlFor="code">Sign-in code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" maxLength={12} placeholder="123456" required autoFocus
            className={cn(input, "text-center font-mono text-[1.375rem] tracking-[0.4em]")} />
          {state.error && <p className="text-[0.8125rem] text-rose-700">{state.error}</p>}
          <button className={btn("primary", "w-full")} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Sign in</button>
        </form>
        <form action={action} className="flex justify-between text-[0.8125rem]">
          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="email" value={state.email} />
          <button name="intent" value="restart" className="text-ink-muted">Use a different email</button>
          <button name="intent" value="resend" className="font-medium text-[var(--crew-brand)]">Send a new code</button>
        </form>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="intent" value="send" />
      <label className="block text-[0.8125rem] font-medium text-ink-muted" htmlFor="email">Your email</label>
      <input id="email" name="email" type="email" autoComplete="email" required autoFocus defaultValue={state.email} placeholder="you@example.com" className={input} />
      {state.error && <p className="text-[0.8125rem] text-rose-700">{state.error}</p>}
      <button className={btn("primary", "w-full")} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Email me a sign-in code</button>
    </form>
  );
}

/* ---------------- shift actions ---------------- */
export function AcceptDecline({ slug, shiftId }: { slug: string; shiftId: string }) {
  const { run, pending, toast } = useRun();
  const [why, setWhy] = useState<string | null>(null);
  return (
    <div className="mt-3">
      {why === null ? (
        <div className="grid grid-cols-2 gap-2">
          <button className={btn("primary")} disabled={pending} onClick={() => run(() => acceptShift(slug, shiftId))}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Accept</button>
          <button className={btn("secondary")} disabled={pending} onClick={() => setWhy("")}>Can&apos;t do it</button>
        </div>
      ) : (
        <div className="space-y-2">
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason (optional)" maxLength={300} className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.9375rem]" />
          <div className="grid grid-cols-2 gap-2">
            <button className={btn("ghost")} onClick={() => setWhy(null)}>Back</button>
            <button className={btn("danger")} disabled={pending} onClick={() => run(() => declineShift(slug, shiftId, why))}>Decline shift</button>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}

export function BoardControls({ slug, shiftId, posted }: { slug: string; shiftId: string; posted: boolean }) {
  const { run, pending, toast } = useRun();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (posted) return (<>
    <button className={btn("secondary", "w-full")} disabled={pending} onClick={() => run(() => takeOffBoard(slug, shiftId))}>I can make it after all — take it off the board</button>{toast}
  </>);
  return (
    <div>
      {!open ? <button className={btn("secondary", "w-full")} onClick={() => setOpen(true)}><Megaphone className="h-4 w-4" />Can&apos;t make it? Post on the job board</button> : (
        <div className="space-y-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-line">
          <p className="text-[0.8125rem] text-ink-muted">It stays your shift until someone else takes it — then it moves to their calendar.</p>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the team (optional)" maxLength={300} className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.9375rem]" />
          <div className="grid grid-cols-2 gap-2">
            <button className={btn("ghost")} onClick={() => setOpen(false)}>Cancel</button>
            <button className={btn("primary")} disabled={pending} onClick={() => run(() => postToBoard(slug, shiftId, note), () => setOpen(false))}>Post it</button>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}

export function ExtraHours({ slug, shiftId }: { slug: string; shiftId: string }) {
  const { run, pending, toast } = useRun();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("0.5");
  const [reason, setReason] = useState("");
  if (!open) return (<><button className={btn("secondary", "w-full")} onClick={() => setOpen(true)}>Job went longer? Add extra hours</button>{toast}</>);
  return (
    <div className="space-y-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-line">
      <div className="flex items-center gap-2">
        <label className="text-[0.8125rem] font-medium text-ink-muted" htmlFor="xh">Extra hours</label>
        <select id="xh" value={hours} onChange={(e) => setHours(e.target.value)} className="h-11 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-[0.9375rem]">
          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4].map((h) => <option key={h} value={h}>{h} hr{h === 1 ? "" : "s"}</option>)}
        </select>
      </div>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Why? e.g. Client asked us to stay 30 min longer" className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.9375rem]" />
      <div className="grid grid-cols-2 gap-2">
        <button className={btn("ghost")} onClick={() => setOpen(false)}>Cancel</button>
        <button className={btn("primary")} disabled={pending || reason.trim().length < 3} onClick={() => run(() => claimExtraHours(slug, shiftId, Number(hours), reason), () => { setOpen(false); setReason(""); })}>Send for approval</button>
      </div>
      {toast}
    </div>
  );
}

/* ---------------- job board ---------------- */
export function TakeSwapButton({ slug, shiftId, blocked }: { slug: string; shiftId: string; blocked?: string | null }) {
  const { run, pending, toast } = useRun();
  return (<>
    <button className={btn("primary", "w-full")} disabled={pending || !!blocked} onClick={() => run(() => takeSwap(slug, shiftId))}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Take this shift</button>
    {toast}
  </>);
}
export function TakeOpenButton({ slug, eventId, blocked }: { slug: string; eventId: string; blocked?: string | null }) {
  const { run, pending, toast } = useRun();
  return (<>
    <button className={btn("primary", "w-full")} disabled={pending || !!blocked} onClick={() => run(() => takeOpenShift(slug, eventId))}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Take this shift</button>
    {toast}
  </>);
}
export function HandUpButton({ slug, eventId, on, blocked }: { slug: string; eventId: string; on: boolean; blocked?: string | null }) {
  const { run, pending, toast } = useRun();
  return (<>
    <button className={btn(on ? "secondary" : "primary", "w-full")} disabled={pending || (!on && !!blocked)} onClick={() => run(() => setInterest(slug, eventId, !on))}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />}{on ? "Hand up ✓ — tap to take it down" : "Put my hand up"}
    </button>
    {toast}
  </>);
}

/* ---------------- away ---------------- */
export function AwayForm({ slug, today }: { slug: string; today: string }) {
  const { run, pending, toast } = useRun();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const field = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.9375rem]";
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[0.75rem] font-medium text-ink-muted">From<input type="date" min={today} value={from} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }} className={cn(field, "mt-1")} /></label>
        <label className="text-[0.75rem] font-medium text-ink-muted">To<input type="date" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} className={cn(field, "mt-1")} /></label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Note (optional) e.g. Holiday" className={field} />
      <button className={btn("primary", "w-full")} disabled={pending || !from} onClick={() => run(() => addAway(slug, from, to || from, note), () => { setFrom(""); setTo(""); setNote(""); })}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}Let the office know
      </button>
      {toast}
    </div>
  );
}
export function RemoveAwayButton({ slug, id }: { slug: string; id: string }) {
  const { run, pending, toast } = useRun();
  return (<><button aria-label="Remove" disabled={pending} onClick={() => run(() => removeAway(slug, id))} className="rounded-lg p-2 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-4 w-4" /></button>{toast}</>);
}


/** Signs in from the emailed link as soon as the page opens (or on tap if that fails). */
export function FinishSignIn({ slug, th, t }: { slug: string; th: string; t: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: true, error: null });
  const go = () => {
    setState({ busy: true, error: null });
    crewLinkSignIn(slug, th, t).then((r) => { if (r?.error) setState({ busy: false, error: r.error }); })
      .catch((e) => { if (!String(e?.digest ?? e?.message ?? "").includes("NEXT_REDIRECT")) setState({ busy: false, error: "No connection — try again." }); });
  };
  useEffect(() => { go(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <div className="w-full max-w-sm">
      {state.busy ? (
        <><Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--crew-brand)]" /><p className="mt-3 text-[0.9375rem] text-ink">Signing you in…</p></>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.9375rem] text-rose-700">{state.error}</p>
          <button className={btn("primary", "w-full")} onClick={go}>Try again</button>
          <Link href={`/crew/${slug}/login`} className={btn("secondary", "w-full")}>Get a new sign-in email</Link>
        </div>
      )}
    </div>
  );
}
