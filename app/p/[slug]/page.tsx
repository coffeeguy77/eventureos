import Link from "next/link";
import { ArrowRight, CalendarDays, Coffee, FileText, GraduationCap, Gift, MapPin, PartyPopper, Receipt, Sparkles, UtensilsCrossed } from "lucide-react";
import { publicOrg } from "@/lib/bookings/server";
import { readShop } from "@/lib/shop/core";
import { readSiteNav } from "@/lib/site-nav";
import { Badge } from "@/components/ui/badge";
import { createServiceClient } from "@/lib/integrations/runtime";
import { loadLibrary } from "@/lib/documents/library";
import { readEvents } from "@/lib/events/core";
import { DocList } from "@/components/portal/doc-list";
import { cn } from "@/lib/cn";
import { firstName, fmtDate, money, relativeDay, timeRange, todayISO } from "@/lib/format";
import {
  CUSTOMER_EVENT_STATUS, customerEventStatus, CUSTOMER_QUOTE_STATUS, EVENT_COLUMNS, INVOICE_COLUMNS, QUOTE_COLUMNS, VERSION_COLUMNS,
  customerNextAction, paymentSummary, requirePortal,
  type PortalEvent, type PortalInvoice, type PortalQuote, type PortalVersion,
} from "./portal-data";

