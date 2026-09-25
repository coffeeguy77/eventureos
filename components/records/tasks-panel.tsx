"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { TaskCheckbox } from "@/components/records/task-checkbox";
import { relative } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/types";
import { DateTimeField } from "@/components/ui/datetime-field";

export function TasksPanel({ tasks, members, action }: {
  tasks: Task[]; members: { id: string; name: string }[]; action: (form: FormData) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const now = new Date().toISOString();
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="px-5 pb-4">
      <ul className="space-y-1">
        {[...open, ...done].map((t) => {
          const overdue = t.status !== "done" && t.due_at && t.due_at < now;
          return (
            <li key={t.id} className="flex gap-2.5 py-1.5">
              <TaskCheckbox id={t.id} done={t.status === "done"} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-[13px]", t.status === "done" ? "text-ink-faint line-through" : "text-ink")}>{t.title}</p>
                {t.due_at && t.status !== "done" && (
                  <p className={cn("text-[11.5px]", overdue ? "font-medium text-rose-700" : "text-ink-faint")}>
                    {overdue ? "Overdue · " : "Due "}{relative(t.due_at)}
                  </p>
                )}
              </div>
              {t.assigned_to && <Avatar name={names[t.assigned_to]} size={20} />}
            </li>
          );
        })}
        {tasks.length === 0 && !adding && <li className="text-[12.5px] text-ink-muted">No tasks.</li>}
      </ul>
      {adding ? (
        <form ref={form} className="mt-3 space-y-2"
          action={(fd) => start(async () => { await action(fd); form.current?.reset(); setAdding(false); })}>
          <input name="title" required autoFocus placeholder="What needs doing?" className={inputClass} />
          <div className="flex gap-2">
            <div className="flex-1"><DateTimeField name="due" /></div>
            <select name="assigned_to" className={cn(inputClass, "w-40")} defaultValue="">
              <option value="">Me</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" variant="primary" disabled={pending}>{pending ? "Adding…" : "Add task"}</Button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-600 hover:text-brand-700">
          <Plus className="h-3.5 w-3.5" /> Add task
        </button>
      )}
    </div>
  );
}
