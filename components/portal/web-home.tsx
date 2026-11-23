import Link from "next/link";
import {
  AlertTriangle, ArrowRight, BarChart3, ChevronRight, CheckCircle2, CircleDot, Clock, FileText, Globe, LifeBuoy, ListChecks, Megaphone, PackageCheck, Receipt,
  RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDate, money, relative } from "@/lib/format";
import { PLAN_LABEL, TICKET_STATUS, monthly, readChecklist, type PlanCategory, type TicketStatus } from "@/lib/nerdherd/core";
import { fmtHours, type HomeTile, type PortalPrefs } from "@/lib/nerdherd/care";
import type { LatestVersions, UsageRow } from "@/lib/nerdherd/care-server";
import { describeSchedule, type Unit } from "@/lib/recurring/core";
import { AdsAddOn } from "./care-forms";

/**
 * The client portal home for a web agency's clients (Nerd Herd businesses): everything they have with the agency on
 * one screen — websites and what needs updating, prepaid hours, requests, Google Ads, plans and money owing — laid out
 * the way the client chose (Customise), with one tap to request tasks, lodge a job or report a problem.
 */
export interface SiteCare {
  wp: string | null; wpUpdate: string | null; wc: string | null; php: string | null; checkedAt: string | null; plugins: number;
  pending: { name: string; from: string; to: string; kind: "plugin" | "theme" }[]; behindWp: boolean; behindWc: boolean;
}
export interface WebHomeData {
  slug: string; business: string; name: string; currency: string; tz: string; quoteHref: string | null;
  sites: { id: string; domain: string; status: string; hosted: boolean; suspended: boolean; plans: PlanCategory[]; care: SiteCare | null }[];
  plans: { id: string; name: string; category: PlanCategory; total: number; every: number; unit: Unit; next_date: string; status: string; website: string | null }[];
  tickets: { id: string; number: number; subject: string; status: TicketStatus; kind: string; last_activity_at: string; resolved_at: string | null; checklist: unknown; website: string | null }[];
  invoices: { id: string; number: string | null; issue_date: string; due_date: string | null; total: number; balance: number; status: string; pay_token: string }[];
  customerId: string; customers: string[];
  /** Ongoing projects (Nerd Herd → Projects) shown to this client */
  projects?: { id: string; name: string; status: string; note: string | null; hours: number }[];
  care: {
    block: { leftMin: number; boughtMin: number; usedMin: number; pendingMin: number; unpaid: { hours: number; number: string | null; payToken: string }[]; recent: UsageRow[] } | null;
    packs: { hours: number; discountPct: number; exGst: number; incGst: number; saved: number }[];
    minHours: number;
  } | null;
  versions: LatestVersions;
  ads: { feeExGst: number | null; rate: number; hasPlan: boolean; accounts: { id: string; name: string; report: { token: string; month: string } | null }[] };
  prefs: PortalPrefs;
}

const tile = "rounded-[22px] bg-white p-5 ring-1 ring-[#E2DFEC]";
const statusText = (s: TicketStatus) => (s === "awaiting_payment" ? "Waiting for payment" : s === "waiting_customer" ? "Waiting on you" : s === "new" ? "Received" : TICKET_STATUS[s].label);
const WIDE: HomeTile[] = ["requests", "sites"];