export default async function PortalHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, org, customerIds, contactName, user, branding } = await requirePortal(slug);
  const tz = org.timezone;
  const today = todayISO(tz);

  const [evRes, qRes, invRes, reqRes] = await Promise.all([
    supabase.from("portal_events").select(EVENT_COLUMNS).eq("organisation_id", org.id).in("customer_id", customerIds)
      .order("event_date", { ascending: true, nullsFirst: false }),
    supabase.from("portal_quotes").select(QUOTE_COLUMNS).eq("organisation_id", org.id).in("customer_id", customerIds)
      .neq("status", "draft").not("current_version_id", "is", null).order("created_at", { ascending: false }),
    supabase.from("invoices").select(INVOICE_COLUMNS).eq("organisation_id", org.id).in("customer_id", customerIds)
      .neq("status", "draft"),
    supabase.from("documents").select("id, event_id").eq("organisation_id", org.id).in("customer_id", customerIds)
      .eq("visibility", "customer").eq("requested_from_customer", true),
  ]);
  for (const r of [evRes, qRes, invRes, reqRes]) if (r.error) throw new Error(`Could not load your bookings: ${r.error.message}`);

  const events = (evRes.data ?? []) as unknown as PortalEvent[];
  const quotes = (qRes.data ?? []) as unknown as PortalQuote[];
  const invoices = (invRes.data ?? []) as unknown as PortalInvoice[];
  const requests = (reqRes.data ?? []) as { id: string; event_id: string | null }[];

  const versionIds = quotes.map((q) => q.current_version_id).filter(Boolean) as string[];
  const { data: vData, error: vErr } = versionIds.length
    ? await supabase.from("quote_versions").select(VERSION_COLUMNS).in("id", versionIds)
    : { data: [], error: null };
  if (vErr) throw new Error(`Could not load your quotes: ${vErr.message}`);
  const versions = new Map(((vData ?? []) as unknown as PortalVersion[]).map((v) => [v.id, v]));

  // The business's documents (insurance certificate, food licence, artwork templates…) — current ones only
  const library = (await loadLibrary(createServiceClient(), org.id, { current: today })) ?? [];
  const cards = events.map((e) => {
    const q = quotes.find((x) => x.event_id === e.id) ?? null; // newest first
    const v = q?.current_version_id ? versions.get(q.current_version_id) ?? null : null;
    const inv = invoices.filter((i) => i.event_id === e.id);
    const reqCount = requests.filter((r) => r.event_id === e.id).length;
    return { e, q, v, inv, next: customerNextAction({ event: e, version: v, invoices: inv, requestedDocs: reqCount, tz }), pay: paymentSummary(inv, org.currency) };
  });
  const upcoming = cards.filter((c) => c.e.status !== "cancelled" && c.e.status !== "completed" && (!c.e.event_date || c.e.event_date >= today));
  const past = cards.filter((c) => !upcoming.includes(c));
  const actionCount = upcoming.filter((c) => c.next.urgent).length;

  const site = await publicOrg(slug).catch(() => null);
  const raw = site?.rawSettings ?? {};
  const ev = readEvents(raw);
  const labels = readSiteNav(raw);
  const name = firstName(contactName, user.email);
  const next = upcoming.find((c) => c.e.event_date) ?? upcoming[0] ?? null;
  const daysTo = next?.e.event_date ? Math.round((Date.parse(next.e.event_date) - Date.parse(today)) / 864e5) : null;
  const toReview = upcoming.filter((c) => c.v && (c.v.status === "sent" || c.v.status === "viewed")).length;
  const due = invoices.filter((i) => i.status !== "void" && i.status !== "draft").reduce((a, i) => a + Math.max(0, Number(i.balance)), 0);
  const actions = [
    ev.enabled ? { href: `/hire/${slug}/quote`, icon: PartyPopper, t: "Plan another event", b: "Coffee cart, van or equipment — get a quote" } : null,
    ev.enabled ? { href: `/hire/${slug}/catering`, icon: UtensilsCrossed, t: "Order catering", b: "Morning tea, lunch or afternoon tea" } : null,
    site?.settings.enabled ? { href: `/${slug}`, icon: GraduationCap, t: labels.lessons, b: "Book a class" } : null,
    readShop(raw).enabled ? { href: `/shop/${slug}`, icon: Coffee, t: labels.shop, b: "Fresh roasted coffee, delivered" } : null,
    site?.settings.enabled && site.stripeReady ? { href: `/book/${slug}/gift`, icon: Gift, t: labels.gifts, b: "A gift they'll actually use" } : null,
  ].filter((x): x is { href: string; icon: typeof Coffee; t: string; b: string } => !!x);
  const tile = "rounded-[22px] bg-white p-5 ring-1 ring-[#EDE3DB]";

  return (
    <div className="space-y-10 sm:space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[32px] bg-[#151312] px-6 py-8 text-white sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 h-[380px] w-[380px] rounded-full bg-[var(--portal-brand)] opacity-30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-[260px] w-[260px] rounded-full bg-[var(--portal-brand)] opacity-15 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[var(--portal-brand)]">{branding.name} · your account</p>
            <h1 className="portal-serif mt-3 break-words text-[2.75rem] font-semibold leading-[1.02] sm:text-[3.75rem]">Hi {name}.</h1>
            <p className="mt-3 max-w-[480px] text-[1.0625rem] leading-relaxed text-white/75">
              {actionCount > 0
                ? `${actionCount === 1 ? "One booking needs" : `${actionCount} bookings need`} your attention — it's all below.`
                : events.length ? "Everything's up to date. Here's what's coming up." : "This is your home for quotes, bookings, invoices and documents."}
            </p>
          </div>
          {next ? (
            <Link href={`/p/${slug}/events/${next.e.id}`} className="group block rounded-[24px] bg-white/[0.07] p-5 ring-1 ring-white/10 transition hover:bg-white/[0.11] sm:p-6">
              <p className="text-[0.75rem] font-bold uppercase tracking-[0.14em] text-white/60">Next up</p>
              <div className="mt-2 flex items-end justify-between gap-4">
                <p className="portal-serif min-w-0 break-words text-[1.625rem] font-semibold leading-tight">{next.e.name}</p>
                {daysTo !== null && daysTo >= 0 && <p className="shrink-0 text-right"><span className="portal-serif block text-[3rem] font-semibold leading-none text-[var(--portal-brand)]">{daysTo}</span><span className="text-[0.75rem] font-semibold uppercase tracking-wide text-white/60">{daysTo === 1 ? "day to go" : "days to go"}</span></p>}
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.875rem] text-white/75">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{next.e.event_date ? fmtDate(next.e.event_date, "long") : "Date to be confirmed"}{next.e.start_time ? ` · ${timeRange(next.e.start_time, next.e.finish_time)}` : ""}</span>
                {(next.e.venue || next.e.address) && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{next.e.venue ?? next.e.address}</span>}
              </p>
              <p className="mt-4 inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-[var(--portal-brand)]">{next.next.label}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></p>
            </Link>
          ) : ev.enabled ? (
            <Link href={`/hire/${slug}/quote`} className="group block rounded-[24px] bg-white/[0.07] p-6 ring-1 ring-white/10 transition hover:bg-white/[0.11]">
              <Sparkles className="h-6 w-6 text-[var(--portal-brand)]" />
              <p className="portal-serif mt-3 text-[1.625rem] font-semibold leading-tight">Planning something?</p>
              <p className="mt-1 text-white/70">Build your event online and we&apos;ll email your quote.</p>
              <p className="mt-4 inline-flex items-center gap-2 font-semibold text-[var(--portal-brand)]">Start a quote<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></p>
            </Link>
          ) : null}
        </div>
      </section>

      {/* At a glance */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="At a glance">
        <div className={tile}><CalendarDays className="h-5 w-5 text-[var(--portal-brand)]" /><p className="portal-serif mt-3 text-[2.25rem] font-semibold leading-none">{upcoming.length}</p><p className="mt-1 text-[0.875rem] text-[#5E5853]">Upcoming {upcoming.length === 1 ? "event" : "events"}</p></div>
        <div className={tile}><FileText className="h-5 w-5 text-[var(--portal-brand)]" /><p className="portal-serif mt-3 text-[2.25rem] font-semibold leading-none">{toReview}</p><p className="mt-1 text-[0.875rem] text-[#5E5853]">{toReview === 1 ? "Quote" : "Quotes"} to review</p></div>
        <div className={tile}><Receipt className="h-5 w-5 text-[var(--portal-brand)]" /><p className="portal-serif mt-3 text-[2.25rem] font-semibold leading-none">{money(due, org.currency)}</p><p className="mt-1 text-[0.875rem] text-[#5E5853]">{due > 0 ? "To pay" : "Nothing owing"}</p></div>
        <div className={tile}><Sparkles className="h-5 w-5 text-[var(--portal-brand)]" /><p className="portal-serif mt-3 text-[2.25rem] font-semibold leading-none">{requests.length}</p><p className="mt-1 text-[0.875rem] text-[#5E5853]">{requests.length === 1 ? "Document" : "Documents"} we need</p></div>
      </section>

      {/* Events */}
      <section id="events">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="portal-serif text-[2rem] font-semibold leading-tight">My events</h2>
          {ev.enabled && <Link href={`/hire/${slug}/quote`} className="hidden items-center gap-1.5 text-[0.9375rem] font-semibold text-[var(--portal-brand-ink)] hover:underline sm:inline-flex">New quote<ArrowRight className="h-4 w-4" /></Link>}
        </div>
        {upcoming.length === 0 && (
          <div className="rounded-[24px] border-2 border-dashed border-[#E3D7CE] bg-white/60 px-6 py-12 text-center">
            <p className="text-[1rem] font-semibold">No upcoming bookings</p>
            <p className="mt-1 text-[0.9375rem] text-[#5E5853]">When {branding.name} sets up a booking for you, it will show here.</p>
          </div>
        )}
        <div className="space-y-4">
          {upcoming.map((c) => <EventCard key={c.e.id} slug={slug} card={c} today={today} currency={org.currency} />)}
        </div>
      </section>

      {/* Quick actions */}
      {actions.length > 0 && (
        <section>
          <h2 className="portal-serif mb-4 text-[2rem] font-semibold leading-tight">More from {branding.name}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((a) => (
              <Link key={a.href} href={a.href} className="portal-lift group flex items-center gap-4 rounded-[22px] bg-white p-5 ring-1 ring-[#EDE3DB]">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--portal-brand-soft)] text-[var(--portal-brand-ink)]"><a.icon className="h-[22px] w-[22px]" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold">{a.t}</span><span className="block truncate text-[0.875rem] text-[#5E5853]">{a.b}</span></span>
                <ArrowRight className="h-5 w-5 shrink-0 text-[#B9AEA6] transition group-hover:translate-x-1 group-hover:text-[var(--portal-brand)]" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {library.length > 0 && (
        <section>
          <h2 className="portal-serif text-[2rem] font-semibold leading-tight">Documents from {branding.name}</h2>
          <p className="mt-1 text-[0.9375rem] text-[#5E5853]">Insurance, licences and artwork templates.</p>
          <div className="mt-3 rounded-[22px] bg-white px-2 ring-1 ring-[#EDE3DB]"><DocList docs={library} base={`/p/${slug}/library`} /></div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="portal-serif mb-4 text-[1.5rem] font-semibold">Past and cancelled</h2>
          <div className="space-y-3">
            {past.map((c) => <EventCard key={c.e.id} slug={slug} card={c} today={today} currency={org.currency} compact />)}
          </div>
        </section>
      )}
    </div>
  );
}

function EventCard({ slug, card, today, currency, compact }: {
  slug: string; today: string; currency: string; compact?: boolean;
  card: { e: PortalEvent; q: PortalQuote | null; v: PortalVersion | null; inv: PortalInvoice[]; next: ReturnType<typeof customerNextAction>; pay: ReturnType<typeof paymentSummary> };
}) {
  const { e, q, v, next, pay } = card;
  const st = customerEventStatus(e);
  const href = `/p/${slug}/events/${e.id}`;
  const actionHref = next.tab === "overview" ? href : `${href}?tab=${next.tab}`;
  return (
    <article className={cn("portal-lift overflow-hidden rounded-[24px] bg-white ring-1 ring-[#EDE3DB]", compact && "opacity-90")}>
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-56">
            <Link href={href} className="portal-serif break-words text-[1.5rem] font-semibold leading-tight text-[#151312] hover:underline">{e.name}</Link>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.875rem] text-[#5E5853]">
              <span className="flex min-w-0 items-start gap-1.5">
                <CalendarDays className="mt-[3px] h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">
                  {e.event_date ? `${fmtDate(e.event_date, "long")}` : "Date to be confirmed"}
                  {e.start_time && ` · ${timeRange(e.start_time, e.finish_time)}`}
                  {e.event_date && !compact && <span className="text-ink-faint"> ({relativeDay(e.event_date, today)})</span>}
                </span>
              </span>
              {(e.venue || e.address) && (
                <span className="flex min-w-0 items-start gap-1.5"><MapPin className="mt-[3px] h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-words">{e.venue ?? e.address}</span></span>
              )}
            </div>
          </div>
          <Badge tone={st.tone} dot>{st.label}</Badge>
        </div>

        {!compact && (
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[#F0E8E1] pt-4 sm:mt-5 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-[0.7188rem] font-medium uppercase tracking-wide text-ink-faint">Current quote</dt>
              <dd className="mt-1 text-[0.8438rem] text-ink">
                {q && v ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    Q-{q.number} · v{v.version_number}
                    <Badge tone={CUSTOMER_QUOTE_STATUS[v.status].tone}>{CUSTOMER_QUOTE_STATUS[v.status].label}</Badge>
                  </span>
                ) : <span className="text-ink-muted">Being prepared</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[0.7188rem] font-medium uppercase tracking-wide text-ink-faint">Amount</dt>
              <dd className="tabular mt-1 text-[0.9375rem] font-semibold text-ink sm:text-[0.8438rem] sm:font-medium">{v ? money(v.total, currency) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[0.7188rem] font-medium uppercase tracking-wide text-ink-faint">Payment</dt>
              <dd className="mt-1"><Badge tone={pay.tone}>{pay.label}</Badge></dd>
            </div>
          </dl>
        )}
      </div>
      <Link
        href={actionHref}
        className={cn(
          "flex min-h-[52px] items-center justify-between gap-3 border-t px-4 py-3.5 text-[0.875rem] font-medium sm:min-h-0 sm:px-6 sm:text-[0.8438rem]",
          next.urgent
            ? "border-[var(--portal-brand-line)] bg-[var(--portal-brand-soft)] text-[color:var(--portal-brand-ink)] hover:brightness-[0.98]"
            : "border-[#F0E8E1] bg-[#FCF8F5] text-[#5E5853] hover:text-[#151312]"
        )}
      >
        <span className="min-w-0">
          <span className="block">{next.label}</span>
          {next.detail && <span className="block text-[0.75rem] font-normal opacity-80">{next.detail}</span>}
        </span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
    </article>
  );
}
