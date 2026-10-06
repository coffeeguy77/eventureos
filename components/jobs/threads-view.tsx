import Link from "next/link";
import { Lock, MessageSquare } from "lucide-react";
import { card } from "./styles";
import { Composer, RequestContactButton, ShareContactButton } from "./tools";
import { EmployerInfo, type EmployerInfoData } from "./employer-info";

export interface ThreadItem { id: string; title: string; subtitle: string; photo?: string | null; unread: number; when: string }
export interface Active {
  id: string; heading: string; sub: string; href?: string | null; contactShared: boolean; contactRequested: boolean;
  contact?: { email: string | null; phone: string | null } | null; employerLines?: string[]; employer?: EmployerInfoData | null;
  messages: { id: string; sender: "employer" | "barista" | "system"; body: string; created_at: string }[];
}

const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

/** Conversations: list on the left, the open one on the right (stacked on phones). */
export function ThreadsView({ slug, side, items, active, base }: { slug: string; side: "barista" | "employer"; items: ThreadItem[]; active: Active | null; base: string }) {
  if (!items.length) return <p className={`${card} text-[0.9375rem] text-ink-muted`}><MessageSquare className="mb-2 h-6 w-6 text-ink-faint" />{side === "barista" ? "No messages yet. When an employer gets in touch, it'll show here and we'll email you." : "No conversations yet. Find a barista and send them a message."}</p>;
  return (
    <div className="grid items-start gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
      <ul className={`divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card ${active ? "hidden md:block" : ""}`}>
        {items.map((t) => (
          <li key={t.id}>
            <Link href={`${base}?t=${t.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 ${active?.id === t.id ? "bg-zinc-50" : ""}`}>
              {t.photo !== undefined && <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-zinc-100">{t.photo && <img src={t.photo} alt="" className="h-full w-full object-cover" />}</span>}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[0.9063rem] ${t.unread ? "font-bold text-ink" : "font-medium text-ink"}`}>{t.title}</span>
                <span className="block truncate text-[0.78rem] text-ink-muted">{t.subtitle}</span>
              </span>
              {t.unread > 0 && <span className="rounded-full bg-[var(--b)] px-1.5 text-[0.6875rem] font-bold leading-5 text-[var(--on-b)]">{t.unread}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {active ? (
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <header className="border-b border-line p-4">
            <Link href={base} className="mb-2 inline-block text-[0.8125rem] font-medium text-ink-muted md:hidden">← All messages</Link>
            <p className="text-[1.0625rem] font-semibold text-ink">{active.href ? <Link href={active.href} className="hover:underline">{active.heading}</Link> : active.heading}</p>
            <p className="text-[0.8125rem] text-ink-muted">{active.sub}</p>
            {active.employerLines?.map((l) => <p key={l} className="text-[0.8125rem] text-ink-muted">{l}</p>)}
            {active.employer && <div className="mt-2"><EmployerInfo e={active.employer} compact /></div>}
            <div className="mt-3">
              {side === "employer" ? (
                active.contact && (active.contact.email || active.contact.phone)
                  ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[0.875rem] text-emerald-900">Contact: {[active.contact.phone, active.contact.email].filter(Boolean).join(" · ")}</p>
                  : active.contactRequested ? <p className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-muted"><Lock className="h-3.5 w-3.5" />You&apos;ve asked for their contact details — it&apos;s up to them.</p>
                  : <RequestContactButton slug={slug} threadId={active.id} />
              ) : active.contactShared
                ? <p className="inline-flex items-center gap-1.5 text-[0.8125rem] text-emerald-800"><Lock className="h-3.5 w-3.5" />You&apos;ve shared your phone and email with them.</p>
                : <ShareContactButton slug={slug} threadId={active.id} business={active.heading} />}
            </div>
          </header>
          <ol className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
            {active.messages.map((m) => m.sender === "system" ? (
              <li key={m.id} className="text-center text-[0.78rem] text-ink-muted">{m.body}</li>
            ) : (
              <li key={m.id} className={`flex ${m.sender === side ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.9063rem] ${m.sender === side ? "bg-[var(--b)] text-[var(--on-b)]" : "bg-zinc-100 text-ink"}`}>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className="mt-1 text-[0.6875rem] opacity-70">{when(m.created_at)}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-line p-3"><Composer slug={slug} threadId={active.id} side={side} /></div>
        </section>
      ) : <p className={`hidden text-[0.9375rem] text-ink-muted md:block ${card}`}>Choose a conversation.</p>}
    </div>
  );
}
export { when as threadWhen };
