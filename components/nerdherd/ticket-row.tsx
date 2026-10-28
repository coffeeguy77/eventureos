import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDate, relative } from "@/lib/format";
import { KIND_LABEL, PRIORITY, TICKET_STATUS, type Priority, type TicketKind, type TicketStatus } from "@/lib/nerdherd/core";

export interface TicketListRow {
  id: string; number: number; assigned_to: string | null; customer_id: string | null; subject: string; status: TicketStatus; priority: Priority; kind: TicketKind; source: string;
  due_date: string | null; last_activity_at: string;
  customers: { name: string } | null; websites: { domain: string } | null; assignee: { full_name: string | null; email: string } | null;
  invoices?: { number: string | null; status: string; balance: number | null } | null;
}

export const TICKET_SELECT = "id, number, assigned_to, customer_id, subject, status, priority, kind, source, due_date, last_activity_at, customers(name), websites(domain), assignee:users!support_tickets_assigned_to_fkey(full_name, email), invoices!support_tickets_invoice_id_fkey(number, status, balance)";

export function TicketRow({ r, today }: { r: TicketListRow; today: string }) {
  const late = r.due_date && r.due_date < today && !["resolved", "closed"].includes(r.status);
  return (
    <Link href={`/nerd-herd/tickets/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
      <span className="w-12 shrink-0 text-[0.75rem] tabular text-ink-faint">#{r.number}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.875rem] font-medium text-ink">{r.subject}</p>
        <p className="truncate text-[0.75rem] text-ink-muted">
          {[r.customers?.name ?? "No client", r.websites?.domain, KIND_LABEL[r.kind], r.assignee ? (r.assignee.full_name ?? r.assignee.email) : "Unassigned"].filter(Boolean).join(" · ")}
          {r.invoices && r.status === "awaiting_payment" ? ` · invoice ${r.invoices.number ?? ""} ${r.invoices.status === "overdue" ? "overdue" : "unpaid"}` : ""}
        </p>
      </div>
      <span className="hidden text-right text-[0.7188rem] text-ink-faint sm:block">
        {r.due_date ? <span className={late ? "font-medium text-rose-700" : ""}>due {fmtDate(r.due_date, "short")}</span> : null}
        <span className="block">{relative(r.last_activity_at)}</span>
      </span>
      {r.priority !== "normal" && <Badge tone={PRIORITY[r.priority].tone}>{PRIORITY[r.priority].label}</Badge>}
      <Badge tone={TICKET_STATUS[r.status].tone}>{TICKET_STATUS[r.status].label}</Badge>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
    </Link>
  );
}
