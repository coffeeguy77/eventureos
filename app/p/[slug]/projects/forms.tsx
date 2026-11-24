"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, UserMinus, UserPlus } from "lucide-react";
import { portalButton } from "../ui";
import { addTeamMember, removeTeamMember, requestOnProject, type ProjectRequestState, type TeamState } from "./actions";

const field = "block w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-[var(--portal-brand)] focus:outline-none";

export function ProjectRequestForm({ slug, project }: { slug: string; project: string }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ProjectRequestState, FormData>(requestOnProject, {});
  useEffect(() => { if (state.ok && state.id) { ref.current?.reset(); router.push(`/p/${slug}/support/${state.id}`); } }, [state, router, slug]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="project" value={project} />
      <label className="block text-[0.8438rem] font-medium text-ink">What is it?
        <select name="kind" className={`${field} mt-1`} defaultValue="change">
          <option value="change">A change</option><option value="task">A new task</option><option value="bug">Something's not working</option><option value="question">A question</option>
        </select>
      </label>
      <label className="block text-[0.8438rem] font-medium text-ink">Title
        <input name="subject" required maxLength={280} className={`${field} mt-1`} placeholder="e.g. Add credit notes to invoices" />
      </label>
      <label className="block text-[0.8438rem] font-medium text-ink">Details
        <textarea name="body" rows={5} className={`${field} mt-1`} placeholder="What you'd like, where in the app, and anything we should know…" />
      </label>
      {state.error && <p role="alert" className="text-[0.875rem] font-medium text-rose-700">{state.error}</p>}
      <button className={portalButton("primary")} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send</button>
    </form>
  );
}

export type TeamPerson = { id: string; name: string; email: string | null; role: "accounts" | "team"; signedIn: boolean; you: boolean };

/** The client's main contact adds and removes their own staff (Team access: the work and requests, no prices or hours). */
export function TeamPanel({ slug, project, people }: { slug: string; project: string; people: TeamPerson[] }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<TeamState, FormData>(addTeamMember, {});
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => { if (state.ok) { ref.current?.reset(); setOpen(false); router.refresh(); } }, [state, router]);
  return (
    <div className="space-y-3 px-4 pb-5 sm:px-6">
      <ul className="divide-y divide-line rounded-2xl ring-1 ring-inset ring-line">
        {people.map((x) => (
          <li key={x.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{x.name}{x.you ? " (you)" : ""}</span>
              <span className="block truncate text-[0.8125rem] text-ink-muted">{x.email}</span>
              <span className="block text-[0.75rem] text-ink-faint">{x.role === "accounts" ? "Full access — progress, hours and invoices" : "Team — progress and requests"}{x.signedIn ? "" : " · hasn't signed in yet"}</span>
            </span>
            {x.role === "team" && !x.you && (
              <button type="button" disabled={busy} aria-label={`Remove ${x.name}`} title="Remove their access"
                onClick={() => { if (!window.confirm(`Remove ${x.name}'s access? They're signed out straight away.`)) return; start(async () => { setErr(null); const r = await removeTeamMember(slug, project, x.id); if (r.error) setErr(r.error); else router.refresh(); }); }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted ring-1 ring-inset ring-line hover:text-rose-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}</button>
            )}
          </li>
        ))}
      </ul>
      {err && <p className="text-[0.875rem] text-rose-700 dark:text-rose-300">{err}</p>}
      {state.message && <p className="text-[0.875rem] text-emerald-700 dark:text-emerald-300">{state.message}</p>}
      {open ? (
        <form ref={ref} action={action} className="space-y-3 rounded-2xl p-4 ring-1 ring-inset ring-line">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="project" value={project} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[0.8438rem] font-medium text-ink">First name<input name="first_name" required maxLength={100} className={`${field} mt-1`} autoComplete="off" /></label>
            <label className="block text-[0.8438rem] font-medium text-ink">Last name<input name="last_name" maxLength={100} className={`${field} mt-1`} autoComplete="off" /></label>
          </div>
          <label className="block text-[0.8438rem] font-medium text-ink">Email<input name="email" type="email" required maxLength={254} inputMode="email" className={`${field} mt-1`} autoComplete="off" /></label>
          <p className="text-[0.8125rem] text-ink-muted">They'll see where the project is up to and can ask for work — never prices, hours or invoices. We email them a link; they sign in with a one-time code, no password.</p>
          {state.error && <p className="text-[0.875rem] text-rose-700 dark:text-rose-300">{state.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className={portalButton()} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Give access</button>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-11 items-center rounded-full px-4 font-medium text-ink-muted ring-1 ring-inset ring-line">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full px-4 font-semibold text-[color:var(--portal-brand-ink)] ring-1 ring-inset ring-[color:var(--portal-brand-line)] hover:bg-[var(--portal-brand-soft)]"><UserPlus className="h-4 w-4" />Add someone from your team</button>
      )}
    </div>
  );
}
