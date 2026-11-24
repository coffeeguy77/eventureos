import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { fmtDate, money, todayISO } from "@/lib/format";
import { readNerd } from "@/lib/nerdherd/core";
import { STATUS_LABEL, billedHours, clientMargin, fmtHours, toEntry, toProject, totals } from "@/lib/nerdherd/projects";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddTime, BillProject, ClientMargin, DeleteTime, EditTime, ImportRecord, ProjectForm } from "@/components/nerdherd/project-tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const manage = canManage(role);
  const { data: row } = await supabase.from("nh_projects").select("*, customers(id, name)").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!row) notFound();
  const p = toProject(row as Record<string, unknown>);
  const client = (row as { customers: { id: string; name: string } | null }).customers;
  const [{ data: time }, { data: invs }, { data: tickets }, { data: contacts }] = await Promise.all([
    supabase.from("nh_project_time").select("*").eq("project_id", id).order("work_date", { ascending: false }).order("start_time", { ascending: false }),
    supabase.from("invoices").select("id, number, status, issue_date, due_date, total, amount_paid").eq("project_id", id).neq("status", "void").order("issue_date", { ascending: false }),
    supabase.from("support_tickets").select("id, number, subject, status, created_at, last_activity_at").eq("project_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("contacts").select("id, first_name, last_name, email, portal_user_id").eq("customer_id", p.customer_id).order("is_primary", { ascending: false }),
  ]);
  const entries = ((time ?? []) as Record<string, unknown>[]).map(toEntry);
  const rate = p.rate ?? readNerd(org.settings).hourlyRate;
  const margin = clientMargin(org.settings, p.customer_id);
  const all = totals(entries, margin, rate);
  const unbilled = totals(entries.filter((e) => !e.billed_invoice_id), margin, rate);
  const I = (invs ?? []) as { id: string; number: string; status: string; issue_date: string; due_date: string | null; total: number; amount_paid: number | null }[];
  const drafts = new Set(I.filter((i) => i.status === "draft").map((i) => i.id));
  const invoiced = I.reduce((a, i) => a + Number(i.total), 0);
  const paid = I.reduce((a, i) => a + Number(i.amount_paid ?? 0), 0);
  const owed = Math.round((invoiced - paid) * 100) / 100;
  const C = (contacts ?? []) as { id: string; first_name: string; last_name: string | null; email: string | null; portal_user_id: string | null }[];
  const onPortal = C.filter((c) => c.portal_user_id);
  const tone = { active: "brand", on_hold: "amber", complete: "green", archived: "neutral" } as const;
  const Stat = ({ label, value, note }: { label: string; value: string; note?: string }) => (
    <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-inset ring-line dark:bg-white/[0.03]">
      <p className="text-[0.75rem] text-ink-muted">{label}</p>
      <p className="text-[1.125rem] font-semibold text-ink tabular-nums">{value}</p>
      {note && <p className="text-[0.6875rem] text-ink-faint">{note}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
        <Link href="/nerd-herd/projects" className="text-ink-muted hover:underline">Projects</Link><span className="text-ink-faint">/</span>
        <span className="font-semibold text-ink">{p.name}</span><Badge tone={tone[p.status]}>{STATUS_LABEL[p.status]}</Badge>
        {client && <Link href={`/clients/${client.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{client.name}</Link>}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Billed hours" value={fmtHours(all.hours)} note={`AI ${all.ai} · yours ${all.staff} recorded`} />
        <Stat label="Client margin" value={`${margin}%`} note="on AI session time" />
        <Stat label="Billable to date" value={money(all.incGst, org.currency)} note={`${all.hours} hrs × ${money(rate * 1.1, org.currency)} inc GST`} />
        <Stat label="Not billed yet" value={money(unbilled.incGst, org.currency)} note={`${unbilled.hours} hrs`} />
        <Stat label="Invoiced" value={money(invoiced, org.currency)} note={`${money(paid, org.currency)} paid`} />
        <Stat label="Owed now" value={money(owed, org.currency)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Time log" subtitle={margin > 0 ? `AI session hours are multiplied by the client margin (+${margin}%). The client sees the billed hours only.` : "The client sees these hours. Set a client margin to multiply up AI session time."}
              action={manage && unbilled.hours > 0 ? <BillProject id={p.id} label={drafts.size ? `Add ${money(unbilled.incGst, org.currency)} to the draft invoice` : `Invoice ${money(unbilled.incGst, org.currency)}`} /> : undefined} />
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[640px] text-[0.8125rem]">
                <thead className="text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint">
                  <tr><th className="px-5 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Time</th><th className="px-3 py-2 font-medium">Billed hrs</th><th className="px-3 py-2 font-medium">Work</th><th className="px-3 py-2 font-medium">Billed</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {!entries.length && <tr><td colSpan={6} className="px-5 py-6 text-center text-ink-muted">No time yet — add it below, or import a project record.</td></tr>}
                  {entries.map((e) => (
                    <tr key={e.id} className={`align-top ${e.billable ? "" : "opacity-60"}`}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink">{fmtDate(e.work_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{e.start_time ? `${e.start_time}${e.end_time && e.end_time !== e.start_time ? `–${e.end_time}` : ""}` : "—"}</td>
                      <td className="px-3 py-2.5 font-medium tabular-nums text-ink">{billedHours(e, margin)}{(e.billed_hours != null || (e.kind === "ai" && margin > 0)) && <span className="block text-[0.6875rem] font-normal text-ink-faint">{e.hours} recorded{e.billed_hours != null ? " · set by hand" : ""}</span>}</td>
                      <td className="px-3 py-2.5 text-ink">
                        {e.source === "meeting"
                          ? <><span className="font-medium">Meeting with {e.by_name}</span><ul className="mt-1 list-disc space-y-0.5 pl-4">{e.work.split("\n").filter((x) => x.trim()).map((x, k) => <li key={k}>{x.replace(/^[•\-*]\s*/, "")}</li>)}</ul></>
                          : <span className="whitespace-pre-line">{e.work}</span>}
                        <span className="mt-0.5 block text-[0.75rem] text-ink-muted">{e.source === "meeting" ? "Meeting" : e.kind === "ai" ? `AI session${e.source ? ` · ${e.source}` : ""}` : `My time${e.by_name ? ` · ${e.by_name}` : ""}`}{e.billable ? "" : " · not billable"}</span>
                        {manage && (!e.billed_invoice_id || drafts.has(e.billed_invoice_id)) && <EditTime id={p.id} e={e} computed={billedHours({ ...e, billed_hours: null }, margin)} />}</td>
                      <td className="px-3 py-2.5">{e.billed_invoice_id ? <Link href={`/invoices/${e.billed_invoice_id}`} className="text-brand-700 hover:underline dark:text-brand-300">Invoice</Link> : <span className="text-ink-faint">Not yet</span>}</td>
                      <td className="px-3 py-2.5 text-right">{manage && !e.billed_invoice_id && <DeleteTime id={p.id} entryId={e.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {manage && <AddTime id={p.id} today={todayISO(org.timezone)} />}
          </Card>

          <Card>
            <CardHeader title="Requests" subtitle="What the client asks for from their portal. Replies stay on each request." />
            <ul className="divide-y divide-line border-t border-line">
              {!(tickets ?? []).length && <li className="px-5 py-5 text-center text-[0.8125rem] text-ink-muted">No requests yet.</li>}
              {((tickets ?? []) as { id: string; number: number; subject: string; status: string; created_at: string }[]).map((t) => (
                <li key={t.id}><Link href={`/nerd-herd/tickets/${t.id}`} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-[0.8125rem] hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                  <span className="font-medium text-ink">#{t.number} {t.subject}</span><Badge tone={/resolved|closed/.test(t.status) ? "green" : "brand"}>{t.status.replace(/_/g, " ")}</Badge>
                  <span className="ml-auto text-ink-muted">{fmtDate(t.created_at.slice(0, 10))}</span></Link></li>
              ))}
            </ul>
          </Card>

          {manage && <Card><CardHeader title="Project details" subtitle="Everything here except staff notes shows in the client's portal." /><ProjectForm p={p} /></Card>}
        </div>

        <div className="space-y-5">
          {manage && client && <Card><CardHeader title="Client margin" subtitle={`Applies to every ${client.name} project and invoice.`} /><ClientMargin customerId={client.id} value={margin} clientName={client.name} /></Card>}

          <Card>
            <CardHeader title="Client portal" subtitle={p.portal ? "This project shows in their portal." : "Hidden from their portal."} />
            <div className="space-y-2 border-t border-line px-5 py-4 text-[0.8125rem]">
              {onPortal.length
                ? onPortal.map((c) => <p key={c.id} className="text-ink">✓ {c.first_name} {c.last_name ?? ""} <span className="text-ink-muted">can sign in</span></p>)
                : <p className="text-ink-muted">Nobody at {client?.name ?? "this client"} can sign in yet.</p>}
              {client && <Link href={`/clients/${client.id}`} className="inline-block font-medium text-brand-700 hover:underline dark:text-brand-300">Add a contact or send a portal invite →</Link>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Invoices" />
            <ul className="divide-y divide-line border-t border-line">
              {!I.length && <li className="px-5 py-5 text-center text-[0.8125rem] text-ink-muted">None yet.</li>}
              {I.map((i) => (
                <li key={i.id}><Link href={`/invoices/${i.id}`} className="flex items-center gap-2 px-5 py-2.5 text-[0.8125rem] hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                  <span className="font-medium text-ink">{i.number}</span><Badge tone={i.status === "paid" ? "green" : i.status === "draft" ? "neutral" : i.status === "overdue" ? "red" : "brand"}>{i.status}</Badge>
                  <span className="ml-auto tabular-nums text-ink">{money(Number(i.total), org.currency)}</span></Link></li>
              ))}
            </ul>
          </Card>

          {(p.phases.length > 0 || p.links.length > 0 || p.open_items.length > 0) && (
            <Card>
              <CardHeader title="At a glance" subtitle={p.status_note ?? undefined} />
              <div className="space-y-4 border-t border-line px-5 py-4 text-[0.8125rem]">
                {p.phases.length > 0 && <div><p className="mb-1 font-semibold text-ink">Phases</p><ol className="space-y-1">{p.phases.map((x, i) => <li key={i} className="text-ink">{i + 1}. {x.name}<span className="block text-[0.75rem] text-ink-muted">{[x.dates, x.status].filter(Boolean).join(" · ")}</span></li>)}</ol></div>}
                {p.links.length > 0 && <div><p className="mb-1 font-semibold text-ink">Links</p>{p.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener" className="flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300">{l.label}<ExternalLink className="h-3 w-3" /></a>)}</div>}
                {p.open_items.length > 0 && <div><p className="mb-1 font-semibold text-ink">Open items</p><ul className="list-disc space-y-1 pl-4 text-ink">{p.open_items.map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
              </div>
            </Card>
          )}

          {manage && <Card><CardHeader title="Import a project record" /><ImportRecord id={p.id} /></Card>}
        </div>
      </div>
    </div>
  );
}
