"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { portalButton } from "../ui";
import { raiseTicket, replyTicket, type SupportState } from "./actions";

const field = "block w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-[var(--portal-brand)] focus:outline-none";

export function RaiseTicketForm({ slug, customers, sites }: { slug: string; customers: { id: string; name: string }[]; sites: { id: string; domain: string; customer_id: string | null }[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SupportState, FormData>(raiseTicket, {});
  useEffect(() => { if (state.ok && state.id) router.push(`/p/${slug}/support/${state.id}`); }, [state, router, slug]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      {customers.length > 1 ? (
        <label className="block text-[0.8438rem] font-medium text-ink">Account
          <select name="customer" className={`${field} mt-1`}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
      ) : <input type="hidden" name="customer" value={customers[0]?.id ?? ""} />}
      {sites.length > 0 && (
        <label className="block text-[0.8438rem] font-medium text-ink">Website
          <select name="website" className={`${field} mt-1`}><option value="">Not about a particular site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}</select>
        </label>
      )}
      <label className="block text-[0.8438rem] font-medium text-ink">What do you need help with?
        <input name="subject" required maxLength={300} className={`${field} mt-1`} placeholder="e.g. Update the prices on our menu page" />
      </label>
      <label className="block text-[0.8438rem] font-medium text-ink">Details
        <textarea name="body" rows={5} className={`${field} mt-1`} placeholder="The more you tell us, the quicker we can help — page links, what you expected, screenshots you can describe…" />
      </label>
      {state.error && <p role="alert" className="text-[0.875rem] font-medium text-rose-700">{state.error}</p>}
      <button className={portalButton("primary")} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send to our team</button>
    </form>
  );
}

export function ReplyForm({ slug, ticket }: { slug: string; ticket: string }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<SupportState, FormData>(replyTicket, {});
  useEffect(() => { if (state.ok) { ref.current?.reset(); router.refresh(); } }, [state, router]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticket" value={ticket} />
      <textarea name="body" rows={4} required className={field} placeholder="Write a reply…" aria-label="Reply" />
      {state.error && <p role="alert" className="text-[0.875rem] font-medium text-rose-700">{state.error}</p>}
      <button className={portalButton("primary")} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send reply</button>
    </form>
  );
}
