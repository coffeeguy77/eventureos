"use client";

import { useRef, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { relative } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface NoteRow { id: string; body: string; created_at: string; created_by: string | null }

export function NotesPanel({ notes, names, action }: {
  notes: NoteRow[]; names: Record<string, string>; action: (form: FormData) => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <div className="px-5 pb-5">
      <form
        ref={form}
        action={(fd) => start(async () => { await action(fd); form.current?.reset(); })}
        className="mb-4"
      >
        <textarea name="body" rows={2} required placeholder="Add an internal note — only your team can see this"
          className={cn(inputClass, "resize-y")} />
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="secondary" disabled={pending}>{pending ? "Saving…" : "Add note"}</Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="text-[12.5px] text-ink-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="flex gap-3">
              <Avatar name={names[n.created_by ?? ""] ?? "Team"} size={24} />
              <div className="min-w-0 flex-1 rounded-lg bg-amber-50/60 px-3 py-2 ring-1 ring-inset ring-amber-100">
                <p className="whitespace-pre-line text-[13px] text-ink">{n.body}</p>
                <p className="mt-1 text-[11.5px] text-ink-faint">{names[n.created_by ?? ""] ?? "Team member"} · {relative(n.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
