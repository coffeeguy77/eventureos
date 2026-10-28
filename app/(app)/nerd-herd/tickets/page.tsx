import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { todayISO } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/nerdherd/core";
import { Card, EmptyState } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { TICKET_SELECT, TicketRow, type TicketListRow } from "@/components/nerdherd/ticket-row";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "open", label: "All open" }, { key: "new", label: "New" }, { key: "ready", label: "Ready to do" }, { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" }, { key: "late", label: "Past due" }, { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "waiting_customer", label: "Waiting on client" }, { key: "done", label: "Done" }, { key: "all", label: "All" },
] as const;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string; kind?: string }> }) {
  const { supabase, org, user } = await requireOrg();
  const sp = await searchParams;
  const view = VIEWS.find((x) => x.key === sp.v)?.key ?? "open";
  const today = todayISO(org.timezone);
  let q = supabase.from("support_tickets").select(TICKET_SELECT).eq("organisation_id", org.id);
  if (view === "done") q = q.in("status", ["resolved", "closed"]);
  else if (view !== "all") q = q.in("status", OPEN_STATUSES);
  if (sp.kind) q = q.eq("kind", sp.kind);
  const { data, error } = await q.order("last_activity_at", { ascending: false }).limit(1000);
  if (error) throw new Error(`Couldn't load tickets: ${error.message}`);
  let rows = (data ?? []) as unknown as TicketListRow[];
  if (view === "new") rows = rows.filter((r) => r.status === "new");
  if (view === "ready") rows = rows.filter((r) => ["open", "in_progress", "scheduled"].includes(r.status));
  if (view === "mine") rows = rows.filter((r) => r.assigned_to === user.id);
  if (view === "unassigned") rows = rows.filter((r) => !r.assigned_to);
  if (view === "late") rows = rows.filter((r) => r.due_date && r.due_date < today && r.status !== "awaiting_payment");
  if (view === "awaiting_payment" || view === "waiting_customer") rows = rows.filter((r) => r.status === view);
  const text = (sp.q ?? "").trim().toLowerCase();
  if (text) rows = rows.filter((r) => [`#${r.number}`, r.subject, r.customers?.name, r.websites?.domain].filter(Boolean).join(" ").toLowerCase().includes(text));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex-1"><input type="hidden" name="v" value={view} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search tickets, clients, websites" className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-[0.875rem]" /></form>
        <ButtonLink href="/nerd-herd/tickets/new" variant="primary"><Plus className="h-4 w-4" />New ticket</ButtonLink>
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {VIEWS.map((v) => <Link key={v.key} href={`/nerd-herd/tickets?v=${v.key}`} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", v.key === view ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{v.label}</Link>)}
      </div>
      {!rows.length ? <Card><EmptyState title="No tickets here" action={<ButtonLink href="/nerd-herd/tickets/new" size="sm">New ticket</ButtonLink>}>Tickets come from your support inbox, the client portal, maintenance plans — or add one yourself.</EmptyState></Card>
        : <Card className="divide-y divide-line">{rows.map((r) => <TicketRow key={r.id} r={r} today={today} />)}</Card>}
      {rows.length >= 1000 && <p className="text-[0.75rem] text-ink-muted">Showing the 1,000 most recent — search to narrow it down.</p>}
    </div>
  );
}
