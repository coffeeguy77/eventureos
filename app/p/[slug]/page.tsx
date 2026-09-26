import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { firstName, fmtDate, money, relativeDay, timeRange, todayISO } from "@/lib/format";
import {
  CUSTOMER_EVENT_STATUS, CUSTOMER_QUOTE_STATUS, EVENT_COLUMNS, INVOICE_COLUMNS, QUOTE_COLUMNS, VERSION_COLUMNS,
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

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <p className="text-[13px] font-medium text-[color:var(--portal-brand-ink)]">{branding.name}</p>
        <h1 className="mt-1 break-words text-[23px] font-semibold tracking-tight text-ink sm:text-[26px]">Hi {firstName(contactName, user.email)}</h1>
        <p className="mt-1.5 text-[14px] text-ink-muted">
          {actionCount > 0
            ? `${actionCount === 1 ? "One booking needs" : `${actionCount} bookings need`} your attention.`
            : events.length ? "Everything's up to date. Here are your bookings." : "Here's where your bookings will appear."}
        </p>
      </div>

      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">My events</h2>
      {upcoming.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong bg-white px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-ink">No upcoming bookings</p>
          <p className="mt-1 text-[13px] text-ink-muted">When {branding.name} sets up a booking for you, it will show here.</p>
        </div>
      )}
      <div className="space-y-4">
        {upcoming.map((c) => <EventCard key={c.e.id} slug={slug} card={c} today={today} currency={org.currency} />)}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Past and cancelled</h2>
          <div className="space-y-3">
            {past.map((c) => <EventCard key={c.e.id} slug={slug} card={c} today={today} currency={org.currency} compact />)}
          </div>
        </>
      )}
    </div>
  );
}

function EventCard({ slug, card, today, currency, compact }: {
  slug: string; today: string; currency: string; compact?: boolean;
  card: { e: PortalEvent; q: PortalQuote | null; v: PortalVersion | null; inv: PortalInvoice[]; next: ReturnType<typeof customerNextAction>; pay: ReturnType<typeof paymentSummary> };
}) {
  const { e, q, v, next, pay } = card;
  const st = CUSTOMER_EVENT_STATUS[e.status];
  const href = `/p/${slug}/events/${e.id}`;
  const actionHref = next.tab === "overview" ? href : `${href}?tab=${next.tab}`;
  return (
    <article className={cn("overflow-hidden rounded-2xl border border-line bg-white shadow-card", compact && "opacity-90")}>
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-56">
            <Link href={href} className="break-words text-[17px] font-semibold tracking-tight text-ink hover:underline">{e.name}</Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
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
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:mt-5 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Current quote</dt>
              <dd className="mt-1 text-[13.5px] text-ink">
                {q && v ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    Q-{q.number} · v{v.version_number}
                    <Badge tone={CUSTOMER_QUOTE_STATUS[v.status].tone}>{CUSTOMER_QUOTE_STATUS[v.status].label}</Badge>
                  </span>
                ) : <span className="text-ink-muted">Being prepared</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Amount</dt>
              <dd className="tabular mt-1 text-[15px] font-semibold text-ink sm:text-[13.5px] sm:font-medium">{v ? money(v.total, currency) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Payment</dt>
              <dd className="mt-1"><Badge tone={pay.tone}>{pay.label}</Badge></dd>
            </div>
          </dl>
        )}
      </div>
      <Link
        href={actionHref}
        className={cn(
          "flex min-h-[52px] items-center justify-between gap-3 border-t px-4 py-3.5 text-[14px] font-medium sm:min-h-0 sm:px-6 sm:text-[13.5px]",
          next.urgent
            ? "border-[var(--portal-brand-line)] bg-[var(--portal-brand-soft)] text-[color:var(--portal-brand-ink)] hover:brightness-[0.98]"
            : "border-line bg-zinc-50/60 text-ink-muted hover:text-ink"
        )}
      >
        <span className="min-w-0">
          <span className="block">{next.label}</span>
          {next.detail && <span className="block text-[12px] font-normal opacity-80">{next.detail}</span>}
        </span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
    </article>
  );
}
