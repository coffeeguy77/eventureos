import Link from "next/link";
import { requireOrg, getMembers } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { addDaysISO, fmtDate, fmtDateTime, money, relative, todayISO } from "@/lib/format";
import { loadFollowUps } from "@/lib/tasks/follow-ups";
import { AddTask, FollowUpRow, TaskRow, type TodoFollowUp, type TodoTask } from "./ui";

export const metadata = { title: "To-do" };

type Row = {
  id: string; title: string; description: string | null; status: string; priority: string; due_at: string | null; assigned_to: string | null;
  completed_at: string | null; source?: string; auto_key?: string | null;
  enquiry: { id: string; number: number; title: string } | null; event: { id: string; number: number; name: string } | null; customer: { id: string; name: string } | null;
};

export default async function TodoPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, user } = await requireOrg();
  const tz = org.timezone, today = todayISO(tz), tomorrow = addDaysISO(today, 1);
  const mine = sp.who === "me";
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const cols = "id, title, description, status, priority, due_at, assigned_to, completed_at, enquiry:enquiries(id, number, title), event:events(id, number, name), customer:customers(id, name)";
  const base = () => {
    let q = supabase.from("tasks").select(`${cols}, source, auto_key`).eq("organisation_id", org.id);
    if (mine) q = q.eq("assigned_to", user.id);
    return q;
  };
  let [openRes, doneRes] = await Promise.all([
    base().neq("status", "done").order("due_at", { ascending: true, nullsFirst: false }).limit(300),
    base().eq("status", "done").gte("completed_at", since).order("completed_at", { ascending: false }).limit(50),
  ]);
  if (openRes.error && /source|auto_key/.test(openRes.error.message)) {
    // Before the database update
    const plain = () => { let q = supabase.from("tasks").select(cols).eq("organisation_id", org.id); if (mine) q = q.eq("assigned_to", user.id); return q; };
    [openRes, doneRes] = await Promise.all([
      plain().neq("status", "done").order("due_at", { ascending: true, nullsFirst: false }).limit(300),
      plain().eq("status", "done").gte("completed_at", since).order("completed_at", { ascending: false }).limit(50),
    ]) as unknown as typeof openRes[];
  }
  if (openRes.error) throw new Error(`Could not load tasks: ${openRes.error.message}`);
  const open = (openRes.data ?? []) as unknown as Row[], done = (doneRes.data ?? []) as unknown as Row[];

  const [members, remRes, followUps] = await Promise.all([
    getMembers(org.id),
    supabase.from("calendar_events").select("task_id").eq("organisation_id", org.id).not("task_id", "is", null),
    loadFollowUps(supabase, org.id, today, org.currency, (n, c) => money(n, c)).catch(() => []),
  ]);
  const withReminder = new Set(((remRes.error ? [] : remRes.data) ?? []).map((r) => (r as { task_id: string }).task_id));
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const taken = new Set(open.map((t) => t.auto_key).filter(Boolean) as string[]);
  const nowIso = new Date().toISOString();

  const toTodo = (t: Row): TodoTask => ({
    id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, due_at: t.due_at,
    dueLabel: t.due_at ? `${fmtDateTime(t.due_at, tz)} (${relative(t.due_at)})` : null,
    overdue: t.status !== "done" && !!t.due_at && t.due_at < nowIso,
    assignee: t.assigned_to ? names[t.assigned_to] ?? null : null, reminder: withReminder.has(t.id), source: t.source ?? "manual",
    link: t.enquiry ? { href: `/enquiries/${t.enquiry.id}`, label: `ENQ-${t.enquiry.number}` }
      : t.event ? { href: `/events/${t.event.id}`, label: `EV-${t.event.number} ${t.event.name}` }
      : t.customer ? { href: `/clients/${t.customer.id}`, label: t.customer.name } : null,
    completedLabel: t.completed_at ? relative(t.completed_at) : null,
  });
  const localDay = (iso: string) => todayISO(tz, new Date(iso));
  const groups: { key: string; label: string; rows: Row[] }[] = [
    { key: "overdue", label: "Overdue", rows: open.filter((t) => t.due_at && t.due_at < nowIso) },
    { key: "today", label: "Today", rows: open.filter((t) => t.due_at && t.due_at >= nowIso && localDay(t.due_at) === today) },
    { key: "tomorrow", label: "Tomorrow", rows: open.filter((t) => t.due_at && localDay(t.due_at) === tomorrow) },
    { key: "later", label: "Coming up", rows: open.filter((t) => t.due_at && localDay(t.due_at) > tomorrow) },
    { key: "nodate", label: "No date", rows: open.filter((t) => !t.due_at) },
  ].filter((g) => g.rows.length);

  const spotted: TodoFollowUp[] = followUps.filter((f) => !taken.has(f.key))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.due ?? "").localeCompare(b.due ?? ""))
    .map((f) => ({ key: f.key, kind: f.kind, title: f.title, detail: f.detail, href: f.href, urgent: f.urgent, when: f.due, link: f.link }));
  const memberOpts = members.filter((m) => m.id !== user.id).map((m) => ({ id: m.id, name: m.full_name ?? m.email }));

  return (
    <div>
      <PageHeader title="To-do" subtitle={`${open.length} open${groups[0]?.key === "overdue" ? ` · ${groups[0].rows.length} overdue` : ""} · follow-ups with a due time go in the calendar too`}
        actions={<AddTask members={memberOpts} />} />
      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-0.5 text-[0.7812rem] font-medium sm:inline-flex">
        <Link href="/tasks" className={cn("flex-1 rounded-md px-3 py-1.5 text-center", !mine ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>Everyone</Link>
        <Link href="/tasks?who=me" className={cn("flex-1 rounded-md px-3 py-1.5 text-center", mine ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>Mine</Link>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {groups.length === 0 && <Card><EmptyState title="Nothing on the list">Add a to-do, or add one of the follow-ups EventureOS has spotted.</EmptyState></Card>}
          {groups.map((g) => (
            <Card key={g.key}>
              <CardHeader title={<span className={cn(g.key === "overdue" && "text-rose-700")}>{g.label}</span>} subtitle={`${g.rows.length} task${g.rows.length === 1 ? "" : "s"}`} />
              <ul className="divide-y divide-line border-t border-line">{g.rows.map((t) => <TaskRow key={t.id} t={toTodo(t)} />)}</ul>
            </Card>
          ))}
          {done.length > 0 && (
            <details className="rounded-xl border border-line bg-surface shadow-card">
              <summary className="cursor-pointer px-5 py-3.5 text-[0.8438rem] font-semibold text-ink">Done in the last 2 weeks <span className="font-normal text-ink-faint">({done.length})</span></summary>
              <ul className="divide-y divide-line border-t border-line">{done.map((t) => <TaskRow key={t.id} t={toTodo(t)} />)}</ul>
            </details>
          )}
        </div>
        <Card className="self-start">
          <CardHeader title="Spotted for you" subtitle="Worked out automatically from emails, quotes, invoices and events — they clear themselves once done. Press + To-do to add one with a calendar reminder." />
          {spotted.length === 0
            ? <p className="px-5 pb-5 text-[0.8125rem] text-ink-muted">All caught up.</p>
            : <ul className="divide-y divide-line border-t border-line">{spotted.slice(0, 60).map((f) => <FollowUpRow key={f.key} f={f} />)}</ul>}
          {spotted.length > 60 && <p className="border-t border-line px-5 py-3 text-[0.75rem] text-ink-faint">Showing the first 60 of {spotted.length}.</p>}
          <p className="border-t border-line px-5 py-3 text-[0.7188rem] text-ink-faint">Updated {fmtDate(today)}.</p>
        </Card>
      </div>
    </div>
  );
}
