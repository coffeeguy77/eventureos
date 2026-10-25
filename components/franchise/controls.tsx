"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/form";
import { copyApplicationLink, saveFranchiseNotes, sendApplicationLink, setFranchiseStatus } from "@/app/(app)/franchise/actions";
import { STATUS_LABEL, type FranchiseStatus } from "@/lib/franchise/core";

/** The next steps for one franchise application: send the application, review, approve or decline, notes. */
export function FranchiseControls({ id, status, notes: notes0, emailReady, invited }: { id: string; status: FranchiseStatus; notes: string; emailReady: boolean; invited: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [compose, setCompose] = useState(false);
  const [notes, setNotes] = useState(notes0);
  const [sure, setSure] = useState<FranchiseStatus | null>(null);
  const run = (fn: () => Promise<{ ok: true; message: string; link?: string } | { ok: false; error: string }>, after?: (link?: string) => void) => start(async () => {
    const r = await fn();
    if (r.ok) { setMsg({ ok: true, text: r.message }); after?.(r.link); router.refresh(); } else setMsg({ ok: false, text: r.error });
  });
  const decided = ["approved", "declined", "withdrawn"].includes(status);

  return (
    <Card>
      <CardHeader title="Next step" />
      <div className="space-y-4 px-5 pb-5">
        {!decided && (
          <div className="space-y-2">
            <p className="text-[0.8125rem] font-semibold text-ink">{status === "enquiry" ? "1 · Send the application" : invited ? "Application link" : "Application"}</p>
            {compose ? (
              <div className="space-y-2 rounded-lg bg-zinc-50 p-3">
                <Label htmlFor="fr-note" hint="optional">A line from you</Label>
                <Textarea id="fr-note" rows={3} maxLength={800} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Great to chat today — here's the application we mentioned." />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => sendApplicationLink(id, note), () => setCompose(false))}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send email</Button>
                  <Button size="sm" onClick={() => setCompose(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {emailReady && <Button variant={status === "enquiry" ? "primary" : "secondary"} size="sm" disabled={pending} onClick={() => setCompose(true)}><Send className="h-4 w-4" />{invited ? "Email it again" : "Email the application"}</Button>}
                <Button size="sm" disabled={pending} onClick={() => run(() => copyApplicationLink(id), (link) => { if (link) void navigator.clipboard?.writeText(link).catch(() => undefined); })}><Copy className="h-4 w-4" />Copy link</Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[0.8125rem] font-semibold text-ink">Decision</p>
          {status === "applied" && <Button size="sm" disabled={pending} onClick={() => run(() => setFranchiseStatus(id, "reviewing"))}>Mark as reviewing</Button>}
          {sure ? (
            <div className="rounded-lg bg-zinc-50 p-3 text-[0.875rem]">
              <p>Mark this application <b>{STATUS_LABEL[sure].toLowerCase()}</b>? Nothing is emailed — let them know yourself.</p>
              <div className="mt-2 flex gap-2"><Button variant={sure === "approved" ? "primary" : "danger"} size="sm" disabled={pending} onClick={() => run(() => setFranchiseStatus(id, sure), () => setSure(null))}>Yes, {STATUS_LABEL[sure].toLowerCase()}</Button><Button size="sm" onClick={() => setSure(null)}>Cancel</Button></div>
            </div>
          ) : decided ? (
            <Button size="sm" disabled={pending} onClick={() => run(() => setFranchiseStatus(id, "reviewing"))}>Re-open</Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" disabled={pending} onClick={() => setSure("approved")}><ThumbsUp className="h-4 w-4" />Approve</Button>
              <Button size="sm" disabled={pending} onClick={() => setSure("declined")}><ThumbsDown className="h-4 w-4" />Decline</Button>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setSure("withdrawn")}>They withdrew</Button>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="fr-notes">Private notes</Label>
          <Textarea id="fr-notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Call notes, meeting dates, follow-ups…" />
          <Button size="sm" className="mt-2" disabled={pending || notes === notes0} onClick={() => run(() => saveFranchiseNotes(id, notes))}><Check className="h-4 w-4" />Save notes</Button>
        </div>
        {msg && <p className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</p>}
      </div>
    </Card>
  );
}