export function WebHome({ d }: { d: WebHomeData }) {
  const open = d.tickets.filter((t) => !["resolved", "closed"].includes(t.status));
  const waitingOnYou = open.filter((t) => t.status === "waiting_customer" || t.status === "awaiting_payment");
  const owing = d.invoices.filter((i) => Number(i.balance) > 0.009 && i.status !== "void" && i.status !== "draft");
  const due = owing.reduce((a, i) => a + Number(i.balance), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = owing.filter((i) => i.due_date && i.due_date < today);
  const live = d.plans.filter((p) => p.status === "active");
  const perMonth = live.reduce((a, p) => a + monthly(p.total, p.every, p.unit), 0);
  const updatesWaiting = d.sites.reduce((a, s) => a + (s.care?.pending.length ?? 0) + (s.care?.wpUpdate ? 1 : 0), 0);
  const left = d.care?.block?.leftMin ?? null;
  const base = `/p/${d.slug}`;

  const tiles: Record<HomeTile, React.ReactNode> = {
    requests: <Requests d={d} open={open} />,
    block: d.care ? <Block d={d} /> : null,
    sites: <Sites d={d} />,
    versions: <Versions v={d.versions} />,
    ads: <Ads d={d} />,
    plans: d.plans.length ? <Plans d={d} /> : null,
    invoices: <Invoices d={d} owing={owing} />,
  };
  const shown = d.prefs.order.filter((k) => !d.prefs.hidden.includes(k) && tiles[k]);

  return (
    <div className="space-y-10 sm:space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[32px] bg-[#1A1530] px-6 py-8 text-white shadow-[0_40px_80px_-40px_rgba(15,11,30,.6)] ring-1 ring-white/10 sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 h-[380px] w-[380px] rounded-full bg-[var(--portal-brand)] opacity-30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <div>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[var(--portal-brand)]">{d.business} · your account</p>
            <h1 className="mt-3 break-words text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[3.75rem]">Hi {d.name}.</h1>
            <p className="mt-3 max-w-[520px] text-[1.0625rem] leading-relaxed text-white/75">
              {waitingOnYou.length ? `${waitingOnYou.length === 1 ? "One request is" : `${waitingOnYou.length} requests are`} waiting on you — see below.`
                : open.length ? `We're working on ${open.length === 1 ? "one request" : `${open.length} requests`} for you.`
                : updatesWaiting ? `Your sites have ${updatesWaiting} update${updatesWaiting === 1 ? "" : "s"} waiting. Ask us to run them, or let your care plan take care of it.`
                : "Everything's up to date. Need a change, a fix or something new? We're one tap away."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {d.care && <Link href={`${base}/care/new?type=tasks`} className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--portal-brand)] px-5 font-semibold text-[color:var(--portal-brand-fg)] shadow-lg hover:brightness-105"><ListChecks className="h-5 w-5" />Request tasks</Link>}
              <Link href={`${base}/care/new?type=job`} className={`inline-flex h-12 items-center gap-2 rounded-full px-5 font-semibold ${d.care ? "text-white ring-1 ring-inset ring-white/30 hover:bg-white/10" : "bg-[var(--portal-brand)] text-[color:var(--portal-brand-fg)]"}`}><Sparkles className="h-5 w-5" />Lodge a job</Link>
              <Link href={`${base}/care/new?type=problem`} className="inline-flex h-12 items-center gap-2 rounded-full px-5 font-semibold text-white ring-1 ring-inset ring-white/30 hover:bg-white/10"><AlertTriangle className="h-5 w-5" />Report a problem</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              left !== null ? { k: left < 0 ? "Hours over" : "Prepaid hours left", v: fmtHours(left).replace(" over", ""), icon: Clock, alert: left < 0, href: `${base}/care/hours` }
                : { k: "Websites", v: String(d.sites.filter((s) => s.status !== "archived").length), icon: Globe },
              { k: "Open requests", v: String(open.length), icon: CircleDot },
              { k: due > 0 ? "To pay" : "Nothing owing", v: money(due, d.currency, { cents: false }), icon: Receipt, alert: overdue.length > 0, href: `${base}/payments` },
              { k: "Care & hosting", v: live.length ? `${money(perMonth, d.currency, { cents: false })}/mo` : "—", icon: ShieldCheck },
            ].map((x) => {
              const inner = (<>
                <x.icon className={`h-5 w-5 ${x.alert ? "text-rose-300" : "text-[var(--portal-brand)]"}`} />
                <p className="mt-2 text-[1.75rem] font-semibold leading-none">{x.v}</p>
                <p className={`mt-1 text-[0.8125rem] ${x.alert ? "text-rose-200" : "text-white/65"}`}>{x.k}{x.alert && x.k === "To pay" ? " · overdue" : ""}</p>
              </>);
              return "href" in x && x.href
                ? <Link key={x.k} href={x.href} className="rounded-[20px] bg-white/[0.07] p-4 ring-1 ring-white/10 hover:bg-white/[0.11]">{inner}</Link>
                : <div key={x.k} className="rounded-[20px] bg-white/[0.07] p-4 ring-1 ring-white/10">{inner}</div>;
            })}
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
              <li key={t.id}><Link href={`${base}/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-amber-200 hover:ring-amber-400">
                <span className="text-[0.9375rem]">{t.subject}{t.status === "awaiting_payment" ? " — we'll start as soon as the invoice is paid" : " — we've asked you something"}</span>
                <ArrowRight className="h-4 w-4 text-amber-700" /></Link></li>
            ))}
          </ul>
        </section>
      )}

      {!!d.projects?.length && (
        <section>
          <h2 className="mb-3 text-[1.25rem] font-semibold text-ink">Your projects</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {d.projects.map((p) => (
              <Link key={p.id} href={`${base}/projects/${p.id}`} className="group rounded-[24px] bg-surface p-5 ring-1 ring-line transition hover:ring-[color:var(--portal-brand)]">
                <p className="flex flex-wrap items-center gap-2 text-[1.0625rem] font-semibold text-ink">{p.name}<span className="rounded-full bg-[var(--portal-brand)]/10 px-2 py-0.5 text-[0.75rem] font-semibold text-[color:var(--portal-brand-ink)]">{p.status}</span></p>
                {p.note && <p className="mt-1 text-[0.875rem] text-ink-muted">{p.note}</p>}
                <p className="mt-3 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[color:var(--portal-brand-ink)]">Progress, time, requests & invoices<ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div>
        <div className="mb-3 flex justify-end">
          <Link href={`${base}/care/customise`} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold text-[#575270] ring-1 ring-inset ring-[#E2DFEC] hover:bg-white"><SlidersHorizontal className="h-4 w-4" />Customise this page</Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {shown.map((k) => <div key={k} className={WIDE.includes(k) ? "lg:col-span-2" : ""}>{tiles[k]}</div>)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tiles */

function Head({ title, href, link, icon: Icon }: { title: string; href?: string; link?: string; icon?: typeof Globe }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[1.5rem] font-semibold leading-tight sm:text-[1.75rem]">{Icon && <Icon className="h-6 w-6 text-[var(--portal-brand)]" />}{title}</h2>
      {href && link && <Link href={href} className="inline-flex shrink-0 items-center gap-1.5 text-[0.9375rem] font-semibold text-[var(--portal-brand-ink)] hover:underline">{link}<ArrowRight className="h-4 w-4" /></Link>}
    </div>
  );
}

function Requests({ d, open }: { d: WebHomeData; open: WebHomeData["tickets"] }) {
  const maint = d.tickets.filter((t) => t.kind === "maintenance" && t.status === "resolved").slice(0, 6);
  return (
    <section>
      <Head title="Your requests" href={`/p/${d.slug}/support`} link="All requests & messages" />
      {open.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {open.map((t) => {
            const cl = readChecklist(t.checklist);
            const doneN = cl.filter((x) => x.done).length;
            const steps: TicketStatus[] = ["new", "open", "in_progress", "resolved"];
            const at = t.status === "in_progress" || t.status === "scheduled" ? 2 : t.status === "open" ? 1 : 0;
            return (
              <li key={t.id}>
                <Link href={`/p/${d.slug}/support/${t.id}`} className={`${tile} portal-lift group block h-full`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{t.subject}</p>
                      <p className="mt-0.5 text-[0.8125rem] text-[#575270]">#{t.number}{t.website ? ` · ${t.website}` : ""} · updated {relative(t.last_activity_at)}</p>
                    </div>
                    <Badge tone={TICKET_STATUS[t.status].tone}>{statusText(t.status)}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Progress">
                    {steps.map((s, k) => <span key={s} className={`h-1.5 rounded-full ${k <= at ? "bg-[var(--portal-brand)]" : "bg-[#E2DFEC]"}`} />)}
                  </div>
                  <p className="mt-1.5 flex justify-between text-[0.6875rem] uppercase tracking-wide text-[#8A86A0]"><span>Received</span><span>Ready</span><span>Working on it</span><span>Done</span></p>
                  {cl.length > 0 && t.status !== "awaiting_payment" && <p className="mt-2 text-[0.8125rem] text-[#575270]">{doneN} of {cl.length} {t.kind === "maintenance" ? "maintenance checks" : "tasks"} done</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-[24px] border-2 border-dashed border-[#DCD8E8] bg-white/60 px-6 py-10 text-center">
          <p className="font-semibold">No open requests</p>
          <p className="mt-1 text-[0.9375rem] text-[#575270]">Need a change to your site, an email fixed or something new built?</p>
          <Link href={`/p/${d.slug}/care/new?type=${d.care ? "tasks" : "job"}`} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--portal-brand)] px-5 font-semibold text-[color:var(--portal-brand-fg)]"><LifeBuoy className="h-4 w-4" />Ask us</Link>
        </div>
      )}
      {maint.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[1.25rem] font-semibold">Maintenance we&apos;ve done</h3>
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
  );
}

function Block({ d }: { d: WebHomeData }) {
  const c = d.care!;
  const b = c.block;
  const left = b?.leftMin ?? 0;
  const pct = b && b.boughtMin > 0 ? Math.max(0, Math.min(100, Math.round((left / b.boughtMin) * 100))) : 0;
  return (
    <section>
      <Head title="Prepaid hours" icon={Clock} href={`/p/${d.slug}/care/hours`} link={b && b.boughtMin ? "History & top up" : "Buy hours"} />
      <div className={tile}>
        {b && (b.boughtMin > 0 || b.unpaid.length > 0) ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <p><span className={`block text-[2.5rem] font-semibold leading-none ${left < 0 ? "text-rose-700" : ""}`}>{fmtHours(left)}</span><span className="text-[0.875rem] text-[#575270]">{left < 0 ? "over your prepaid hours" : "left to use"}</span></p>
              <p className="text-right text-[0.8125rem] text-[#575270]">{fmtHours(b.usedMin)} used<br />of {fmtHours(b.boughtMin)}</p>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#EEECF5]"><div className="h-full rounded-full bg-[var(--portal-brand)]" style={{ width: `${pct}%` }} /></div>
            {b.unpaid.map((u) => (
              <a key={u.payToken} href={`/pay/${u.payToken}`} className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-[0.875rem] ring-1 ring-amber-200">
                <span>{u.hours} hours ready once invoice {u.number} is paid</span><span className="font-semibold text-amber-900">Pay</span>
              </a>
            ))}
            {b.recent.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-[0.875rem]">
                {b.recent.slice(0, 4).map((r) => (
                  <li key={r.ticket_id} className="flex justify-between gap-3"><Link href={`/p/${d.slug}/support/${r.ticket_id}`} className="min-w-0 truncate hover:underline">#{r.number} {r.subject}</Link><span className="shrink-0 text-[#575270]">{fmtHours(r.minutes_charged)}</span></li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="font-semibold">Updates on tap, no quotes to wait for.</p>
            <p className="mt-1 text-[0.9375rem] text-[#575270]">Buy a block of hours, list the changes you want, and we do them — the time comes off your block.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {c.packs.map((p) => (
                <Link key={p.hours} href={`/p/${d.slug}/care/hours#buy`} className="rounded-2xl bg-[#F5F4FA] p-3 text-center ring-1 ring-[#E2DFEC] hover:ring-[var(--portal-brand)]">
                  <span className="block text-[1.25rem] font-semibold">{p.hours} h</span>
                  <span className="block text-[0.8125rem] text-[#575270]">{money(p.incGst, d.currency, { cents: false })}</span>
                  {p.discountPct > 0 && <span className="mt-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-emerald-700">Save {p.discountPct}%</span>}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Sites({ d }: { d: WebHomeData }) {
  const sites = d.sites.filter((s) => s.status !== "archived");
  const covered = d.plans.some((p) => p.category === "maintenance" && p.status !== "ended");
  return (
    <section>
      <Head title="Your websites" icon={Globe} />
      {sites.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {sites.map((s) => {
            const c = s.care;
            const waiting = (c?.pending.length ?? 0) + (c?.wpUpdate ? 1 : 0);
            return (
              <li key={s.id} className={tile}>
                <div className="flex items-start justify-between gap-3">
                  <a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 font-semibold hover:underline"><Globe className="h-4 w-4 shrink-0 text-[var(--portal-brand)]" /><span className="truncate">{s.domain}</span></a>
                  {s.suspended ? <Badge tone="red">Suspended</Badge> : <Badge tone={s.status === "live" ? "green" : "brand"}>{s.status === "live" ? "Live" : s.status === "building" ? "Being built" : s.status}</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(["hosting", "maintenance", "adwords"] as PlanCategory[]).map((cat) => {
                    const on = s.plans.includes(cat) || (cat === "hosting" && s.hosted);
                    return (
                      <span key={cat} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-medium ${on ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200" : "bg-[#F0EEF6] text-[#8A86A0]"}`}>
                        {on ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}{PLAN_LABEL[cat]}
                      </span>
                    );
                  })}
                </div>
                {s.suspended && <p className="mt-2 text-[0.8125rem] text-rose-700">This site is switched off for an unpaid hosting invoice — it comes back on automatically once it&apos;s paid.</p>}
                {c ? (
                  <div className="mt-4 border-t border-[#EEECF5] pt-3">
                    <dl className="grid grid-cols-3 gap-2 text-[0.8125rem]">
                      <div><dt className="text-[#8A86A0]">WordPress</dt><dd className={`font-semibold ${c.behindWp ? "text-amber-800" : ""}`}>{c.wp ?? "—"}</dd></div>
                      <div><dt className="text-[#8A86A0]">WooCommerce</dt><dd className={`font-semibold ${c.behindWc ? "text-amber-800" : ""}`}>{c.wc ?? "Not used"}</dd></div>
                      <div><dt className="text-[#8A86A0]">PHP</dt><dd className="font-semibold">{c.php ?? "—"}</dd></div>
                    </dl>
                    {waiting ? (
                      <details className="mt-3">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[0.875rem] font-semibold text-amber-900 ring-1 ring-amber-200">
                          <span className="inline-flex items-center gap-1.5"><RefreshCw className="h-4 w-4" />{waiting} update{waiting === 1 ? "" : "s"} waiting</span><span className="text-[0.75rem] font-medium">Show</span>
                        </summary>
                        <ul className="mt-2 space-y-1 text-[0.8125rem]">
                          {c.wpUpdate && <li className="flex justify-between gap-2"><span className="font-medium">WordPress</span><span className="text-[#575270]">{c.wp} → {c.wpUpdate}</span></li>}
                          {c.pending.map((p, i) => <li key={i} className="flex justify-between gap-2"><span className="min-w-0 truncate font-medium">{p.name}{p.kind === "theme" ? " (theme)" : ""}</span><span className="shrink-0 text-[#575270]">{p.from} → {p.to}</span></li>)}
                        </ul>
                        <Link href={`/p/${d.slug}/care/new?type=${d.care ? "tasks" : "job"}&site=${s.id}&updates=1`} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--portal-brand)] px-4 text-[0.8125rem] font-semibold text-[color:var(--portal-brand-fg)]"><PackageCheck className="h-4 w-4" />Ask us to update these</Link>
                      </details>
                    ) : <p className="mt-3 inline-flex items-center gap-1.5 text-[0.875rem] text-emerald-800"><CheckCircle2 className="h-4 w-4" />All {c.plugins} plugins up to date</p>}
                    {c.checkedAt && <p className="mt-2 text-[0.75rem] text-[#8A86A0]">Checked {relative(c.checkedAt)}</p>}
                  </div>
                ) : <p className="mt-3 text-[0.8125rem] text-[#8A86A0]">Update checks aren&apos;t switched on for this site yet — ask us.</p>}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-[0.9375rem] text-[#575270]">No websites on your account yet.</p>}
      {!covered && sites.length > 0 && (
        <Link href={`/p/${d.slug}/care/new?type=job&about=care`} className="mt-3 flex items-center gap-3 rounded-[22px] bg-[var(--portal-brand-soft)] p-4 text-[var(--portal-brand-ink)]">
          <Wrench className="h-5 w-5 shrink-0" /><span className="text-[0.875rem]"><strong>Keep your site safe.</strong> Regular maintenance keeps WordPress, plugins and security up to date. Ask us about a care plan.</span>
        </Link>
      )}
    </section>
  );
}

function Versions({ v }: { v: LatestVersions }) {
  const rows: [string, string | null, string][] = [
    ["WordPress", v.wordpress, "The website platform itself"], ["WooCommerce", v.woocommerce, "Online shop plugin"], ["Elementor", v.elementor, "Page builder"],
    ["Yoast SEO", v.yoast, "Search engine plugin"], ["PHP", v.php, "The language your server runs"],
  ];
  return (
    <section>
      <Head title="Latest versions" icon={RefreshCw} />
      <div className={tile}>
        <ul className="divide-y divide-[#EEECF5]">
          {rows.map(([n, ver, what]) => (
            <li key={n} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0"><span className="block font-medium">{n}</span><span className="block text-[0.8125rem] text-[#8A86A0]">{what}</span></span>
              <span className="shrink-0 rounded-full bg-[#F5F4FA] px-3 py-1 text-[0.875rem] font-semibold tabular-nums">{ver ?? "—"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.75rem] text-[#8A86A0]">Straight from WordPress.org and php.net. Compare with your sites above — anything behind is shown in amber.</p>
      </div>
    </section>
  );
}

function Ads({ d }: { d: WebHomeData }) {
  const a = d.ads;
  if (a.accounts.length || a.hasPlan) {
    return (
      <section>
        <Head title="Google Ads" icon={BarChart3} />
        <div className={tile}>
          <p className="inline-flex items-center gap-1.5 font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Managed by us</p>
          <p className="mt-1 text-[0.9375rem] text-[#575270]">We check your campaigns every day, block wasted searches and move budget to what brings enquiries.</p>
          <ul className="mt-3 space-y-2">
            {a.accounts.map((x) => x.report
              ? <li key={x.id}><a href={`/marketing-report/${x.report.token}`} className="flex items-center justify-between gap-3 rounded-2xl bg-[#F5F4FA] px-4 py-3 ring-1 ring-[#E2DFEC] hover:ring-[var(--portal-brand)]"><span className="min-w-0 truncate font-medium">{x.name} — {new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${x.report.month}T00:00:00Z`))} report</span><ArrowRight className="h-4 w-4 shrink-0" /></a></li>
              : <li key={x.id} className="text-[0.875rem] text-[#575270]">{x.name}: your first monthly report arrives early next month.</li>)}
          </ul>
        </div>
      </section>
    );
  }
  return (
    <section>
      <Head title="Add Google Ads" icon={Megaphone} />
      <div className={tile}>
        <p className="font-semibold">More enquiries, without the wasted spend.</p>
        <p className="mt-1 text-[0.9375rem] text-[#575270]">We set up and run your Google Ads, put 2 hours of campaign work into them every week, block searches that waste money, and send you a detailed report each month.</p>
        {a.feeExGst !== null && <p className="mt-3 text-[0.9375rem]"><span className="text-[1.5rem] font-semibold">{money(a.feeExGst, d.currency, { cents: false })}</span> + GST a month — includes 2 hours of campaign work every week and a detailed monthly report. That&apos;s about 8.7 hours a month — {money(Math.round(a.rate * 2 * 52 / 12), d.currency, { cents: false })} + GST at our normal rate. Your ad budget is paid to Google.</p>}
        <AdsAddOn slug={d.slug} customer={d.customerId} />
      </div>
    </section>
  );
}

function Plans({ d }: { d: WebHomeData }) {
  return (
    <section>
      <Head title="Plans & subscriptions" icon={ShieldCheck} />
      <ul className="divide-y divide-[#E2DFEC] rounded-[22px] bg-white ring-1 ring-[#E2DFEC]">
        {d.plans.filter((p) => p.status !== "ended").map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="min-w-0"><span className="block truncate font-medium">{PLAN_LABEL[p.category]}{p.website ? ` · ${p.website}` : ""}</span><span className="block text-[0.8125rem] text-[#575270]">{money(p.total, d.currency)} {describeSchedule(p.every, p.unit).toLowerCase()}{p.status === "active" ? ` · next ${fmtDate(p.next_date)}` : ""}</span></span>
            {p.status !== "active" && <Badge tone="neutral">Not billing</Badge>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Invoices({ d, owing }: { d: WebHomeData; owing: WebHomeData["invoices"] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section>
      <Head title="Invoices" icon={FileText} href={`/p/${d.slug}/payments`} link="All invoices & receipts" />
      {owing.length ? (
        <ul className="divide-y divide-[#E2DFEC] rounded-[22px] bg-white ring-1 ring-[#E2DFEC]">
          {owing.slice(0, 6).map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="min-w-0"><span className="block font-medium">{i.number}</span><span className={`block text-[0.8125rem] ${i.due_date && i.due_date < today ? "text-rose-700" : "text-[#575270]"}`}>{money(i.balance, d.currency)} · due {fmtDate(i.due_date)}</span></span>
              <a href={`/pay/${i.pay_token}`} className="inline-flex h-9 items-center rounded-full bg-[var(--portal-brand)] px-4 text-[0.8125rem] font-semibold text-[color:var(--portal-brand-fg)]">Pay</a>
            </li>
          ))}
        </ul>
      ) : <p className={`${tile} flex items-center gap-2 text-[0.9375rem] text-[#575270]`}><CheckCircle2 className="h-4 w-4 text-emerald-600" />All paid — thank you.</p>}
    </section>
  );
}
