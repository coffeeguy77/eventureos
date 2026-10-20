"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emailOrderingLinkAction, newOrderingLink } from "@/app/(app)/wholesale/actions";
import { cn } from "@/lib/cn";

/** The customer's private ordering link: copy, open, email it to them, or replace it. */
export function OrderLinkBox({ id, url, email, ordering, active, canEdit }: { id: string; url: string; email: string | null; ordering: boolean; active: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [askNew, setAskNew] = useState(false);
  const [askEmail, setAskEmail] = useState(false);
  return (
    <div className="space-y-3">
      {!ordering && <p className="rounded-md bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900 ring-1 ring-inset ring-amber-100">Online ordering is switched off in Wholesale → Settings, so the link shows a "contact us" message for now.</p>}
      {!active && <p className="rounded-md bg-zinc-100 px-3 py-2 text-[0.75rem] text-ink-muted">This customer is inactive, so their link doesn't work.</p>}
      <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-line"><code className="min-w-0 flex-1 truncate text-[0.75rem] text-ink">{url}</code></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(url); setMsg({ ok: true, text: "Link copied." }); }}><Copy className="h-4 w-4" />Copy</Button>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-zinc-50"><ExternalLink className="h-4 w-4" />See what they see</a>
        {canEdit && email && (askEmail
          ? <><span className="self-center text-[0.8125rem]">Email it to {email}?</span><Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await emailOrderingLinkAction(id); setMsg(r.ok ? { ok: true, text: `Emailed to ${r.data}.` } : { ok: false, text: r.error }); setAskEmail(false); })}>Send</Button><Button size="sm" variant="ghost" onClick={() => setAskEmail(false)}>Cancel</Button></>
          : <Button size="sm" onClick={() => setAskEmail(true)}><Mail className="h-4 w-4" />Email it to them</Button>)}
        {canEdit && (askNew
          ? <><span className="self-center text-[0.8125rem]">The old link will stop working.</span><Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await newOrderingLink(id); setMsg(r.ok ? { ok: true, text: "New link made." } : { ok: false, text: r.error }); setAskNew(false); router.refresh(); })}>Make a new link</Button><Button size="sm" variant="ghost" onClick={() => setAskNew(false)}>Cancel</Button></>
          : <button type="button" onClick={() => setAskNew(true)} className="inline-flex items-center gap-1 text-[0.75rem] text-ink-muted hover:text-ink"><RefreshCw className="h-3.5 w-3.5" />New link</button>)}
      </div>
      {msg && <p className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </div>
  );
}
