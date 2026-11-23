"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { portalButton } from "../ui";
import { requestOnProject, type ProjectRequestState } from "./actions";

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
