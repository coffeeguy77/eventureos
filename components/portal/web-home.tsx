import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDot, FileText, Globe, LifeBuoy, Receipt, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDate, money, relative } from "@/lib/format";
import { PLAN_LABEL, TICKET_STATUS, monthly, readChecklist, type PlanCategory, type TicketStatus } from "@/lib/nerdherd/core";
import { describeSchedule, type Unit } from "@/lib/recurring/core";

/**
 * The client portal home for a web agency's clients (Nerd Herd businesses): everything they have with the agency on
 * one screen — websites and what looks after them, open requests, maintenance done, money owing — and one tap to ask
 * for help or a quote.
 */
export interface WebHomeData {
  slug: string; business: string; name: string; currency: string; tz: string; quoteHref: string | null;
  sites: { id: string; domain: string; status: string; hosted: boolean; suspended: boolean; plans: PlanCategory[] }[];
  plans: { id: string; name: string; category: PlanCategory; total: number; every: number; unit: Unit; next_date: string; status: string; website: string | null }[];
  tickets: { id: string; number: number; subject: string; status: TicketStatus; kind: string; last_activity_at: string; resolved_at: string | null; checklist: unknown; website: string | null }[];
  invoices: { id: string; number: string | null; issue_date: string; due_date: string | null; total: number; balance: number; status: string; pay_token: string }[];
}

const tile = "rounded-[22px] bg-white p-5 ring-1 ring-[#E2DFEC]";
const statusText = (s: TicketStatus) => (s === "awaiting_payment" ? "Waiting for payment" : s === "waiting_customer" ? "Waiting on you" : s === "new" ? "Received" : TICKET_STATUS[s].label);

