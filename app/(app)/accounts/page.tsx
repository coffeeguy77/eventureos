import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDate, fmtDateTime, money, relative, todayISO } from "@/lib/format";
import { SyncNowButton } from "@/app/(app)/settings/integrations/controls";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { bucket, callNext, daysBetween } from "@/lib/accounts/core";
import { lastAttempts } from "@/lib/accounts/phones";
import { cleanStored } from "@/lib/phone-format";
import { loadOwing } from "@/lib/accounts/server";
import { cn } from "@/lib/cn";
import { HostingPills, hostingByClient } from "@/components/hosting/pills";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "next", label: "Call next" }, { key: "broken", label: "Broken promises" }, { key: "not_contacted", label: "Not contacted" },
  { key: "today", label: "Contacted today" }, { key: "overdue", label: "Overdue" }, { key: "steps", label: "Next steps due" }, { key: "promises", label: "Promised" },
  { key: "disputes", label: "Disputed" }, { key: "flagged", label: "Flagged" }, { key: "all", label: "All owing" },
] as const;

/** Who owes money (EventureOS and Xero invoices), how overdue, what was last said and what happens next. */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string; h?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const view = VIEWS.find((x) => x.key === sp.v)?.key ?? "next";
  const today = todayISO(org.timezone);
  const { data: xero } = await supabase.from("integrations").select("status, last_sync_at, last_sync_status, last_error").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle();
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const [owing, { data: notes }, { data: emails }, { data: pays }, issuesR] = await Promise.all([
    loadOwing(supabase, org.id),
    supabase.from("collection_notes").select("id, customer_id, kind, body, promise_date, promise_amount, remind, reminded_at, next_step, next_step_due, done_at, created_at").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(5000),
    supabase.from("collection_emails").select("customer_id, sent_at, opened_at, clicked_at").eq("organisation_id", org.id).order("sent_at", { ascending: false }).limit(5000),
    supabase.from("payments").select("paid_at, invoice:invoices!inner(customer_id)").eq("organisation_id", org.id).gte("paid_at", since).order("paid_at", { ascending: false }).limit(5000),
    supabase.from("account_issues").select("customer_id, status").eq("organisation_id", org.id).in("status", ["open", "investigating", "write_off"]).limit(2000),
  ]);
  // Flagged in the resolution centre (open, being looked into, or to be written off): off the chasing list until decided
  const flaggedIds = new Set(((issuesR.error ? [] : issuesR.data) ?? []).map((x) => (x as { customer_id: string }).customer_id));
  const lastPaid = new Map<string, string>();
  for (const p of (pays ?? []) as unknown as { paid_at: string; invoice: { customer_id: string } | null }[]) {
    const c = p.invoice?.customer_id;
    if (c && !lastPaid.has(c)) lastPaid.set(c, p.paid_at);
  }
  type Note = { id: string; customer_id: string; kind: string; body: string | null; promise_date: string | null; promise_amount: number | null; remind: boolean; reminded_at: string | null; next_step: string | null; next_step_due: string | null; done_at: string | null; created_at: string };
  const N = (notes ?? []) as Note[];
  const E = (emails ?? []) as { customer_id: string; sent_at: string; opened_at: string | null; clicked_at: string | null }[];

  const byCust = new Map<string, { id: string; name: string; phone: string | null; invoices: number; owing: number; overdue: number; oldestDays: number }>();
  const ageing = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<string, number>;
  for (const i of owing) {
    ageing[bucket(i.due_date, today)] += i.balance;
    const c = byCust.get(i.customer_id) ?? { id: i.customer_id, name: i.customer?.name ?? "Client", phone: i.customer?.phone ?? null, invoices: 0, owing: 0, overdue: 0, oldestDays: 0 };
    c.invoices++; c.owing += i.balance;
    if (i.due_date && i.due_date < today) { c.overdue += i.balance; c.oldestDays = Math.max(c.oldestDays, daysBetween(i.due_date, today)); }
    byCust.set(i.customer_id, c);
  }
  const step = (cid: string) => N.find((n) => n.customer_id === cid && n.next_step && !n.done_at) ?? null;
  const promise = (cid: string) => N.find((n) => n.customer_id === cid && n.kind === "promise" && n.promise_date && n.promise_date >= addDays(today, -7)) ?? null;
  const disputed = (cid: string) => { const last = N.find((n) => n.customer_id === cid && ["dispute", "plan", "promise", "call", "note"].includes(n.kind)); return last?.kind === "dispute"; };
  const lastTouch = (cid: string) => [N.find((n) => n.customer_id === cid && n.body !== "Opened their account statement")?.created_at, E.find((e) => e.customer_id === cid)?.sent_at].filter(Boolean).sort().pop() ?? null;
  /** The last promise date that has passed with no payment since (and the money's still overdue) */
  const brokenPromise = (cid: string) => {
    const p = N.find((n) => n.customer_id === cid && n.kind === "promise" && n.promise_date);
    if (!p?.promise_date || p.promise_date >= today) return null;
    const paid = lastPaid.get(cid);
    return paid && paid.slice(0, 10) >= p.promise_date ? null : p.promise_date;
  };
  const stepDue = (cid: string) => { const s = step(cid); return !!s && (!s.next_step_due || s.next_step_due <= today); };
  // contacted today in the business's own time zone
  const touchedToday = (cid: string) => { const t = lastTouch(cid); return !!t && new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date(t)) >= today; };

  const hostingPills = await hostingByClient(supabase, org.id, [...byCust.keys()]);
  let rows = [...byCust.values()];
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~"));
  // Hosting clients only (Web Culture): those with a hosting account
  const hostingOnly = sp.h === "1";
  if (hostingOnly) rows = rows.filter((r) => hostingPills.has(r.id));
  if (view === "next") rows = callNext(rows.map((r) => ({ ...r, lastTouch: touchedToday(r.id) ? `${today}T12:00:00Z` : lastTouch(r.id), brokenPromise: brokenPromise(r.id), stepDue: stepDue(r.id), flagged: flaggedIds.has(r.id) })), today);
  if (view === "broken") rows = rows.filter((r) => r.overdue > 0 && !!brokenPromise(r.id));
  if (view === "not_contacted") rows = rows.filter((r) => r.overdue > 0 && !lastTouch(r.id));
  if (view === "today") rows = rows.filter((r) => touchedToday(r.id));
  if (view === "flagged") rows = rows.filter((r) => flaggedIds.has(r.id));
  if (view === "overdue") rows = rows.filter((r) => r.overdue > 0);
  if (view === "steps") rows = rows.filter((r) => { const s = step(r.id); return !!s && (!s.next_step_due || s.next_step_due <= today); });
  if (view === "promises") rows = rows.filter((r) => !!promise(r.id));
  if (view === "disputes") rows = rows.filter((r) => disputed(r.id));
  if (view !== "next") rows.sort((a, b) => b.overdue - a.overdue || b.owing - a.owing);
  const counts = {
    next: callNext([...byCust.values()].map((r) => ({ ...r, lastTouch: touchedToday(r.id) ? `${today}T12:00:00Z` : lastTouch(r.id), brokenPromise: brokenPromise(r.id), stepDue: stepDue(r.id), flagged: flaggedIds.has(r.id) })), today).length,
    broken: [...byCust.values()].filter((r) => r.overdue > 0 && !!brokenPromise(r.id)).length,
    not_contacted: [...byCust.values()].filter((r) => r.overdue > 0 && !lastTouch(r.id)).length,
    today: [...byCust.keys()].filter(touchedToday).length,
    flagged: [...byCust.keys()].filter((id) => flaggedIds.has(id)).length,
  } as Record<string, number>;

  const total = owing.reduce((a, i) => a + i.balance, 0);
  const overdue = total - ageing.current;
  const promisedThisWeek = N.filter((n) => n.kind === "promise" && n.promise_date && n.promise_date >= today && n.promise_date <= addDays(today, 7));
  const stepsDue = [...byCust.keys()].filter((cid) => { const s = step(cid); return !!s && (!s.next_step_due || s.next_step_due <= today); }).length;
  const cur = org.currency;

  return (
    <>
      <PageHeader eyebrow="Accounts" title="Money owing" subtitle="Every unpaid invoice — from EventureOS and from Xero — by customer, with the last conversation and the next step." />
      {xero && ["connected", "syncing", "error"].includes(String(xero.status)) && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
          <p className="min-w-0 flex-1 text-[0.8125rem] text-ink-muted">
            <span className="font-medium text-ink">Xero</span> last checked {xero.last_sync_at ? <><strong className="text-ink">{relative(xero.last_sync_at)}</strong> ({fmtDateTime(xero.last_sync_at, org.timezone)})</> : "never"}{xero.last_sync_status === "error" && xero.last_error ? <span className="text-rose-700"> · last check failed: {String(xero.last_error).slice(0, 120)}</span> : null}.
            <span className="block text-[0.75rem] text-ink-faint">Payments show here once they're entered or reconciled in Xero — a bank deposit that isn't reconciled yet won't show.</span>
          </p>
          <SyncNowButton provider="xero" label="Check Xero now" />
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Owing" value={money(total, cur, { cents: false })} sub={`${owing.length} invoice${owing.length === 1 ? "" : "s"} · ${byCust.size} customer${byCust.size === 1 ? "" : "s"}`} />
        <Tile label="Overdue" value={money(overdue, cur, { cents: false })} tone={overdue > 0 ? "red" : undefined} sub={`90+ days: ${money(ageing["90+"], cur, { cents: false })}`} />
        <Tile label="Promised this week" value={money(promisedThisWeek.reduce((a, n) => a + Number(n.promise_amount ?? 0), 0), cur, { cents: false })} sub={`${promisedThisWeek.length} promise${promisedThisWeek.length === 1 ? "" : "s"}`} />
        <Tile label="Next steps due" value={String(stepsDue)} tone={stepsDue ? "red" : undefined} sub="today or overdue" />
      </div>
      <Card className="mt-4 p-4">
        <p className="mb-2 text-[0.75rem] font-medium text-ink-muted">How old the money is</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100">
          {(["current", "1-30", "31-60", "61-90", "90+"] as const).map((k, i) => total > 0 && ageing[k] > 0 ? <span key={k} title={`${k}: ${money(ageing[k], cur)}`} style={{ width: `${(ageing[k] / total) * 100}%` }} className={["bg-emerald-400", "bg-amber-300", "bg-amber-500", "bg-rose-400", "bg-rose-600"][i]} /> : null)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted">
          {(["current", "1-30", "31-60", "61-90", "90+"] as const).map((k) => <span key={k}>{k === "current" ? "Not due yet" : `${k} days`}: <strong className="text-ink">{money(ageing[k], cur, { cents: false })}</strong></span>)}
        </div>
      </Card>
      <div className="no-scrollbar mb-3 mt-5 flex items-center gap-1.5 overflow-x-auto">
        {VIEWS.map((x) => <Link key={x.key} href={`/accounts?v=${x.key}${hostingOnly ? "&h=1" : ""}`} className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[0.7812rem] font-medium", view === x.key ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{x.label}{x.key in counts ? <span className={cn("ml-1.5 tabular-nums", view === x.key ? "opacity-70" : x.key === "broken" && counts[x.key] ? "font-semibold text-rose-700" : "text-ink-faint")}>{counts[x.key]}</span> : null}</Link>)}
        {hostingPills.size > 0 && <Link href={`/accounts?v=${view}${hostingOnly ? "" : "&h=1"}`} className={cn("ml-2 shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[0.7812rem] font-medium ring-1", hostingOnly ? "bg-emerald-600 text-white ring-emerald-600" : "bg-surface text-ink-muted ring-line hover:text-ink")}>{hostingOnly ? "✓ " : ""}Hosting clients</Link>}
        <form action="/accounts" className="ml-auto"><input type="hidden" name="v" value={view} />{hostingOnly && <input type="hidden" name="h" value="1" />}<input name="q" defaultValue={sp.q ?? ""} placeholder="Find a customer or number" aria-label="Find a customer or phone number" className="h-8 w-44 rounded-full border border-line-strong bg-surface px-3 text-[0.7812rem] outline-none focus:border-brand-500" /></form>
      </div>
      <Card>
        {view === "next" && rows.length > 0 && <p className="border-b border-line px-5 py-2.5 text-[0.75rem] text-ink-muted">Overdue customers you haven&apos;t contacted today, in order: broken promises, next steps due, never contacted, then the longest since you last spoke. Log a call or send an email and they drop off until tomorrow. Flagged accounts wait in the resolution centre.</p>}
        {!rows.length ? <EmptyState title={view === "next" ? "Everyone's been contacted today" : view === "overdue" ? "Nothing overdue" : "Nothing here"}>{view === "next" ? "Nice work — every overdue customer has been called, emailed or noted today (or is flagged)." : view === "overdue" ? "Every invoice is paid or not due yet." : "Try another view."}</EmptyState> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const s = step(r.id), p = promise(r.id), touched = lastTouch(r.id), broke = brokenPromise(r.id);
              const late = s?.next_step_due && s.next_step_due < today;
              return (
                <li key={r.id}>
                  <Link href={`/accounts/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-zinc-50">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-[0.875rem] font-semibold text-ink">{r.name}{disputed(r.id) && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-800">Disputed</span>}{broke && r.overdue > 0 && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[0.6875rem] font-medium text-rose-800">Missed promise · {fmtDate(broke, "short")}</span>}{flaggedIds.has(r.id) && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[0.6875rem] font-medium text-violet-800">Flagged</span>}{touchedToday(r.id) && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6875rem] font-medium text-emerald-800">Contacted today</span>}</p>
                      {hostingPills.has(r.id) && <div className="mt-1"><HostingPills list={hostingPills.get(r.id)} link={false} /></div>}
                      <p className="text-[0.75rem] text-ink-faint">{r.invoices} invoice{r.invoices === 1 ? "" : "s"}{r.oldestDays ? ` · oldest ${r.oldestDays} days overdue` : ""} · {touched ? `last contact ${relative(touched)}` : <span className="text-amber-700">not contacted yet</span>}</p>
                      {s && <p className={cn("mt-0.5 truncate text-[0.75rem]", late ? "font-medium text-rose-700" : "text-ink-muted")}>Next: {s.next_step}{s.next_step_due ? ` · ${late ? "was due" : "due"} ${fmtDate(s.next_step_due, "short")}` : ""}</p>}
                      {(() => { const a = lastAttempts(N.filter((n) => n.customer_id === r.id))[0]; return a ? <p className="mt-0.5 text-[0.75rem] text-ink-muted">Last try: <span className="font-semibold text-ink">{a.code}</span>{a.number ? ` on ${a.number}` : ""} · {relative(a.at)}</p> : null; })()}
                      {p && <p className="mt-0.5 text-[0.75rem] text-emerald-700">Promised {p.promise_amount ? money(Number(p.promise_amount), cur) : "payment"} on {fmtDate(p.promise_date, "short")}{p.remind && !p.reminded_at ? " · invoice emails that morning" : p.reminded_at ? " · reminder sent" : ""}</p>}
                    </div>
                    {r.phone ? <span className="flex items-center gap-1 text-[0.75rem] tabular-nums text-ink-muted"><Phone className="h-3.5 w-3.5" />{cleanStored(r.phone)[0] ?? r.phone}</span> : <span className="text-[0.75rem] text-ink-faint">no number</span>}
                    <div className="text-right">
                      <p className="text-[1rem] font-semibold tabular-nums text-ink">{money(r.owing, cur)}</p>
                      {r.overdue > 0 && <p className="text-[0.75rem] font-medium tabular-nums text-rose-700">{money(r.overdue, cur)} overdue</p>}
                    </div>
                    <ChevronRight className="h-4 w-4 text-ink-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "red" }) {
  return (
    <Card className="p-4">
      <p className="text-[0.75rem] font-medium text-ink-muted">{label}</p>
      <p className={cn("mt-1 text-[1.5rem] font-semibold tabular-nums leading-tight", tone === "red" ? "text-rose-700" : "text-ink")}>{value}</p>
      <p className="mt-0.5 truncate text-[0.75rem] text-ink-muted">{sub}</p>
    </Card>
  );
}
