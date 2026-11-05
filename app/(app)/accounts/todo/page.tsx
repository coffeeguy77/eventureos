import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { fmtDateTime, relative, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { TodoList } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "To-do · Accounts" };

const STATUS: Record<string, string> = { new: "New", open: "Open", in_progress: "In progress", waiting: "Waiting", on_hold: "On hold", resolved: "Done", closed: "Closed" };

/** The accounts person's own list: reminders on customers, and jobs they've handed to Nerd Herd (with where they're up to). */
export default async function AccountsTodo({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, user, access } = await requireOrg();
  const showDone = sp.done === "1";
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: open }, { data: done }, { data: jobs }] = await Promise.all([
    supabase.from("tasks").select("id, title, due_at, customer:customers(id, name)").eq("organisation_id", org.id).eq("assigned_to", user.id).eq("status", "open").order("due_at", { ascending: true, nullsFirst: false }).limit(300),
    showDone ? supabase.from("tasks").select("id, title, due_at, completed_at, customer:customers(id, name)").eq("organisation_id", org.id).eq("assigned_to", user.id).eq("status", "done").gte("completed_at", weekAgo).order("completed_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    supabase.from("support_tickets").select("id, number, subject, status, created_at, resolved_at, customer:customers(id, name)").eq("organisation_id", org.id).eq("created_by", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const today = todayISO(org.timezone);
  const nowIso = new Date().toISOString();
  type T = { id: string; title: string; due_at: string | null; completed_at?: string | null; customer: { id: string; name: string } | null };
  const rows = ((open ?? []) as unknown as T[]).map((t) => ({
    id: t.id, title: t.title, customer: t.customer, done: false,
    due: t.due_at ? fmtDateTime(t.due_at, org.timezone, "date") : null, overdue: !!t.due_at && t.due_at < nowIso && fmtDay(t.due_at, org.timezone) < today,
    today: !!t.due_at && fmtDay(t.due_at, org.timezone) === today,
  }));
  const doneRows = ((done ?? []) as unknown as T[]).map((t) => ({ id: t.id, title: t.title, customer: t.customer, done: true, due: t.completed_at ? `done ${relative(t.completed_at)}` : null, overdue: false, today: false }));
  type J = { id: string; number: number; subject: string; status: string; created_at: string; resolved_at: string | null; customer: { id: string; name: string } | null };
  const J = (jobs ?? []) as unknown as J[];
  const openJobs = J.filter((j) => !["resolved", "closed"].includes(j.status));
  const recentDone = J.filter((j) => ["resolved", "closed"].includes(j.status)).slice(0, 10);
  const links = !access || access.includes("/nerd-herd");
  const overdue = rows.filter((r) => r.overdue).length;

  return (
    <>
      <PageHeader eyebrow="Accounts" title="To-do" subtitle={`${rows.length} to do${overdue ? ` · ${overdue} overdue` : ""} · ${openJobs.length} job${openJobs.length === 1 ? "" : "s"} with Nerd Herd`} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card>
          <CardHeader title="My to-do list" subtitle="Add them from a customer in Money owing (or below). Tick when done." />
          <TodoList rows={showDone ? [...rows, ...doneRows] : rows} />
          <div className="border-t border-line px-5 py-3 text-[0.8125rem]">
            <Link href={showDone ? "/accounts/todo" : "/accounts/todo?done=1"} className="font-medium text-brand-700 hover:underline">{showDone ? "Hide finished" : "Show finished this week"}</Link>
          </div>
        </Card>
        <Card>
          <CardHeader title="Sent to Nerd Herd" subtitle="Jobs you've raised and where they're up to" />
          <ul className="divide-y divide-line border-t border-line">
            {[...openJobs, ...recentDone].map((j) => (
              <li key={j.id} className="px-4 py-3 text-[0.8125rem] sm:px-5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {links ? <a href={`/nerd-herd/tickets/${j.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">#{j.number} {j.subject}</a> : <p className="font-medium text-ink">#{j.number} {j.subject}</p>}
                    <p className="text-[0.75rem] text-ink-muted">{j.customer ? <Link href={`/accounts/${j.customer.id}`} className="hover:underline">{j.customer.name}</Link> : "No customer"} · raised {relative(j.created_at)}{j.resolved_at ? ` · done ${relative(j.resolved_at)}` : ""}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${["resolved", "closed"].includes(j.status) ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-ink-muted"}`}>{STATUS[j.status] ?? j.status}</span>
                </div>
              </li>
            ))}
            {!J.length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">Nothing sent yet. On a customer, use “Send a job” under Nerd Herd — e.g. delete a website when the client&apos;s gone.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

const fmtDay = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
