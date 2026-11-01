"use client";

import { useEffect } from "react";
import { Check, Pin } from "lucide-react";
import { btn, useRun } from "../ui";
import { confirmNotice, seenNotices } from "../news-actions";
import type { Notice } from "@/lib/crew/notices";

export function NewsList({ slug, notices, tz }: { slug: string; notices: Notice[]; tz: string }) {
  const { run, pending, toast } = useRun();
  // opening the page counts as reading them (the red dot goes); "Got it" ones stay marked until tapped
  useEffect(() => { const ids = notices.filter((n) => !n.read).map((n) => n.id); if (ids.length) void seenNotices(slug, ids); }, [slug, notices]);
  if (!notices.length) return <div className="rounded-2xl bg-surface p-5 text-[0.875rem] text-ink-muted shadow-card ring-1 ring-line">Nothing yet.</div>;
  return (
    <div className="space-y-3">
      {notices.map((n) => (
        <article key={n.id} className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
          <div className="flex items-start gap-2">
            {(!n.read || (n.needs_ok && !n.confirmed)) && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-600" aria-label="New" />}
            <h2 className="min-w-0 flex-1 text-[1rem] font-semibold leading-snug text-ink">{n.title}</h2>
            {n.pinned && <Pin className="h-4 w-4 shrink-0 text-ink-faint" aria-label="Pinned" />}
          </div>
          <p className="mt-0.5 text-[0.75rem] text-ink-faint">{new Date(n.created_at).toLocaleString("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
          {n.body && <p className="mt-2 whitespace-pre-line text-[0.9375rem] text-ink">{n.body}</p>}
          {n.needs_ok && (n.confirmed
            ? <p className="mt-3 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-emerald-700"><Check className="h-4 w-4" />You&apos;ve confirmed</p>
            : <button className={btn("primary", "mt-3 w-full")} disabled={pending} onClick={() => run(() => confirmNotice(slug, n.id))}><Check className="h-4 w-4" />Got it</button>)}
        </article>
      ))}
      {toast}
    </div>
  );
}
