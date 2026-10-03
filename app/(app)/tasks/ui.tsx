"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, ChevronRight, Clock, Loader2, Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { DateTimeField } from "@/components/ui/datetime-field";
import { cn } from "@/lib/cn";
import { addTask, deleteTask, followUpToTask, rescheduleTask, setTaskReminder, setTaskStatus, type TaskResult } from "./actions";

export interface TodoTask {
  id: string; title: string; description: string | null; status: string; priority: string; due_at: string | null; dueLabel: string | null;
  overdue: boolean; assignee: string | null; reminder: boolean; source: string;
  link: { href: string; label: string } | null; completedLabel: string | null;
}
export interface TodoFollowUp {
  key: string; kind: string; title: string; detail: string | null; href: string; urgent: boolean; when: string | null;
  link: { enquiryId?: string | null; eventId?: string | null; customerId?: string | null };
}

const KIND_LABEL: Record<string, string> = {
  draft: "Draft ready", reply: "Needs reply", quote_chase: "Quote", quote_expiring: "Quote expiring", invoice: "Overdue invoice", calendar: "Calendar", next_action: "Next action",
};

function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const show = (r: TaskResult) => {
    const text = r.ok ? r.message ?? null : r.error;
    if (!text) return;
    setMsg({ text, ok: r.ok }); setTimeout(() => setMsg(null), 5000);
  };
  const node = msg && (
    <div role="status" className={cn("fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-[0.8125rem] shadow-pop lg:bottom-6",
      msg.ok ? "bg-ink text-surface" : "bg-rose-600 text-white")}>{msg.text}</div>
  );
  return { show, node };
}

export function AddTask({ members }: { members: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const toast = useToast();
  if (!open) {
    return (<>
      <Button variant="primary" size="sm" className="h-10 sm:h-9" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add to-do</Button>
      {toast.node}
    </>);
  }
  return (
    <form ref={form} className="space-y-2.5 rounded-xl border border-line bg-surface p-4 shadow-card"
      action={(fd) => start(async () => {
        const r = await addTask({
          title: String(fd.get("title") ?? ""), notes: String(fd.get("notes") ?? ""), dueIso: String(fd.get("due") ?? "") || null,
          assignee: String(fd.get("assigned_to") ?? "") || null, remind: fd.get("remind") === "on", priority: String(fd.get("priority") ?? "normal"),
        }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
        toast.show(r);
        if (r.ok) { form.current?.reset(); setOpen(false); router.refresh(); }
      })}>
      <input name="title" required autoFocus maxLength={300} placeholder="What needs doing? e.g. Follow up Kim French about coffee supply" className={inputClass} />
      <textarea name="notes" rows={2} maxLength={4000} placeholder="Notes (optional)" className={cn(inputClass, "resize-y")} />
      <div className="grid gap-2 sm:grid-cols-[1fr_160px_130px]">
        <DateTimeField name="due" />
        <select name="assigned_to" aria-label="Assign to" className={inputClass} defaultValue="">
          <option value="">Me</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select name="priority" aria-label="Priority" className={inputClass} defaultValue="normal">
          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-[0.75rem] text-ink-muted">
        <input type="checkbox" name="remind" defaultChecked className="h-4 w-4 accent-brand-600" />
        Add a reminder to the calendar at the due time (shows as Free, so it won&apos;t block bookings)
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Add</Button>
      </div>
      {toast.node}
    </form>
  );
}

export function TaskRow({ t }: { t: TodoTask }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(t.status === "done");
  const [menu, setMenu] = useState(false);
  const toast = useToast();
  const run = (fn: () => Promise<TaskResult>) => start(async () => {
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    toast.show(r); setMenu(false); router.refresh();
  });
  return (
    <li className={cn("group flex gap-3 px-4 py-3", pending && "opacity-60")}>
      <button type="button" aria-label={done ? "Mark as not done" : "Mark as done"} disabled={pending}
        onClick={() => { setDone(!done); run(() => setTaskStatus(t.id, !done)); }}
        className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          done ? "border-brand-500 bg-brand-500 text-on-brand" : "border-line-strong bg-surface hover:border-brand-400")}>
        {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("min-w-0 break-words text-[0.8438rem]", done ? "text-ink-faint line-through" : "font-medium text-ink")}>{t.title}</p>
          {t.priority === "urgent" && !done && <Badge tone="red">Urgent</Badge>}
          {t.priority === "high" && !done && <Badge tone="amber">High</Badge>}
          {t.source !== "manual" && <Badge tone="neutral">{t.source === "assistant" ? "From Claude" : "Auto"}</Badge>}
        </div>
        {t.description && !done && <p className="mt-0.5 whitespace-pre-line break-words text-[0.7812rem] text-ink-muted">{t.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7188rem] text-ink-faint">
          {done ? <span>Done {t.completedLabel}</span> : t.dueLabel && <span className={cn(t.overdue && "font-medium text-rose-700")}>{t.overdue ? "Overdue · " : ""}{t.dueLabel}</span>}
          {t.reminder && !done && <span className="inline-flex items-center gap-1 text-brand-700"><Bell className="h-3 w-3" />In calendar</span>}
          {t.link && <Link href={t.link.href} className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline">{t.link.label}<ChevronRight className="h-3 w-3" /></Link>}
        </div>
      </div>
      {t.assignee && <span title={t.assignee}><Avatar name={t.assignee} size={22} /></span>}
      {!done && (
        <div className="relative shrink-0">
          <button type="button" aria-label="More" onClick={() => setMenu((m) => !m)} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-faint hover:bg-zinc-100 hover:text-ink">
            <Clock className="h-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-line bg-surface p-1 text-[0.7812rem] shadow-pop">
              <button className="block w-full rounded px-3 py-2 text-left hover:bg-zinc-50" onClick={() => run(() => rescheduleTask(t.id, "tomorrow"))}>Move to tomorrow 9am</button>
              <button className="block w-full rounded px-3 py-2 text-left hover:bg-zinc-50" onClick={() => run(() => rescheduleTask(t.id, "next_week"))}>Move to next week</button>
              {t.due_at && (t.reminder
                ? <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-zinc-50" onClick={() => run(() => setTaskReminder(t.id, false))}><BellOff className="h-3.5 w-3.5" />Take off the calendar</button>
                : <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-zinc-50" onClick={() => run(() => setTaskReminder(t.id, true))}><Bell className="h-3.5 w-3.5" />Remind me in the calendar</button>)}
              <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-rose-700 hover:bg-rose-50" onClick={() => run(() => deleteTask(t.id))}><Trash2 className="h-3.5 w-3.5" />Delete</button>
            </div>
          )}
        </div>
      )}
      {toast.node}
    </li>
  );
}

export function FollowUpRow({ f }: { f: TodoFollowUp }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", f.urgent ? "bg-rose-500" : "bg-amber-400")} aria-hidden />
      <div className="min-w-0 flex-1">
        <Link href={f.href} className="block break-words text-[0.8125rem] font-medium text-ink hover:text-brand-700">{f.title}</Link>
        <p className="mt-0.5 text-[0.7188rem] text-ink-faint">{KIND_LABEL[f.kind] ?? f.kind}{f.detail ? ` · ${f.detail}` : ""}</p>
      </div>
      <Button size="sm" variant="ghost" className="h-9 shrink-0 sm:h-8" disabled={pending} title="Add to the to-do list with a calendar reminder (next working morning)"
        onClick={() => start(async () => {
          const r = await followUpToTask({ key: f.key, title: f.title, ...f.link }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
          toast.show(r); router.refresh();
        })}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}To-do
      </Button>
      {toast.node}
    </li>
  );
}
