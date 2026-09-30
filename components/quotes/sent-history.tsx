"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, Eye, Mail, MailCheck, MailX, Send } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface SentView { viewed_at: string; city: string | null; region: string | null; country: string | null; user_agent: string | null }
export interface SentRecipient {
  id: string; email: string; name: string | null; role: "to" | "copy"; token: string; status: string; status_at: string | null; error: string | null;
  email_opened_at: string | null; first_viewed_at: string | null; last_viewed_at: string | null; view_count: number; views: SentView[];
}
export interface SentEmail { id: string; version_number: number | null; subject: string; message: string; sent_at: string; sent_by: string | null; recipients: SentRecipient[] }

/** "iPhone · Safari", "Windows · Chrome" — a rough, honest label from the browser's user agent. */
export function deviceLabel(ua: string | null) {
  if (!ua) return null;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : null;
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /GSA\//.test(ua) ? "Google app" : null;
  return [os, br].filter(Boolean).join(" · ") || null;
}
const place = (v: SentView) => [v.city, v.region, v.country && v.country !== "AU" ? v.country : null].filter(Boolean).join(", ") || null;

const STATUS: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  queued: { label: "Sending", cls: "bg-zinc-100 text-ink-muted", icon: Send },
  sent: { label: "Sent", cls: "bg-sky-50 text-sky-800 ring-sky-200", icon: Send },
  delivered: { label: "Delivered", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: MailCheck },
  delayed: { label: "Delayed", cls: "bg-amber-50 text-amber-800 ring-amber-200", icon: AlertTriangle },
  bounced: { label: "Bounced", cls: "bg-rose-50 text-rose-800 ring-rose-200", icon: MailX },
  complained: { label: "Marked as spam", cls: "bg-rose-50 text-rose-800 ring-rose-200", icon: MailX },
  failed: { label: "Failed", cls: "bg-rose-50 text-rose-800 ring-rose-200", icon: MailX },
};

function CopyLink({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title="Copy this person's quote link (to text or message it to them)"
      onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/q/${token}`); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* ignore */ } }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.75rem] text-ink-muted hover:bg-zinc-100 hover:text-ink">
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{done ? "Copied" : "Link"}
    </button>
  );
}

function RecipientRow({ r, tz }: { r: SentRecipient; tz: string }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[r.status] ?? STATUS.sent;
  const I = s.icon;
  const last = r.views[0];
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 text-[0.8125rem] text-ink" title={r.email}>
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{r.name ?? r.email}</span>
            {r.role === "copy" && <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[0.6875rem] font-normal text-ink-muted">Your copy</span>}
          </span>
          {r.name && <span className="block truncate text-[0.75rem] text-ink-muted">{r.email}</span>}
        </span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset ring-transparent", s.cls)} title={r.status_at ? fmtDateTime(r.status_at, tz) : undefined}>
          <I className="h-3 w-3" />{s.label}
        </span>
        <CopyLink token={r.token} />
      </div>
      {r.error && <p className="mt-1 text-[0.75rem] text-rose-700">{r.error}</p>}
      {r.role === "to" && (
        r.view_count > 0 ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1 flex w-full items-start gap-1.5 text-left text-[0.75rem] text-emerald-800">
            <Eye className="mt-px h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              Viewed {r.view_count === 1 ? "once" : `${r.view_count} times`} · last {fmtDateTime(r.last_viewed_at, tz)}
              {last && (place(last) || deviceLabel(last.user_agent)) ? <span className="text-ink-muted"> · {[place(last), deviceLabel(last.user_agent)].filter(Boolean).join(" · ")}</span> : null}
            </span>
            {r.views.length > 1 && <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform", open && "rotate-180")} />}
          </button>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-[0.75rem] text-ink-faint">
            <Eye className="h-3.5 w-3.5" />Not viewed yet{r.email_opened_at ? ` · email opened ${fmtDateTime(r.email_opened_at, tz)}` : ""}
          </p>
        )
      )}
      {open && r.views.length > 1 && (
        <ul className="ml-5 mt-1.5 space-y-1 border-l border-line pl-3 text-[0.75rem] text-ink-muted">
          {r.views.map((v, i) => (
            <li key={i}>{fmtDateTime(v.viewed_at, tz)}{place(v) ? ` · ${place(v)}` : ""}{deviceLabel(v.user_agent) ? ` · ${deviceLabel(v.user_agent)}` : ""}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Every time this quote was emailed: who to, delivery status, and when each person opened their link. */
export function SentHistory({ sends, tz, names, trackingOn }: { sends: SentEmail[]; tz: string; names: Record<string, string>; trackingOn: boolean }) {
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Sent emails" subtitle={sends.length ? "Who it went to and when they opened it" : undefined} />
      {sends.length === 0 ? (
        <p className="flex items-start gap-2 px-5 pb-5 text-[0.8125rem] text-ink-muted"><Mail className="mt-0.5 h-4 w-4 shrink-0" />This quote hasn&apos;t been emailed yet.</p>
      ) : (
        <ol className="divide-y divide-line border-t border-line">
          {sends.map((s) => (
            <li key={s.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[0.8125rem] font-medium text-ink">{fmtDateTime(s.sent_at, tz)}</p>
                <p className="text-[0.75rem] text-ink-muted">{s.version_number ? `Version ${s.version_number}` : ""}{s.sent_by && names[s.sent_by] ? ` · ${names[s.sent_by]}` : ""}</p>
              </div>
              <button type="button" onClick={() => setOpenMsg((m) => (m === s.id ? null : s.id))} className="mt-0.5 block w-full truncate text-left text-[0.75rem] text-ink-muted hover:text-ink" aria-expanded={openMsg === s.id}>
                {s.subject}
              </button>
              {openMsg === s.id && <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-canvas p-2.5 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line">{s.message}</p>}
              <ul className="mt-1 divide-y divide-line/60">
                {s.recipients.sort((a, b) => (a.role === b.role ? 0 : a.role === "to" ? -1 : 1)).map((r) => <RecipientRow key={r.id} r={r} tz={tz} />)}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-line px-5 py-2.5 text-[0.6875rem] leading-relaxed text-ink-faint">
        “Viewed” means the person opened their quote link in a browser. Location is approximate (from their internet connection).
        {trackingOn ? " Delivery status comes from Resend." : " Delivered/bounced status appears once the Resend webhook is set up."}
      </p>
    </Card>
  );
}