export function WebHome({ d }: { d: WebHomeData }) {
  const open = d.tickets.filter((t) => !["resolved", "closed"].includes(t.status));
  const waitingOnYou = open.filter((t) => t.status === "waiting_customer" || t.status === "awaiting_payment");
  const maint = d.tickets.filter((t) => t.kind === "maintenance" && t.status === "resolved").slice(0, 6);
  const owing = d.invoices.filter((i) => Number(i.balance) > 0.009 && i.status !== "void" && i.status !== "draft");
  const due = owing.reduce((a, i) => a + Number(i.balance), 0);
  const overdue = owing.filter((i) => i.due_date && i.due_date < new Date().toISOString().slice(0, 10));
  const live = d.plans.filter((p) => p.status === "active");
  const perMonth = live.reduce((a, p) => a + monthly(p.total, p.every, p.unit), 0);
  const covered = (c: PlanCategory) => d.plans.some((p) => p.category === c && p.status !== "ended");

  return (
    <div className="space-y-10 sm:space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[32px] bg-[#1A1530] px-6 shadow-[0_40px_80px_-40px_rgba(15,11,30,.6)] ring-1 ring-white/10 py-8 text-white sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 h-[380px] w-[380px] rounded-full bg-[var(--portal-brand)] opacity-30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <div>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[var(--portal-brand)]">{d.business} · your account</p>
            <h1 className="mt-3 break-words text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[3.75rem]">Hi {d.name}.</h1>
            <p className="mt-3 max-w-[520px] text-[1.0625rem] leading-relaxed text-white/75">
              {waitingOnYou.length ? `${waitingOnYou.length === 1 ? "One request is" : `${waitingOnYou.length} requests are`} waiting on you — see below.`
                : open.length ? `We're working on ${open.length === 1 ? "one request" : `${open.length} requests`} for you.`
                : "Everything's up to date. Need a change, a fix or something new? We're one tap away."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/p/${d.slug}/support`} className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--portal-brand)] px-6 font-semibold text-[color:var(--portal-brand-fg)] shadow-lg hover:brightness-105"><LifeBuoy className="h-5 w-5" />Ask for help</Link>
              {d.quoteHref && <a href={d.quoteHref} className="inline-flex h-12 items-center gap-2 rounded-full px-6 font-semibold text-white ring-1 ring-inset ring-white/30 hover:bg-white/10"><Sparkles className="h-5 w-5" />Get a quote for new work</a>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: "Websites", v: String(d.sites.filter((s) => s.status !== "archived").length), icon: Globe },
              { k: "Open requests", v: String(open.length), icon: CircleDot },
              { k: due > 0 ? "To pay" : "Nothing owing", v: money(due, d.currency, { cents: false }), icon: Receipt, alert: overdue.length > 0 },
              { k: "Care & hosting", v: live.length ? `${money(perMonth, d.currency, { cents: false })}/mo` : "—", icon: ShieldCheck },
            ].map((x) => (
              <div key={x.k} className="rounded-[20px] bg-white/[0.07] p-4 ring-1 ring-white/10">
                <x.icon className={`h-5 w-5 ${x.alert ? "text-rose-300" : "text-[var(--portal-brand)]"}`} />
                <p className="mt-2 text-[1.75rem] font-semibold leading-none">{x.v}</p>
                <p className={`mt-1 text-[0.8125rem] ${x.alert ? "text-rose-200" : "text-white/65"}`}>{x.k}{x.alert ? " · overdue" : ""}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Needs you */}
      {(waitingOnYou.length > 0 || overdue.length > 0) && (
        <section className="rounded-[24px] bg-amber-50 p-5 ring-1 ring-amber-200 sm:p-6">
          <h2 className="font-semibold text-amber-950">Waiting on you</h2>
          <ul className="mt-3 space-y-2">
            {overdue.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-amber-200">
                <span className="text-[0.9375rem]">Invoice {i.number} — {money(i.balance, d.currency)} was due {fmtDate(i.due_date)}</span>
                <a href={`/pay/${i.pay_token}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--portal-brand)] px-5 text-[0.875rem] font-semibold text-[color:var(--portal-brand-fg)]">Pay now<ArrowRight className="h-4 w-4" /></a>
              </li>
            ))}
            {waitingOnYou.map((t) => (
              <li key={t.id}><Link href={`/p/${d.slug}/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-amber-200 hover:ring-amber-400">
                <span className="text-[0.9375rem]">{t.subject}{t.status === "awaiting_payment" ? " — we'll start as soon as the invoice is paid" : " — we've asked you something"}</span>
                <ArrowRight className="h-4 w-4 text-amber-700" /></Link></li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Requests */}
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-[2rem] font-semibold leading-tight">Your requests</h2>
            <Link href={`/p/${d.slug}/support`} className="inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold text-[var(--portal-brand-ink)] hover:underline">New request<ArrowRight className="h-4 w-4" /></Link>
          </div>
          {open.length ? (
            <ul className="space-y-3">
              {open.map((t) => {
                const cl = readChecklist(t.checklist);
                const doneN = cl.filter((x) => x.done).length;
                const steps: TicketStatus[] = ["new", "open", "in_progress", "resolved"];
                const at = t.status === "resolved" ? 3 : t.status === "in_progress" || t.status === "scheduled" ? 2 : t.status === "open" ? 1 : 0;
                return (
                  <li key={t.id}>
                    <Link href={`/p/${d.slug}/support/${t.id}`} className={`${tile} portal-lift group block`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{t.subject}</p>
                          <p className="mt-0.5 text-[0.8125rem] text-[#575270]">#{t.number}{t.website ? ` · ${t.website}` : ""} · {t.kind === "maintenance" ? "Scheduled maintenance" : "Request"} · updated {relative(t.last_activity_at)}</p>
                        </div>
                        <Badge tone={TICKET_STATUS[t.status].tone}>{statusText(t.status)}</Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Progress">
                        {steps.map((s, k) => <span key={s} className={`h-1.5 rounded-full ${k <= at ? "bg-[var(--portal-brand)]" : "bg-[#E2DFEC]"}`} />)}
                      </div>
                      <p className="mt-1.5 flex justify-between text-[0.6875rem] uppercase tracking-wide text-[#8A86A0]"><span>Received</span><span>Ready</span><span>Working on it</span><span>Done</span></p>
                      {cl.length > 0 && t.status !== "awaiting_payment" && <p className="mt-2 text-[0.8125rem] text-[#575270]">{doneN} of {cl.length} maintenance checks done</p>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-[24px] border-2 border-dashed border-[#DCD8E8] bg-white/60 px-6 py-10 text-center">
              <p className="font-semibold">No open requests</p>
              <p className="mt-1 text-[0.9375rem] text-[#575270]">Need a change to your site, an email fixed or something new built?</p>
              <Link href={`/p/${d.slug}/support`} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--portal-brand)] px-5 font-semibold text-[color:var(--portal-brand-fg)]"><LifeBuoy className="h-4 w-4" />Ask for help</Link>
            </div>
          )}

          {maint.length > 0 && (
            <div className="mt-8">
              <h3 className="text-[1.5rem] font-semibold">Maintenance we've done</h3>
              <ul className="mt-3 divide-y divide-[#E2DFEC] rounded-[22px] bg-white ring-1 ring-[#E2DFEC]">
                {maint.map((t) => {
                  const cl = readChecklist(t.checklist);
                  return (
                    <li key={t.id}><Link href={`/p/${d.slug}/support/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-[#F5F4FA]">
                      <span className="flex min-w-0 items-center gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /><span className="min-w-0"><span className="block truncate font-medium">{t.website ?? t.subject}</span><span className="block text-[0.8125rem] text-[#575270]">{cl.length ? `${cl.filter((x) => x.done).length} checks` : "Maintenance check"}{t.resolved_at ? ` · ${fmtDate(t.resolved_at)}` : ""}</span></span></span>
                      <ArrowRight className="h-4 w-4 text-[#B4B0C6]" /></Link></li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* Sites, plans, money */}
        <aside className="space-y-6">
          <section>
            <h2 className="text-[1.5rem] font-semibold">Your websites</h2>
            {d.sites.length ? (
              <ul className="mt-3 space-y-3">
                {d.sites.filter((s) => s.status !== "archived").map((s) => (
                  <li key={s.id} className={tile}>
                    <div className="flex items-start justify-between gap-3">
                      <a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 font-semibold hover:underline"><Globe className="h-4 w-4 shrink-0 text-[var(--portal-brand)]" /><span className="truncate">{s.domain}</span></a>
                      {s.suspended ? <Badge tone="red">Suspended</Badge> : <Badge tone={s.status === "live" ? "green" : "brand"}>{s.status === "live" ? "Live" : s.status === "building" ? "Being built" : s.status}</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(["hosting", "maintenance", "adwords"] as PlanCategory[]).map((c) => (
                        <span key={c} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-medium ${s.plans.includes(c) || (c === "hosting" && s.hosted) ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200" : "bg-[#F0EEF6] text-[#8A86A0]"}`}>
                          {s.plans.includes(c) || (c === "hosting" && s.hosted) ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}{PLAN_LABEL[c]}
                        </span>
                      ))}
                    </div>
                    {s.suspended && <p className="mt-2 text-[0.8125rem] text-rose-700">This site is switched off for an unpaid hosting invoice — it comes back on automatically once it's paid.</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-[0.9375rem] text-[#575270]">No websites on your account yet.</p>}
            {!covered("maintenance") && d.sites.length > 0 && (
              <Link href={`/p/${d.slug}/support`} className="mt-3 flex items-center gap-3 rounded-[22px] bg-[var(--portal-brand-soft)] p-4 text-[var(--portal-brand-ink)]">
                <Wrench className="h-5 w-5 shrink-0" /><span className="text-[0.875rem]"><strong>Keep your site safe.</strong> Regular maintenance keeps WordPress, plugins and security up to date. Ask us about a care plan.</span>
              </Link>
            )}
          </section>

          {d.plans.length > 0 && (
            <section>
              <h2 className="text-[1.5rem] font-semibold">Plans & subscriptions</h2>
              <ul className="mt-3 divide-y divide-[#E2DFEC] rounded-[22px] bg-white ring-1 ring-[#E2DFEC]">
                {d.plans.filter((p) => p.status !== "ended").map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0"><span className="block truncate font-medium">{PLAN_LABEL[p.category]}{p.website ? ` · ${p.website}` : ""}</span><span className="block text-[0.8125rem] text-[#575270]">{money(p.total, d.currency)} {describeSchedule(p.every, p.unit).toLowerCase()}{p.status === "active" ? ` · next ${fmtDate(p.next_date)}` : ""}</span></span>
                    {p.status !== "active" && <Badge tone="neutral">Not billing</Badge>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-[1.5rem] font-semibold">Invoices</h2>
              <Link href={`/p/${d.slug}/payments`} className="text-[0.875rem] font-semibold text-[var(--portal-brand-ink)] hover:underline">All invoices & receipts</Link>
            </div>
            {owing.length ? (
              <ul className="mt-3 divide-y divide-[#E2DFEC] rounded-[22px] bg-white ring-1 ring-[#E2DFEC]">
                {owing.slice(0, 6).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0"><span className="block font-medium">{i.number}</span><span className={`block text-[0.8125rem] ${i.due_date && i.due_date < new Date().toISOString().slice(0, 10) ? "text-rose-700" : "text-[#575270]"}`}>{money(i.balance, d.currency)} · due {fmtDate(i.due_date)}</span></span>
                    <a href={`/pay/${i.pay_token}`} className="inline-flex h-9 items-center rounded-full bg-[var(--portal-brand)] px-4 text-[0.8125rem] font-semibold text-[color:var(--portal-brand-fg)]">Pay</a>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 flex items-center gap-2 text-[0.9375rem] text-[#575270]"><CheckCircle2 className="h-4 w-4 text-emerald-600" />All paid — thank you.</p>}
          </section>

          {d.quoteHref && (
            <a href={d.quoteHref} className="flex items-center gap-4 rounded-[22px] bg-white p-5 ring-1 ring-[#E2DFEC] portal-lift">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--portal-brand-soft)] text-[var(--portal-brand-ink)]"><FileText className="h-[22px] w-[22px]" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">Planning something new?</span><span className="block text-[0.875rem] text-[#575270]">A new site, an app, Google Ads, SEO — get a quote.</span></span>
              <ArrowRight className="h-5 w-5 text-[#B4B0C6]" />
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}
