import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDate, money } from "@/lib/format";
import { createServiceClient } from "@/lib/integrations/runtime";
import { readNerd } from "@/lib/nerdherd/core";
import { STATUS_LABEL, billedHours, clientMargin, fmtHours, toEntry, toProject, totals } from "@/lib/nerdherd/projects";
import { Panel } from "../../ui";
import { isUuid, requirePortal } from "../../portal-data";
import { ProjectRequestForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project", robots: { index: false, follow: false } };

/**
 * The client's view of a project: where it's up to, the time log with a running total, what they've asked for,
 * and the invoices with what's owed. Read with the service client only after requirePortal() proves the project is theirs.
 */
export default async function PortalProject({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requirePortal(slug);
  const db = createServiceClient();
  const { data: row } = await db.from("nh_projects").select("*").eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  if (!row || !(row as { portal: boolean }).portal || !ctx.customerIds.includes((row as { customer_id: string }).customer_id)) notFound();
  const p = toProject(row as Record<string, unknown>);
  const [{ data: time }, { data: invs }, { data: tk }, { data: o }] = await Promise.all([
    db.from("nh_project_time").select("*").eq("project_id", id).eq("billable", true).order("work_date", { ascending: false }).order("start_time", { ascending: false }),
    db.from("invoices").select("id, number, issue_date, due_date, total, balance, status, pay_token").eq("project_id", id).not("status", "in", "(draft,void)").order("issue_date", { ascending: false }),
    db.from("support_tickets").select("id, number, subject, status, last_activity_at").eq("project_id", id).order("last_activity_at", { ascending: false }).limit(50),
    db.from("organisations").select("settings").eq("id", ctx.org.id).maybeSingle(),
  ]);
  const entries = ((time ?? []) as Record<string, unknown>[]).map(toEntry);
  const rate = p.rate ?? readNerd(o?.settings).hourlyRate;
  const m = clientMargin(o?.settings, p.customer_id);
  const t = totals(entries, m, rate);
  const notBilled = totals(entries.filter((e) => !e.billed_invoice_id), m, rate);
  const I = (invs ?? []) as { id: string; number: string | null; issue_date: string; due_date: string | null; total: number; balance: number; status: string; pay_token: string }[];
  const owed = I.reduce((a, i) => a + Math.max(0, Number(i.balance)), 0);
  const cur = ctx.org.currency;
  const base = `/p/${slug}`;
  const tickets = (tk ?? []) as { id: string; number: number; subject: string; status: string; last_activity_at: string }[];

  return (
    <div className="space-y-6">
      <Link href={base} className="inline-flex items-center gap-1.5 text-[0.875rem] font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Home</Link>
      <section className="rounded-[28px] bg-surface p-6 ring-1 ring-line sm:p-8">
        <p className="flex flex-wrap items-center gap-2"><Badge tone={p.status === "complete" ? "green" : p.status === "on_hold" ? "amber" : "brand"}>{STATUS_LABEL[p.status]}</Badge>{p.delivered_by && <span className="text-[0.8125rem] text-ink-muted">by {p.delivered_by}</span>}</p>
        <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight text-ink sm:text-[2rem]">{p.name}</h1>
        {p.status_note && <p className="mt-2 text-[1rem] text-ink">{p.status_note}</p>}
        {p.summary && <p className="mt-3 max-w-3xl whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-muted">{p.summary}</p>}
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Time to date", fmtHours(t.hours)], ["Work to date", money(t.incGst, cur)], ["Not invoiced yet", money(notBilled.incGst, cur)], ["Owed now", money(owed, cur)]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-inset ring-line dark:bg-white/[0.03]"><dt className="text-[0.75rem] text-ink-muted">{k}</dt><dd className="text-[1.125rem] font-semibold tabular-nums text-ink">{v}</dd></div>
          ))}
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-6">
          <Panel title="Ask for something" subtitle="A change, a new task, a problem or a question. Every reply stays on it.">
            <div className="px-4 pb-5 sm:px-6"><ProjectRequestForm slug={slug} project={p.id} /></div>
          </Panel>

          <Panel title="Time log" subtitle={`${money(rate * 1.1, cur)} an hour inc GST`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[0.875rem]">
                <thead className="text-left text-[0.75rem] text-ink-faint"><tr><th className="px-4 py-2 font-medium sm:px-6">Date</th><th className="px-3 py-2 font-medium">Hours</th><th className="px-3 py-2 font-medium">Work</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {!entries.length && <tr><td colSpan={3} className="px-6 py-6 text-center text-ink-muted">No time logged yet.</td></tr>}
                  {entries.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink sm:px-6">{fmtDate(e.work_date)}</td>
                      <td className="px-3 py-2.5 font-medium tabular-nums text-ink">{billedHours(e, m)}</td>
                      <td className="px-3 py-2.5 text-ink">
                        {e.source === "meeting"
                          ? <><span className="font-medium">Meeting with {e.by_name}</span><ul className="mt-1 list-disc space-y-0.5 pl-4">{e.work.split("\n").filter((x) => x.trim()).map((x, k) => <li key={k}>{x.replace(/^[•\-*]\s*/, "")}</li>)}</ul></>
                          : <span className="whitespace-pre-line">{e.work}</span>}
                        {e.billed_invoice_id ? <span className="block text-[0.75rem] text-ink-muted">Invoiced</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
                {entries.length > 0 && <tfoot><tr className="border-t border-line-strong"><td className="px-4 py-2.5 font-semibold text-ink sm:px-6">Total</td><td className="px-3 py-2.5 font-semibold tabular-nums text-ink">{t.hours}</td><td className="px-3 py-2.5 font-semibold text-ink">{money(t.incGst, cur)} inc GST</td></tr></tfoot>}
              </table>
            </div>
          </Panel>

          {p.notes && <Panel title="Notes"><p className="whitespace-pre-line px-4 pb-5 text-[0.9375rem] leading-relaxed text-ink sm:px-6">{p.notes}</p></Panel>}
        </div>

        <div className="space-y-6">
          <Panel title="Invoices" subtitle={owed > 0.009 ? `${money(owed, cur)} to pay` : "All paid"}>
            <ul className="divide-y divide-line">
              {!I.length && <li className="px-6 py-5 text-center text-[0.875rem] text-ink-muted">No invoices yet.</li>}
              {I.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
                  <span className="min-w-0 flex-1"><span className="block font-medium text-ink">{i.number ?? "Invoice"}</span><span className="block text-[0.8125rem] text-ink-muted">{fmtDate(i.issue_date)} · {money(Number(i.total), cur)}</span></span>
                  {Number(i.balance) > 0.009
                    ? <a href={`/pay/${i.pay_token}`} className="inline-flex h-9 items-center gap-1 rounded-full bg-[var(--portal-brand)] px-4 text-[0.8125rem] font-semibold text-[color:var(--portal-brand-fg)]">Pay {money(Number(i.balance), cur)}<ArrowRight className="h-3.5 w-3.5" /></a>
                    : <Badge tone="green">Paid</Badge>}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Your requests">
            <ul className="divide-y divide-line">
              {!tickets.length && <li className="px-6 py-5 text-center text-[0.875rem] text-ink-muted">Nothing asked for yet.</li>}
              {tickets.map((x) => (
                <li key={x.id}><Link href={`${base}/support/${x.id}`} className="flex items-center gap-2 px-4 py-3 hover:bg-zinc-50 sm:px-6 dark:hover:bg-white/[0.03]">
                  <span className="min-w-0 flex-1 truncate text-ink">{x.subject.replace(`${p.name}: `, "")}</span>
                  <Badge tone={/resolved|closed/.test(x.status) ? "green" : "brand"}>{x.status === "waiting_customer" ? "Waiting on you" : x.status.replace(/_/g, " ")}</Badge><ChevronRight className="h-4 w-4 text-ink-faint" /></Link></li>
              ))}
            </ul>
          </Panel>

          {(p.phases.length > 0 || p.open_items.length > 0 || p.links.length > 0) && (
            <Panel title="Progress">
              <div className="space-y-5 px-4 pb-5 text-[0.875rem] sm:px-6">
                {p.phases.length > 0 && <ol className="space-y-2">{p.phases.map((x, i) => <li key={i} className="text-ink"><span className="font-medium">{i + 1}. {x.name}</span><span className="block text-[0.8125rem] text-ink-muted">{[x.dates, x.status].filter(Boolean).join(" · ")}</span></li>)}</ol>}
                {p.open_items.length > 0 && <div><p className="mb-1 font-semibold text-ink">Next steps</p><ul className="list-disc space-y-1 pl-4 text-ink">{p.open_items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                {p.links.length > 0 && <div><p className="mb-1 font-semibold text-ink">Links</p>{p.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener" className="flex items-center gap-1 font-medium text-[color:var(--portal-brand-ink)] hover:underline">{l.label}<ExternalLink className="h-3.5 w-3.5" /></a>)}</div>}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
