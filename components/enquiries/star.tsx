"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star, Trash2 } from "lucide-react";
import { deleteEnquiries, setStar, setStarNote, type StarResult } from "@/app/(app)/enquiries/star-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const fail = { ok: false as const, error: "Couldn't reach the server." };

/** The star on an inbox row (sits above the row's full-width link). */
export function StarToggle({ id, starred, note }: { id: string; starred: boolean; note?: string | null }) {
  const router = useRouter();
  const [on, setOn] = useState(starred);
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} aria-pressed={on} aria-label={on ? "Remove star" : "Star this enquiry"}
      title={on ? (note ? `Starred — ${note}` : "Starred — click to remove") : "Star it to think about later"}
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation();
        const next = !on; setOn(next);
        start(async () => {
          const r: StarResult = await setStar([id], next).catch(() => fail);
          if (!r.ok) { setOn(!next); alertInline(r.error); }
          router.refresh();
        });
      }}
      className={cn("relative z-10 rounded-md p-1 transition-colors", on ? "text-amber-500 hover:text-amber-600" : "text-zinc-300 hover:text-amber-500")}>
      <Star className="h-4 w-4" fill={on ? "currentColor" : "none"} />
    </button>
  );
}
// Errors on a tiny row control: show them in the page's status line if there is one, otherwise the console
function alertInline(msg: string) {
  const el = document.getElementById("enquiry-star-status");
  if (el) { el.textContent = msg; el.hidden = false; } else console.warn(msg);
}

/** Star button for the enquiry page header, plus the "what do we need to think about?" note when starred. */
export function StarPanel({ id, starred, note, by }: { id: string; starred: boolean; note: string | null; by: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(note ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<StarResult>) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => fail);
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    router.refresh();
  });
  if (!starred) {
    return (
      <div className="mt-4">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setStar([id], true))}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}Star to think about
        </Button>
        {msg && !msg.ok && <span className="ml-2 text-[0.7812rem] font-medium text-rose-700">{msg.text}</span>}
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Star className="h-4 w-4 shrink-0 text-amber-500" fill="currentColor" />
        <p className="min-w-0 flex-1 text-[0.8125rem] font-semibold text-amber-900">Starred{by ? ` by ${by}` : ""} — something to think about</p>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setStar([id], false))}>Remove star</Button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={2}
        onBlur={() => { if (text.trim() !== (note ?? "").trim()) run(() => setStarNote(id, text)); }}
        placeholder="What do we need to think about? e.g. They expect us to sell direct to ~6,000 people — is it worth it? Staff, stock, float, minimum spend…"
        className="mt-2 w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 sm:text-[0.8125rem]" />
      <p className="mt-1 text-[0.7rem] text-amber-800/80">{pending ? "Saving…" : msg ? <span className={msg.ok ? "" : "text-rose-700"}>{msg.text}</span> : "Saves when you click away. The whole team sees it, and it shows in the Starred tab."}</p>
    </div>
  );
}

/** Delete one enquiry (e.g. your own test) — asks once, inline. Not spam, no blocking, Gmail untouched. */
export function DeleteEnquiryButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setAsk((v) => !v); setErr(null); }} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800">
        <Trash2 className="h-3.5 w-3.5" />Delete
      </Button>
      {ask && (
        <div className="mt-2 flex w-full flex-wrap items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[0.8125rem] text-rose-900">
          <span className="min-w-0 flex-1">Delete <strong>{label}</strong> from EventureOS? Its emails, notes and to-dos here go too. The sender isn&apos;t marked as spam or blocked, and nothing changes in Gmail. This can&apos;t be undone.</span>
          <Button size="sm" onClick={() => setAsk(false)}>Cancel</Button>
          <Button size="sm" variant="danger" disabled={pending}
            onClick={() => start(async () => {
              const r = await deleteEnquiries([id]).catch(() => fail);
              if (!r.ok) { setErr(r.error); return; }
              router.push("/enquiries");
              router.refresh();
            })}>{pending ? "Deleting…" : "Delete"}</Button>
          {err && <p className="w-full text-[0.7812rem] font-medium text-rose-700">{err}</p>}
        </div>
      )}
    </>
  );
}
