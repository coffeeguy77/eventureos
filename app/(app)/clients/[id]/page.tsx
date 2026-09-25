import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, MapPin } from "lucide-react";
import { requireOrg, getMembers } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ActivityFeed } from "@/components/records/activity-feed";
import { ENQUIRY_STATUS, EVENT_STATUS, INVOICE_STATUS } from "@/lib/status";
import { fmtDate, money, relative } from "@/lib/format";
import type { ActivityLog, EnquiryStatus, EventStatus, InvoiceStatus } from "@/lib/types";

export const metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: c, error } = await supabase.from("customers").select("*").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Could not load client: ${error.message}`);
  if (!c) notFound();

  const [contacts, events, enquiries, invoices, activity, members] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, email, phone, position, is_primary").eq("customer_id", id).order("is_primary", { ascending: false }),
    supabase.from("events").select("id, number, name, event_date, status, venue").eq("customer_id", id).order("event_date", { ascending: false }),
    supabase.from("enquiries").select("id, number, title, status, received_at").eq("customer_id", id).order("received_at", { ascending: false }),
    supabase.from("invoices").select("id, number, total, amount_paid, balance, status, due_date, event_id").eq("customer_id", id).order("issue_date", { ascending: false }),
    supabase.from("activity_logs").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(30),
    getMembers(org.id),
  ]);
  for (const r of [contacts, events, enquiries, invoices, activity]) if (r.error) throw new Error(`Could not load client details: ${r.error.message}`);
  const inv = (invoices.data ?? []).filter((i) => i.status !== "void");
  const ltv = inv.reduce((s, i) => s + Number(i.amount_paid), 0);
  const owing = inv.reduce((s, i) => s + Number(i.balance), 0);
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));

  return (
    <div>
      <div className="mb-1 text-[12px] text-ink-faint"><Link href="/clients" className="hover:text-ink">Clients</Link></div>
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={c.name} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold tracking-tight">{c.name}</h1>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
              {c.company && c.company !== c.name && <span>{c.company}</span>}
              {c.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{c.email}</span>}
              {c.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
              {c.address && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{c.address}</span>}
            </div>
          </div>
          <ButtonLink href={`/events/new?customer=${c.id}`} variant="primary">New event</ButtonLink>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          {[
            ["Client since", fmtDate(c.customer_since)],
            ["Lifetime value", money(ltv, org.currency)],
            ["Events", String(events.data?.length ?? 0)],
            ["Outstanding", money(owing, org.currency)],
          ].map(([k, v]) => (
            <div key={k}><dt className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">{k}</dt><dd className="mt-1 text-[16px] font-semibold text-ink">{v}</dd></div>
          ))}
        </dl>
        {c.notes && <p className="mt-5 rounded-lg bg-amber-50/60 px-3 py-2 text-[13px] text-ink ring-1 ring-inset ring-amber-100">{c.notes}</p>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Events" />
            {(events.data ?? []).length === 0 ? <EmptyState title="No events yet" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {(events.data ?? []).map((e) => (
                  <li key={e.id}><Link href={`/events/${e.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50/70">
                    <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-medium text-ink">{e.name}</p><p className="text-[12px] text-ink-muted">EV-{e.number} · {fmtDate(e.event_date)}{e.venue ? ` · ${e.venue}` : ""}</p></div>
                    <Badge tone={EVENT_STATUS[e.status as EventStatus].tone} dot>{EVENT_STATUS[e.status as EventStatus].label}</Badge>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Invoices" action={<span className="text-[11.5px] text-ink-faint">Xero not connected</span>} />
            {inv.length === 0 ? <EmptyState title="No invoices yet" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {(invoices.data ?? []).map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1"><p className="text-[13px] font-medium text-ink">{i.number}</p><p className="text-[12px] text-ink-muted">Due {fmtDate(i.due_date)}</p></div>
                    <span className="tabular text-[13px] text-ink">{money(i.total, org.currency)}</span>
                    <Badge tone={INVOICE_STATUS[i.status as InvoiceStatus].tone}>{INVOICE_STATUS[i.status as InvoiceStatus].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Activity" />
            <ActivityFeed items={(activity.data ?? []) as ActivityLog[]} names={names} tz={org.timezone} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contacts" />
            <ul className="space-y-3 px-5 pb-5">
              {(contacts.data ?? []).map((ct) => (
                <li key={ct.id} className="flex items-start gap-3">
                  <Avatar name={`${ct.first_name} ${ct.last_name ?? ""}`} size={30} />
                  <div className="min-w-0 text-[13px]">
                    <p className="font-medium text-ink">{ct.first_name} {ct.last_name}{ct.is_primary && <Badge tone="brand" className="ml-2">Primary</Badge>}</p>
                    <p className="text-ink-muted">{[ct.position, ct.email, ct.phone].filter(Boolean).join(" · ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Enquiries" />
            {(enquiries.data ?? []).length === 0 ? <p className="px-5 pb-5 text-[12.5px] text-ink-muted">None.</p> : (
              <ul className="divide-y divide-line border-t border-line">
                {(enquiries.data ?? []).map((q) => (
                  <li key={q.id}><Link href={`/enquiries/${q.id}`} className="flex items-center gap-2 px-5 py-2.5 hover:bg-zinc-50/70">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{q.title}</span>
                    <span className="text-[11.5px] text-ink-faint">{relative(q.received_at)}</span>
                    <Badge tone={ENQUIRY_STATUS[q.status as EnquiryStatus].tone}>{ENQUIRY_STATUS[q.status as EnquiryStatus].label}</Badge>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
          <p className="px-1 text-[12px] text-ink-faint">The full CRM record — emails, quotes, payments and documents tabs — arrives in the next build.</p>
        </div>
      </div>
    </div>
  );
}
