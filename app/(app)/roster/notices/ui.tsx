"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { deleteNotice, pinNotice, postNotice } from "../notice-actions";

type Notice = { id: string; title: string; body: string | null; member_ids: string[]; needs_ok: boolean; pinned: boolean; expires_on: string | null; created_at: string };
type Person = { id: string; name: string; on_roster: boolean; phone: string | null };
type Read = { notice_id: string; crew_member_id: string; read_at: string; confirmed_at: string | null };
type Res = { ok: boolean; message?: string; error?: string };

export function NoticeBoard({ notices, people, reads, tz, smsOn }: { notices: Notice[]; people: Person[]; reads: Read[]; tz: string; smsOn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const blank = { title: "", body: "", to: "all" as "all" | "cafe" | "chosen", chosen: [] as string[], needsOk: false, pinned: false, expiresOn: "", text: false };
  const [f, setF] = useState(blank);
  const run = (fn: () => Promise<Res>, after?: (r: Res) => void) => start(async () => {
    const r: Res = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Something went wrong." });
    after?.(r);
    router.refresh();
  });
  const ids = f.to === "all" ? [] : f.to === "cafe" ? people.filter((p) => p.on_roster).map((p) => p.id) : f.chosen;
  const name = new Map(people.map((p) => [p.id, p.name]));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="New notice" />
        <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
          <div><Label htmlFor="n-title">Heading</Label><Input id="n-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. New oat milk supplier from Monday" /></div>
          <div><Label htmlFor="n-body" hint="optional">Details</Label><Textarea id="n-body" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
          <div>
            <Label>Who sees it</Label>
            <div className="flex flex-wrap gap-2">
              {([["all", "Everyone"], ["cafe", "Café roster staff"], ["chosen", "Choose people"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setF({ ...f, to: k })} className={cn("rounded-full px-3 py-1.5 text-[0.75rem] font-medium ring-1", f.to === k ? "bg-brand-600 text-white ring-brand-600" : "bg-surface text-ink ring-line")}>{l}</button>
              ))}
            </div>
            {f.to === "chosen" && (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {people.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-ink"><input type="checkbox" checked={f.chosen.includes(p.id)} onChange={(e) => setF({ ...f, chosen: e.target.checked ? [...f.chosen, p.id] : f.chosen.filter((x) => x !== p.id) })} />{p.name}</label>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-ink"><input type="checkbox" checked={f.needsOk} onChange={(e) => setF({ ...f, needsOk: e.target.checked })} />Ask them to tap &ldquo;Got it&rdquo;</label>
            <label className="flex items-center gap-2 text-ink"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />Pin to the top</label>
            {smsOn && <label className="flex items-center gap-2 text-ink"><input type="checkbox" checked={f.text} onChange={(e) => setF({ ...f, text: e.target.checked })} />Also text them a link</label>}
            <div><Label htmlFor="n-exp" hint="optional">Take down after</Label><Input id="n-exp" type="date" className="w-44" value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} /></div>
          </div>
          <Button size="sm" variant="primary" disabled={pending || !f.title.trim() || (f.to !== "all" && !ids.length)}
            onClick={() => run(() => postNotice({ title: f.title, body: f.body, memberIds: ids, needsOk: f.needsOk, pinned: f.pinned, expiresOn: f.expiresOn || null, text: f.text }), (r) => r.ok && setF(blank))}>
            <Send className="h-3.5 w-3.5" />Post
          </Button>
          {msg && <p className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
        </div>
      </Card>

      {notices.length === 0 ? <Card><p className="px-5 py-6 text-[0.8125rem] text-ink-muted">No notices yet.</p></Card> : notices.map((n) => {
        const audience = n.member_ids.length ? n.member_ids : people.map((p) => p.id);
        const r = new Map(reads.filter((x) => x.notice_id === n.id).map((x) => [x.crew_member_id, x]));
        const read = audience.filter((id) => r.has(id)), unread = audience.filter((id) => !r.has(id));
        const confirmed = audience.filter((id) => r.get(id)?.confirmed_at);
        return (
          <Card key={n.id}>
            <div className="flex flex-wrap items-start gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{n.pinned && <Pin className="mr-1 inline h-3.5 w-3.5 text-ink-faint" />}{n.title}</p>
                <p className="text-[0.7188rem] text-ink-faint">{new Date(n.created_at).toLocaleString("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {n.member_ids.length ? n.member_ids.map((id) => name.get(id) ?? "?").join(", ") : "Everyone"}{n.expires_on ? ` · until ${n.expires_on}` : ""}</p>
                {n.body && <p className="mt-2 whitespace-pre-line text-[0.8125rem] text-ink">{n.body}</p>}
                <p className="mt-2 text-[0.75rem] text-ink-muted">
                  <b className="text-ink">Read by {read.length} of {audience.length}</b>{n.needs_ok ? ` · ${confirmed.length} tapped “Got it”` : ""}
                  {unread.length > 0 && <span className="block">Not read yet: {unread.map((id) => name.get(id) ?? "?").join(", ")}</span>}
                  {n.needs_ok && read.length > confirmed.length && <span className="block">Read but not confirmed: {read.filter((id) => !r.get(id)?.confirmed_at).map((id) => name.get(id) ?? "?").join(", ")}</span>}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => pinNotice(n.id, !n.pinned))}><Pin className="h-3.5 w-3.5" />{n.pinned ? "Unpin" : "Pin"}</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteNotice(n.id))}><Trash2 className="h-3.5 w-3.5" />Take down</Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
