import Link from "next/link";
import { ArrowLeft, ChevronRight, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDate, relative } from "@/lib/format";
import { TICKET_STATUS, SITE_STATUS, type TicketStatus } from "@/lib/nerdherd/core";
import { Panel } from "../ui";
import { requirePortal } from "../portal-data";
import { RaiseTicketForm } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support", robots: { index: false, follow: false } };

/** The client's support desk: their websites, their tickets, and a form to ask for help. */
export default async function PortalSupport({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, org, customerIds, customers } = await requirePortal(slug);
  const [{ data: tk, error }, { data: ws }] = await Promise.all([
    supabase.from("support_tickets").select("id, number, subject, status, kind, created_at, last_activity_at, resolved_at").eq("organisation_id", org.id).in("customer_id", customerIds).order("last_activity_at", { ascending: false }).limit(200),
    supabase.from("websites").select("id, domain, status, customer_id").eq("organisation_id", org.id).in("customer_id", customerIds).order("domain"),
  ]);
  if (error) throw new Error(`Could not load your tickets: ${error.message}`);
  type T = { id: string; number: number; subject: string; status: TicketStatus; kind: string; created_at: string; last_activity_at: string; resolved_at: string | null };
  const tickets = (tk ?? []) as T[];
  const sites = (ws ?? []) as { id: string; domain: string; status: string; customer_id: string | null }[];
  const open = tickets.filter((t) => !["resolved", "closed"].includes(t.status));
  const done = tickets.filter((t) => ["resolved", "closed"].includes(t.status));
  const row = (t: T) => (
    <li key={t.id}>
      <Link href={`/p/${slug}/support/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-zinc-50 sm:px-6">
        <span className="min-w-0"><span className="block truncate font-medium text-ink">{t.subject}</span><span className="block text-[0.8125rem] text-ink-muted">#{t.number} · {t.kind === "maintenance" ? "Scheduled maintenance" : "Request"} · updated {relative(t.last_activity_at)}</span></span>
        <span className="flex shrink-0 items-center gap-2"><Badge tone={TICKET_STATUS[t.status].tone}>{t.status === "awaiting_payment" ? "Waiting for payment" : t.status === "waiting_customer" ? "Waiting on you" : TICKET_STATUS[t.status].label}</Badge><ChevronRight className="h-4 w-4 text-ink-faint" /></span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-6">
      <Link href={`/p/${slug}`} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Your account</Link>
      <div>
        <h1 className="portal-serif text-[2.25rem] font-semibold leading-tight text-ink">Websites &amp; support</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">Ask us for help, follow your requests and see the maintenance done on your sites.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title={`Open requests (${open.length})`}>
            {open.length ? <ul className="divide-y divide-line border-t border-line">{open.map(row)}</ul> : <p className="border-t border-line px-4 py-8 text-center text-[0.875rem] text-ink-muted sm:px-6">Nothing open. Need something? Use the form.</p>}
          </Panel>
          {done.length > 0 && <Panel title="Finished"><ul className="divide-y divide-line border-t border-line">{done.slice(0, 30).map(row)}</ul></Panel>}
          {sites.length > 0 && (
            <Panel title="Your websites">
              <ul className="divide-y divide-line border-t border-line">
                {sites.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 font-medium text-ink hover:underline"><Globe className="h-4 w-4 shrink-0 text-[var(--portal-brand)]" /><span className="truncate">{s.domain}</span></a>
                    <Badge tone={SITE_STATUS[s.status]?.tone ?? "neutral"}>{SITE_STATUS[s.status]?.label ?? s.status}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        <Panel title="Ask for help" subtitle={`We'll reply here — you'll see it next time you sign in.`}>
          <div className="border-t border-line px-4 py-5 sm:px-6"><RaiseTicketForm slug={slug} customers={customers} sites={sites.filter((s) => s.status !== "archived")} /></div>
        </Panel>
      </div>
      {done.length > 0 && <p className="text-[0.8125rem] text-ink-faint">Last finished {fmtDate(done[0].resolved_at ?? done[0].last_activity_at)}.</p>}
    </div>
  );
}
