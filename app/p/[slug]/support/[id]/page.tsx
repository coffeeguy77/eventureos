import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { TICKET_STATUS, readChecklist, type TicketStatus } from "@/lib/nerdherd/core";
import { Panel } from "../../ui";
import { isUuid, requirePortal } from "../../portal-data";
import { ReplyForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support request", robots: { index: false, follow: false } };

export default async function PortalTicket({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, org, customerIds } = await requirePortal(slug);
  const { data: t } = await supabase.from("support_tickets").select("id, number, subject, status, kind, checklist, created_at, resolved_at, websites(domain)")
    .eq("id", id).eq("organisation_id", org.id).in("customer_id", customerIds).maybeSingle();
  if (!t) notFound();
  const tk = t as unknown as { id: string; number: number; subject: string; status: TicketStatus; kind: string; checklist: unknown; created_at: string; resolved_at: string | null; websites: { domain: string } | null };
  const { data: ups } = await supabase.from("support_ticket_updates").select("id, kind, body, author_name, author_id, created_at").eq("ticket_id", id).eq("public", true).order("created_at");
  const updates = (ups ?? []) as { id: string; kind: string; body: string | null; author_name: string | null; author_id: string | null; created_at: string }[];
  const checks = readChecklist(tk.checklist);
  const closed = tk.status === "resolved" || tk.status === "closed";

  return (
    <div className="space-y-6">
      <Link href={`/p/${slug}/support`} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Websites &amp; support</Link>
      <div>
        <p className="text-[0.8125rem] text-ink-muted">#{tk.number}{tk.websites ? ` · ${tk.websites.domain}` : ""} · opened {fmtDateTime(tk.created_at, org.timezone)}</p>
        <h1 className="portal-serif mt-1 break-words text-[2rem] font-semibold leading-tight text-ink">{tk.subject}</h1>
        <div className="mt-2"><Badge tone={TICKET_STATUS[tk.status].tone}>{tk.status === "awaiting_payment" ? "Waiting for payment — we'll start once the invoice is paid" : tk.status === "waiting_customer" ? "Waiting on you" : TICKET_STATUS[tk.status].label}</Badge></div>
      </div>
      {tk.kind === "maintenance" && checks.length > 0 && (
        <Panel title="Maintenance checks">
          <ul className="space-y-2 border-t border-line px-4 py-4 sm:px-6">
            {checks.map((c, k) => <li key={k} className="flex items-center gap-2 text-[0.9375rem]">{c.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-ink-faint" />}<span className={c.done ? "text-ink" : "text-ink-muted"}>{c.label}</span></li>)}
          </ul>
        </Panel>
      )}
      <Panel title="Conversation">
        {updates.length ? (
          <ol className="divide-y divide-line border-t border-line">
            {updates.map((u) => (
              <li key={u.id} className="px-4 py-4 sm:px-6">
                <p className="text-[0.8125rem] text-ink-muted"><span className="font-medium text-ink">{u.author_name ?? (u.kind === "email_out" ? "Our team" : "You")}</span> · {fmtDateTime(u.created_at, org.timezone)}</p>
                {u.body && <p className="mt-1.5 whitespace-pre-wrap break-words text-[0.9375rem] text-ink">{u.body}</p>}
              </li>
            ))}
          </ol>
        ) : <p className="border-t border-line px-4 py-8 text-center text-[0.875rem] text-ink-muted sm:px-6">No messages yet.</p>}
        <div className="border-t border-line px-4 py-5 sm:px-6">
          {closed && <p className="mb-3 text-[0.875rem] text-ink-muted">This request is finished. Replying reopens it.</p>}
          <ReplyForm slug={slug} ticket={tk.id} />
        </div>
      </Panel>
    </div>
  );
}
