import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { canManage, getMembers, requireOrg } from "@/lib/context";
import { fmtDate, fmtDateTime, money, relative, todayISO } from "@/lib/format";
import { KIND_LABEL, PRIORITY, TICKET_STATUS, fmtMinutes, readChecklist, readNerd, type Priority, type TicketKind, type TicketStatus } from "@/lib/nerdherd/core";
import type { NextAction } from "@/lib/next-action";
import { Card, CardHeader, EmptyState, Field } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NextActionBanner } from "@/components/records/next-action";
import { TicketControls, Composer, Checklist, BillTime, DeleteTicket } from "@/components/nerdherd/ticket-tools";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

type Ticket = {
  id: string; number: number; subject: string; description: string | null; status: TicketStatus; priority: Priority; kind: TicketKind; source: string;
  customer_id: string | null; website_id: string | null; assigned_to: string | null; due_date: string | null; checklist: unknown; external_ref: string | null;
  email_thread_id: string | null; invoice_id: string | null; recurring_id: string | null; created_at: string; resolved_at: string | null;
  customers: { id: string; name: string; email: string | null; phone: string | null } | null;
  websites: { id: string; domain: string; admin_url: string | null; platform: string } | null;
  invoices: { id: string; number: string | null; status: string; total: number; balance: number | null; due_date: string | null } | null;
  recurring_invoices: { id: string; name: string } | null;
};
type Update = { id: string; kind: string; body: string | null; minutes: number | null; billable: boolean; billed_invoice_id: string | null; public: boolean; author_name: string | null; created_at: string };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const { data, error } = await supabase.from("support_tickets")
    .select("*, customers(id, name, email, phone), websites(id, domain, admin_url, platform), invoices!support_tickets_invoice_id_fkey(id, number, status, total, balance, due_date), recurring_invoices(id, name)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Couldn't load the ticket: ${error.message}`);
  if (!data) notFound();
  const tk = data as unknown as Ticket;
  const today = todayISO(org.timezone);
  const [{ data: ups }, members, { data: clients }, { data: sites }, { data: history }] = await Promise.all([
    supabase.from("support_ticket_updates").select("id, kind, body, minutes, billable, billed_invoice_id, public, author_name, created_at").eq("ticket_id", id).order("created_at"),
    getMembers(org.id),
    supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").limit(5000),
    supabase.from("websites").select("id, domain, customer_id").eq("organisation_id", org.id).neq("status", "archived").order("domain").limit(5000),
    tk.customer_id ? supabase.from("support_tickets").select("id, number, subject, status, created_at").eq("organisation_id", org.id).eq("customer_id", tk.customer_id).neq("id", id).order("created_at", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
  ]);
  const updates = (ups ?? []) as Update[];
  const minutes = updates.reduce((a, u) => a + Number(u.minutes ?? 0), 0);
  const unbilled = updates.filter((u) => u.billable && !u.billed_invoice_id).reduce((a, u) => a + Number(u.minutes ?? 0), 0);
  const checklist = readChecklist(tk.checklist);
  const s = readNerd(org.settings);
  const manage = canManage(role);

  const na: NextAction =
    tk.status === "new" ? { label: "Read it, set a priority and assign it", urgency: "soon", detail: `Came in ${relative(tk.created_at)}` }
    : tk.status === "awaiting_payment" ? { label: `Wait for invoice ${tk.invoices?.number ?? ""} to be paid`, urgency: tk.invoices?.status === "overdue" ? "overdue" : "normal", detail: tk.invoices?.status === "overdue" ? "The invoice is overdue — chase it before doing the work" : "It moves to Ready to do by itself when it's paid" }
    : tk.status === "waiting_customer" ? { label: "Waiting for the client to reply", urgency: "normal" }
    : tk.status === "resolved" || tk.status === "closed" ? { label: tk.status === "resolved" ? "Done" : "Closed", urgency: "done", detail: tk.resolved_at ? `on ${fmtDateTime(tk.resolved_at, org.timezone, "date")}` : undefined }
    : tk.kind === "maintenance" && checklist.some((c) => !c.done) ? { label: `Do the maintenance: ${checklist.filter((c) => !c.done).length} of ${checklist.length} checks left`, urgency: tk.due_date && tk.due_date < today ? "overdue" : "normal", due: tk.due_date }
    : { label: "Do the work, then mark it done", urgency: tk.due_date && tk.due_date < today ? "overdue" : "normal", due: tk.due_date };

  return (
    <div className="space-y-5">
      <Link href="/nerd-herd/tickets" className="inline-flex items-center gap-1 text-[0.7812rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Tickets</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.75rem] text-ink-faint">#{tk.number} · {KIND_LABEL[tk.kind]} · from {tk.source === "repairshopr" ? `RepairShopr${tk.external_ref ? ` ${tk.external_ref}` : ""}` : tk.source} · opened {fmtDateTime(tk.created_at, org.timezone)}</p>
          <h2 className="mt-0.5 break-words text-[1.125rem] font-semibold text-ink">{tk.subject}</h2>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
            {tk.customers ? <Link href={`/clients/${tk.customers.id}?tab=web`} className="font-medium text-brand-600 hover:underline">{tk.customers.name}</Link> : "No client yet"}
            {tk.websites && <> · <Link href={`/nerd-herd/websites/${tk.websites.id}`} className="hover:underline">{tk.websites.domain}</Link></>}
          </p>
        </div>
        <div className="flex gap-1.5">
          {tk.priority !== "normal" && <Badge tone={PRIORITY[tk.priority].tone}>{PRIORITY[tk.priority].label}</Badge>}
          <Badge tone={TICKET_STATUS[tk.status].tone}>{TICKET_STATUS[tk.status].label}</Badge>
        </div>
      </div>
      <NextActionBanner action={na} />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {tk.kind === "maintenance" && (
            <Card>
              <CardHeader title="Maintenance checklist" subtitle={tk.recurring_invoices ? <>From plan <Link className="underline" href={`/hosting/recurring/${tk.recurring_invoices.id}`}>{tk.recurring_invoices.name}</Link></> : undefined} />
              <div className="border-t border-line px-5 py-4"><Checklist id={tk.id} items={checklist} locked={tk.status === "awaiting_payment"} /></div>
            </Card>
          )}
          <Card>
            <CardHeader title="Conversation and work log" subtitle="Replies marked for the client show in their portal. Notes and time stay internal." />
            <div className="border-t border-line">
              {!updates.length ? <EmptyState title="Nothing logged yet" /> : (
                <ol className="divide-y divide-line">
                  {updates.map((u) => (
                    <li key={u.id} className={cn("px-5 py-3", u.kind === "note" && "bg-amber-50/40", (u.kind === "system" || u.kind === "status") && "py-2")}>
                      {u.kind === "system" || u.kind === "status" ? (
                        <p className="text-[0.75rem] text-ink-muted">{u.body} · {fmtDateTime(u.created_at, org.timezone)}</p>
                      ) : <>
                        <p className="text-[0.75rem] text-ink-faint">
                          <span className="font-medium text-ink">{u.author_name ?? "Someone"}</span>
                          {" · "}{u.kind === "email_in" ? "emailed" : u.kind === "email_out" ? "emailed the client" : u.kind === "comment" ? (u.public ? "replied (client can see)" : "replied") : u.kind === "time" ? "logged time" : "internal note"}
                          {" · "}{fmtDateTime(u.created_at, org.timezone)}
                          {u.minutes ? <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-ink-muted">{fmtMinutes(u.minutes)}{u.billable ? (u.billed_invoice_id ? " · billed" : " · billable") : " · not billed"}</span> : null}
                        </p>
                        {u.body && <p className="mt-1 whitespace-pre-wrap break-words text-[0.8438rem] text-ink">{u.body}</p>}
                      </>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="border-t border-line px-5 py-4"><Composer id={tk.id} status={tk.status} hasClient={!!tk.customer_id} /></div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <div className="border-t border-line px-5 py-4">
              <TicketControls id={tk.id} initial={{ status: tk.status, priority: tk.priority, kind: tk.kind, assigned_to: tk.assigned_to, customer_id: tk.customer_id, website_id: tk.website_id, due_date: tk.due_date }}
                members={members.map((m) => ({ id: m.id, name: m.full_name ?? m.email }))} clients={(clients ?? []) as { id: string; name: string }[]} sites={(sites ?? []) as { id: string; domain: string; customer_id: string | null }[]} />
            </div>
          </Card>
          {tk.invoices && (
            <Card>
              <CardHeader title="Paid by" />
              <div className="space-y-2 border-t border-line px-5 py-4 text-[0.8125rem]">
                <Link href={`/invoices/${tk.invoices.id}`} className="font-medium text-brand-600 hover:underline">Invoice {tk.invoices.number}</Link>
                <p className="text-ink-muted">{money(tk.invoices.total, org.currency)} · {tk.invoices.status === "paid" ? "paid" : `${money(tk.invoices.balance ?? 0, org.currency)} owing, due ${fmtDate(tk.invoices.due_date)}`}</p>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Time" subtitle={`${fmtMinutes(minutes)} logged · ${fmtMinutes(unbilled)} not billed yet`} />
            <div className="border-t border-line px-5 py-4">
              {manage ? <BillTime id={tk.id} unbilled={unbilled} rate={s.hourlyRate} currency={org.currency} hasClient={!!tk.customer_id} /> : <p className="text-[0.7812rem] text-ink-muted">A manager raises the invoice for this time.</p>}
            </div>
          </Card>
          {tk.customers && (
            <Card>
              <CardHeader title="Client" action={<Link href={`/clients/${tk.customers.id}?tab=web`} className="text-[0.75rem] font-medium text-brand-600">Account</Link>} />
              <div className="space-y-3 border-t border-line px-5 py-4">
                <Field label="Contact">{[tk.customers.email, tk.customers.phone].filter(Boolean).join(" · ") || "—"}</Field>
                {tk.websites?.admin_url && <Field label="Site admin"><a href={tk.websites.admin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">Open <ExternalLink className="h-3 w-3" /></a></Field>}
                {(history ?? []).length > 0 && (
                  <Field label="Other tickets">
                    <ul className="space-y-1">{(history as { id: string; number: number; subject: string; status: TicketStatus }[]).map((h) => <li key={h.id}><Link href={`/nerd-herd/tickets/${h.id}`} className="hover:underline">#{h.number} {h.subject}</Link> <span className="text-ink-faint">· {TICKET_STATUS[h.status].label}</span></li>)}</ul>
                  </Field>
                )}
              </div>
            </Card>
          )}
          {tk.email_thread_id && <Link href={`/clients/${tk.customer_id}?tab=emails`} className="block text-[0.7812rem] text-brand-600 hover:underline">See the email conversation</Link>}
          {manage && <DeleteTicket id={tk.id} />}
        </div>
      </div>
    </div>
  );
}
