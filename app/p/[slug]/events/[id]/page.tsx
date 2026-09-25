import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Circle, Clock, Download, FileText, MapPin, Users, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { fmtDate, fmtDateTime, money, relative, relativeDay, timeRange, todayISO } from "@/lib/format";
import {
  CUSTOMER_EVENT_STATUS, CUSTOMER_INVOICE_STATUS, CUSTOMER_QUOTE_STATUS, EVENT_COLUMNS, INVOICE_COLUMNS, INVOICE_KIND,
  QUOTE_COLUMNS, VERSION_COLUMNS, awaitingResponse, customerNextAction, isOpenInvoice, isUuid, quoteExpired, requirePortal,
  type PortalDocument, type PortalEvent, type PortalInvoice, type PortalPayment, type PortalQuote, type PortalVersion,
  type QuoteSnapshot,
} from "../../portal-data";
import { Detail, Panel, PortalLink, portalButton } from "../../ui";
import { MessageForm, QuoteResponse, UploadButton } from "./client";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "quote", label: "Quote" },
  { key: "timeline", label: "Timeline" },
  { key: "documents", label: "Documents" },
  { key: "payments", label: "Payments" },
  { key: "messages", label: "Messages" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

interface MessageRow { id: string; author_type: "customer" | "staff"; author_id: string | null; body: string; created_at: string }

export default async function PortalEventPage({ params, searchParams }: {
  params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "overview";

  const ctx = await requirePortal(slug);
  const { supabase, org, customerIds, branding, contactName } = ctx;
  const tz = org.timezone;
  const cur = org.currency;
  const today = todayISO(tz);

  // RLS limits rows to the customer's own; the explicit customer filter also protects staff who sign in here.
  const { data: evData, error: evErr } = await supabase
    .from("portal_events").select(EVENT_COLUMNS).eq("id", id).eq("organisation_id", org.id).in("customer_id", customerIds).maybeSingle();
  if (evErr) throw new Error(`Could not load your booking: ${evErr.message}`);
  if (!evData) notFound();
  const e = evData as unknown as PortalEvent;

  const [qRes, invRes, docRes, msgRes] = await Promise.all([
    supabase.from("portal_quotes").select(QUOTE_COLUMNS).eq("organisation_id", org.id).eq("event_id", e.id).eq("customer_id", e.customer_id)
      .neq("status", "draft").order("created_at", { ascending: false }),
    supabase.from("invoices").select(INVOICE_COLUMNS).eq("organisation_id", org.id).eq("event_id", e.id).eq("customer_id", e.customer_id)
      .neq("status", "draft").order("issue_date"),
    supabase.from("documents").select("id, name, storage_path, mime_type, size_bytes, event_id, customer_id, requested_from_customer, created_at, updated_at")
      .eq("organisation_id", org.id).eq("customer_id", e.customer_id).eq("visibility", "customer")
      .or(`event_id.eq.${e.id},event_id.is.null`).order("created_at", { ascending: false }),
    supabase.from("portal_messages").select("id, author_type, author_id, body, created_at")
      .eq("organisation_id", org.id).eq("customer_id", e.customer_id).eq("event_id", e.id).order("created_at"),
  ]);
  for (const r of [qRes, invRes, docRes, msgRes]) if (r.error) throw new Error(`Could not load your booking: ${r.error.message}`);

  const quotes = (qRes.data ?? []) as unknown as PortalQuote[];
  const invoices = (invRes.data ?? []) as unknown as PortalInvoice[];
  const docs = (docRes.data ?? []) as unknown as PortalDocument[];
  const messages = (msgRes.data ?? []) as unknown as MessageRow[];

  const quoteIds = quotes.map((q) => q.id);
  const invoiceIds = invoices.map((i) => i.id);
  const [vRes, pRes] = await Promise.all([
    quoteIds.length
      ? supabase.from("quote_versions").select(VERSION_COLUMNS).in("quote_id", quoteIds).order("version_number", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? supabase.from("payments").select("id, invoice_id, amount, paid_at, method, reference").in("invoice_id", invoiceIds).order("paid_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (vRes.error) throw new Error(`Could not load your quote: ${vRes.error.message}`);
  if (pRes.error) throw new Error(`Could not load your payments: ${pRes.error.message}`);
  const versions = (vRes.data ?? []) as unknown as PortalVersion[];
  const payments = (pRes.data ?? []) as unknown as PortalPayment[];

  const quote = quotes.find((q) => q.current_version_id) ?? null;
  let current = quote ? versions.find((v) => v.id === quote.current_version_id) ?? null : null;

  // Opening the Quote tab records that the customer has viewed it (once).
  if (tab === "quote" && current && !current.viewed_at && current.status === "sent") {
    const { error } = await supabase.rpc("portal_mark_quote_viewed", { p_version_id: current.id });
    if (!error) current = { ...current, viewed_at: new Date().toISOString(), status: "viewed" };
  }

  const requested = docs.filter((d) => d.requested_from_customer && d.event_id === e.id);
  const next = customerNextAction({ event: e, version: current, invoices, requestedDocs: requested.length, tz });
  const st = CUSTOMER_EVENT_STATUS[e.status];
  const base = `/p/${slug}/events/${e.id}`;
  const counts: Partial<Record<TabKey, number>> = {
    documents: requested.length,
    payments: invoices.filter(isOpenInvoice).length,
  };

  return (
    <div>
      <Link href={`/p/${slug}`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" />My events
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">{e.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{e.event_date ? fmtDate(e.event_date, "long") : "Date to be confirmed"}</span>
            {(e.venue || e.address) && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{e.venue ?? e.address}</span>}
          </div>
        </div>
        <Badge tone={st.tone} dot className="text-[12.5px]">{st.label}</Badge>
      </div>

      {next.urgent && tab !== next.tab && (
        <Link
          href={next.tab === "overview" ? base : `${base}?tab=${next.tab}`}
          className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[var(--portal-brand-line)] bg-[var(--portal-brand-soft)] px-4 py-3 text-[13.5px] font-medium text-[color:var(--portal-brand-ink)]"
        >
          <span>{next.label}{next.detail && <span className="ml-2 font-normal opacity-80">{next.detail}</span>}</span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      <nav className="no-scrollbar -mb-px mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Booking sections">
        {TABS.map((t) => {
          const on = t.key === tab;
          const n = counts[t.key];
          return (
            <Link
              key={t.key}
              href={t.key === "overview" ? base : `${base}?tab=${t.key}`}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[13.5px] font-medium transition-colors",
                on ? "border-[var(--portal-brand)] text-ink" : "border-transparent text-ink-muted hover:text-ink"
              )}
            >
              {t.label}
              {!!n && <span className="rounded-full bg-[var(--portal-brand)] px-1.5 text-[11px] text-[color:var(--portal-brand-fg)]">{n}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 space-y-6">
        {tab === "overview" && <Overview e={e} today={today} quote={quote} current={current} cur={cur} base={base} next={next} />}

        {tab === "quote" && (
          <QuoteTab
            slug={slug} e={e} quote={quote} current={current} versions={versions} tz={tz} cur={cur}
            defaultName={contactName ?? ""} businessName={branding.name} base={base}
          />
        )}

        {tab === "timeline" && <Timeline e={e} versions={versions} quotes={quotes} invoices={invoices} payments={payments} tz={tz} cur={cur} today={today} />}

        {tab === "documents" && (
          <Documents slug={slug} e={e} orgId={org.id} docs={docs} supabase={supabase} tz={tz} />
        )}

        {tab === "payments" && <Payments invoices={invoices} payments={payments} cur={cur} tz={tz} />}

        {tab === "messages" && <Messages slug={slug} e={e} messages={messages} businessName={branding.name} tz={tz} />}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Overview                                                            */
/* ================================================================== */

function Overview({ e, today, quote, current, cur, base, next }: {
  e: PortalEvent; today: string; quote: PortalQuote | null; current: PortalVersion | null; cur: string; base: string;
  next: ReturnType<typeof customerNextAction>;
}) {
  return (
    <>
      <Panel title="Your event">
        <dl className="grid grid-cols-1 gap-5 px-5 pb-6 sm:grid-cols-2 sm:px-6">
          <Detail label="Date">
            {e.event_date ? <>{fmtDate(e.event_date, "long")} <span className="text-ink-faint">· {relativeDay(e.event_date, today)}</span></> : "To be confirmed"}
          </Detail>
          <Detail label="Time">
            <span className="inline-flex items-center gap-1.5">{e.start_time ? <><Clock className="h-4 w-4 text-ink-faint" />{timeRange(e.start_time, e.finish_time)}</> : "To be confirmed"}</span>
          </Detail>
          <Detail label="Venue">
            {e.venue || e.address ? (
              <>
                {e.venue && <span className="block">{e.venue}</span>}
                {e.address && <span className="block text-[13px] text-ink-muted">{e.address}</span>}
              </>
            ) : "To be confirmed"}
          </Detail>
          <Detail label="Guests">
            <span className="inline-flex items-center gap-1.5">{e.guest_count != null ? <><Users className="h-4 w-4 text-ink-faint" />{e.guest_count}</> : "To be confirmed"}</span>
          </Detail>
          {e.event_type && <Detail label="Type of event">{e.event_type}</Detail>}
          <Detail label="Reference">{e.number ? `#${e.number}` : "—"}</Detail>
          {e.services.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Services</dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {e.services.map((s) => (
                  <span key={s} className="rounded-full bg-[var(--portal-brand-soft)] px-2.5 py-1 text-[12.5px] text-ink ring-1 ring-inset ring-[var(--portal-brand-line)]">{s}</span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </Panel>

      {e.customer_notes && (
        <Panel title="Notes for you">
          <p className="whitespace-pre-wrap px-5 pb-6 text-[14px] leading-relaxed text-ink sm:px-6">{e.customer_notes}</p>
        </Panel>
      )}

      <Panel title="What's next">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-6 sm:px-6">
          <div>
            <p className="text-[14px] font-medium text-ink">{next.label}</p>
            {next.detail && <p className="mt-0.5 text-[13px] text-ink-muted">{next.detail}</p>}
            {quote && current && (
              <p className="mt-2 text-[13px] text-ink-muted">
                Current quote Q-{quote.number} · version {current.version_number} · <span className="tabular">{money(current.total, cur)}</span>
              </p>
            )}
          </div>
          {next.tab !== "overview" && (
            <Link href={`${base}?tab=${next.tab}`} className={portalButton(next.urgent ? "primary" : "secondary")}>
              {next.tab === "quote" ? "View quote" : next.tab === "payments" ? "View payments" : next.tab === "documents" ? "View documents" : "Send a message"}
            </Link>
          )}
        </div>
      </Panel>
    </>
  );
}

/* ================================================================== */
/* Quote                                                               */
/* ================================================================== */

function QuoteTab({ slug, e, quote, current, versions, tz, cur, defaultName, businessName, base }: {
  slug: string; e: PortalEvent; quote: PortalQuote | null; current: PortalVersion | null; versions: PortalVersion[];
  tz: string; cur: string; defaultName: string; businessName: string; base: string;
}) {
  if (!quote || !current) {
    return (
      <Panel>
        <div className="px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-ink">Your quote is being prepared</p>
          <p className="mt-1 text-[13px] text-ink-muted">We&apos;ll let you know when it&apos;s ready. Questions in the meantime? <PortalLink href={`${base}?tab=messages`}>Send us a message</PortalLink>.</p>
        </div>
      </Panel>
    );
  }
  const expired = quoteExpired(current, tz);
  const open = awaitingResponse(current, tz);
  const previous = versions.filter((v) => v.quote_id === quote.id && v.id !== current.id);
  const qs = CUSTOMER_QUOTE_STATUS[current.status];

  return (
    <>
      {current.status === "accepted" && (
        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-[13.5px]">
            <p className="font-semibold">Quote accepted — thank you!</p>
            <p className="mt-1">
              Accepted by <strong>{current.accepted_by_name ?? "you"}</strong> on {fmtDateTime(current.responded_at, tz, "date")} at {fmtDateTime(current.responded_at, tz, "time")} ({tz.replace("_", " ")}).
            </p>
            <p className="mt-1 text-emerald-800">Quote Q-{quote.number}, version {current.version_number} · {money(current.total, cur)} · Confirmation reference {current.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
      )}
      {current.status === "declined" && (
        <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="text-[13.5px]">
            <p className="font-semibold">You declined this quote on {fmtDateTime(current.responded_at, tz, "date")}.</p>
            {current.decline_reason && <p className="mt-1">Reason: {current.decline_reason}</p>}
            <p className="mt-1">Changed your mind or want something different? <PortalLink href={`${base}?tab=messages`}>Send us a message</PortalLink>.</p>
          </div>
        </div>
      )}
      {(current.status === "sent" || current.status === "viewed") && expired && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-[13.5px] text-amber-900">
          This quote expired on {fmtDate(current.snapshot.expiry_date)}. <PortalLink href={`${base}?tab=messages`}>Send us a message</PortalLink> and we&apos;ll refresh it for you.
        </div>
      )}

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-5 sm:px-6">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">Quote Q-{quote.number} · Version {current.version_number}</p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-ink">{current.snapshot.title ?? `Quote Q-${quote.number}`}</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              Issued {fmtDate(current.snapshot.issue_date ?? current.published_at)}
              {current.snapshot.expiry_date && ` · Valid until ${fmtDate(current.snapshot.expiry_date)}`}
            </p>
          </div>
          {expired && !open && (current.status === "sent" || current.status === "viewed")
            ? <Badge tone="slate" className="text-[12.5px]">Expired</Badge>
            : <Badge tone={qs.tone} className="text-[12.5px]">{qs.label}</Badge>}
        </div>
        <QuoteDocument snap={current.snapshot} version={current} cur={cur} />
      </Panel>

      {open && (
        <QuoteResponse
          slug={slug} eventId={e.id} versionId={current.id} versionNumber={current.version_number}
          total={money(current.total, cur)} defaultName={defaultName} businessName={businessName}
        />
      )}

      <p className="text-center text-[13px] text-ink-muted">
        Have a question about this quote? <PortalLink href={`${base}?tab=messages`}>Ask us</PortalLink>
      </p>

      {previous.length > 0 && (
        <Panel title="Previous versions" subtitle="For your records — these have been replaced and can't be accepted.">
          <ul className="divide-y divide-line border-t border-line">
            {previous.map((v) => (
              <li key={v.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 hover:bg-zinc-50 sm:px-6">
                    <span className="text-[13.5px] text-ink">
                      Version {v.version_number}
                      <span className="ml-2 text-[12.5px] text-ink-muted">sent {fmtDate(v.published_at.slice(0, 10))}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular text-[13px] text-ink">{money(v.total, cur)}</span>
                      <Badge tone={CUSTOMER_QUOTE_STATUS[v.status].tone}>{v.status === "superseded" ? "Replaced" : CUSTOMER_QUOTE_STATUS[v.status].label}</Badge>
                    </span>
                  </summary>
                  <div className="border-t border-line bg-zinc-50/50">
                    <QuoteDocument snap={v.snapshot} version={v} cur={cur} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function QuoteDocument({ snap, version, cur }: { snap: QuoteSnapshot; version: PortalVersion; cur: string }) {
  const sections = snap.sections ?? [];
  return (
    <div>
      {sections.map((s, si) => {
        const sectionOptional = !!s.optional;
        return (
          <div key={si} className="border-b border-line px-5 py-5 last:border-b-0 sm:px-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[14.5px] font-semibold text-ink">{s.title}</h3>
              {sectionOptional && <Badge tone="amber">Optional extra</Badge>}
            </div>
            {s.description && <p className="-mt-1 mb-3 whitespace-pre-wrap text-[13px] text-ink-muted">{s.description}</p>}
            <ul className="space-y-3">
              {(s.items ?? []).map((it, ii) => {
                const optional = !!it.optional || sectionOptional;
                const qty = Number(it.quantity);
                return (
                  <li key={ii} className={cn("flex gap-4", optional && "opacity-80")}>
                    {it.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-line" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink">
                        {it.name}
                        {optional && !sectionOptional && <span className="ml-2 align-middle"><Badge tone="amber">Optional</Badge></span>}
                        {it.package && <span className="ml-2 align-middle"><Badge tone="brand">Package</Badge></span>}
                      </p>
                      {it.description && <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink-muted">{it.description}</p>}
                      <p className="tabular mt-1 text-[12.5px] text-ink-faint">
                        {qty % 1 === 0 ? qty : qty.toFixed(2)}{it.unit ? ` ${it.unit}${qty === 1 ? "" : "s"}` : ""} × {money(it.unit_price, cur)}
                        {Number(it.discount_percent ?? 0) > 0 && ` · ${Number(it.discount_percent)}% off`}
                      </p>
                    </div>
                    <p className={cn("tabular shrink-0 text-[13.5px] font-medium", optional ? "text-ink-muted" : "text-ink")}>{money(it.line_total, cur)}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <div className="flex justify-end border-t border-line bg-zinc-50/60 px-5 py-5 sm:px-6">
        <dl className="tabular w-full max-w-xs space-y-1.5 text-[13.5px]">
          <div className="flex justify-between text-ink-muted"><dt>Subtotal</dt><dd>{money(version.subtotal, cur)}</dd></div>
          <div className="flex justify-between text-ink-muted"><dt>GST</dt><dd>{money(version.tax_total, cur)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-[16px] font-semibold text-ink"><dt>Total</dt><dd>{money(version.total, cur)}</dd></div>
          {sections.some((s) => s.optional || s.items?.some((i) => i.optional)) && (
            <p className="pt-1 text-right text-[11.5px] text-ink-faint">Optional extras are not included in the total.</p>
          )}
        </dl>
      </div>

      {(snap.notes || snap.terms) && (
        <div className="space-y-5 border-t border-line px-5 py-5 sm:px-6">
          {snap.notes && (
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Notes</h4>
              <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{snap.notes}</p>
            </div>
          )}
          {snap.terms && (
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Terms &amp; conditions</h4>
              <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-muted">{snap.terms}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Timeline (derived from records the customer can see — never activity_logs) */
/* ================================================================== */

function Timeline({ e, versions, quotes, invoices, payments, tz, cur, today }: {
  e: PortalEvent; versions: PortalVersion[]; quotes: PortalQuote[]; invoices: PortalInvoice[]; payments: PortalPayment[];
  tz: string; cur: string; today: string;
}) {
  type Item = { at: string; title: string; detail?: string; future?: boolean; dateOnly?: boolean; tone?: "green" | "red" };
  const items: Item[] = [{ at: e.created_at, title: "Booking created" }];
  for (const v of versions) {
    const q = quotes.find((x) => x.id === v.quote_id);
    const label = `Quote Q-${q?.number ?? ""} v${v.version_number}`;
    items.push({ at: v.published_at, title: v.version_number > 1 ? `Updated quote sent (${label})` : `Quote sent (${label})`, detail: money(v.total, cur) });
    if (v.viewed_at) items.push({ at: v.viewed_at, title: `You viewed ${label}` });
    if (v.responded_at && v.status === "accepted") items.push({ at: v.responded_at, title: `You accepted ${label}`, detail: v.accepted_by_name ? `Signed by ${v.accepted_by_name}` : undefined, tone: "green" });
    if (v.responded_at && v.status === "declined") items.push({ at: v.responded_at, title: `You declined ${label}`, tone: "red" });
  }
  for (const i of invoices) {
    if (i.status === "void") continue;
    items.push({ at: `${i.issue_date}T00:00:00Z`, dateOnly: true, title: `${INVOICE_KIND[i.kind] ?? "Invoice"} ${i.number ?? ""} issued`.trim(), detail: `${money(i.total, cur)}${i.due_date ? ` · due ${fmtDate(i.due_date)}` : ""}` });
    if (i.due_date && isOpenInvoice(i) && i.due_date >= today) items.push({ at: `${i.due_date}T00:00:00Z`, dateOnly: true, title: `${INVOICE_KIND[i.kind] ?? "Invoice"} ${i.number ?? ""} due`.trim(), detail: `${money(i.balance, cur)} outstanding`, future: true });
  }
  for (const p of payments) {
    const inv = invoices.find((i) => i.id === p.invoice_id);
    items.push({ at: p.paid_at, title: `Payment received`, detail: `${money(p.amount, cur)}${inv?.number ? ` for ${inv.number}` : ""}`, tone: "green" });
  }
  if (e.status === "confirmed" || e.status === "completed") {
    const acc = versions.find((v) => v.status === "accepted");
    if (acc?.responded_at) items.push({ at: acc.responded_at, title: "Booking confirmed", tone: "green" });
  }
  if (e.event_date && e.status !== "cancelled") {
    items.push({ at: `${e.event_date}T${e.start_time ?? "12:00:00"}Z`, dateOnly: true, title: e.event_date >= today ? "Your event day" : "Event day", detail: e.start_time ? timeRange(e.start_time, e.finish_time) : undefined, future: e.event_date >= today });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Panel title="Timeline" subtitle="The key moments of your booking.">
      <ol className="relative mx-5 mb-6 border-l border-line pl-6 sm:mx-6">
        {items.map((it, i) => (
          <li key={i} className="relative pb-5 last:pb-0">
            <span className="absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center bg-white">
              {it.future ? <Circle className="h-3.5 w-3.5 text-ink-faint" /> : (
                <span className={cn("h-2.5 w-2.5 rounded-full", it.tone === "green" ? "bg-emerald-500" : it.tone === "red" ? "bg-rose-500" : "bg-[var(--portal-brand)]")} />
              )}
            </span>
            <p className={cn("text-[13.5px] font-medium", it.future ? "text-ink-muted" : "text-ink")}>{it.title}</p>
            <p className="text-[12.5px] text-ink-faint">
              {it.dateOnly ? fmtDate(it.at.slice(0, 10)) : fmtDateTime(it.at, tz, "date")}
              {it.detail && <span className="text-ink-muted"> · {it.detail}</span>}
              {it.future && " · upcoming"}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* ================================================================== */
/* Documents                                                           */
/* ================================================================== */

async function Documents({ slug, e, orgId, docs, supabase, tz }: {
  slug: string; e: PortalEvent; orgId: string; docs: PortalDocument[]; tz: string;
  supabase: Awaited<ReturnType<typeof requirePortal>>["supabase"];
}) {
  const requested = docs.filter((d) => d.requested_from_customer && d.event_id === e.id);
  const files = docs.filter((d) => !d.requested_from_customer);
  const links = new Map<string, string>();
  await Promise.all(
    files.filter((d) => d.storage_path).map(async (d) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.storage_path!, 60 * 60, { download: d.name });
      if (data?.signedUrl) links.set(d.id, data.signedUrl);
    })
  );

  return (
    <>
      {requested.length > 0 && (
        <Panel title="Requested from you" subtitle="Please upload these so we can finalise your booking.">
          <ul className="divide-y divide-line border-t border-line">
            {requested.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100"><FileText className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-ink">{d.name}</p>
                    <p className="text-[12px] text-ink-faint">Requested {relative(d.created_at)}</p>
                  </div>
                </div>
                <UploadButton slug={slug} eventId={e.id} orgId={orgId} customerId={e.customer_id} requestId={d.id} requestName={d.name} label="Upload file" />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title="Your documents"
        subtitle="Files we've shared with you, and anything you've sent us."
        action={<UploadButton slug={slug} eventId={e.id} orgId={orgId} customerId={e.customer_id} requestId={null} label="Send a file" />}
      >
        {files.length === 0 ? (
          <p className="border-t border-line px-5 py-8 text-center text-[13px] text-ink-muted sm:px-6">No documents yet.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {files.map((d) => {
              const href = links.get(d.id);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-ink-faint" />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] text-ink">{d.name}</p>
                      <p className="text-[12px] text-ink-faint">
                        {d.size_bytes ? `${d.size_bytes >= 1048576 ? (d.size_bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(d.size_bytes / 1024)) + " KB"} · ` : ""}
                        {fmtDateTime(d.updated_at ?? d.created_at, tz, "date")}
                        {!d.event_id && " · for all your bookings"}
                      </p>
                    </div>
                  </div>
                  {href ? (
                    <a href={href} className={portalButton("secondary", "h-9 shrink-0 text-[13px]")}><Download className="h-4 w-4" />Download</a>
                  ) : (
                    <span className="shrink-0 text-[12px] text-ink-faint">Not available</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

/* ================================================================== */
/* Payments                                                            */
/* ================================================================== */

function Payments({ invoices, payments, cur, tz }: { invoices: PortalInvoice[]; payments: PortalPayment[]; cur: string; tz: string }) {
  const live = invoices.filter((i) => i.status !== "void");
  const outstanding = live.reduce((s, i) => s + (isOpenInvoice(i) ? Number(i.balance) : 0), 0);
  const paid = live.reduce((s, i) => s + Number(i.amount_paid), 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">Outstanding</p>
          <p className="tabular mt-1 text-[22px] font-semibold text-ink">{money(outstanding, cur)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">Paid so far</p>
          <p className="tabular mt-1 text-[22px] font-semibold text-ink">{money(paid, cur)}</p>
        </div>
      </div>

      <Panel title="Invoices">
        {invoices.length === 0 ? (
          <p className="border-t border-line px-5 py-8 text-center text-[13px] text-ink-muted sm:px-6">No invoices yet. Once your quote is accepted, your invoice will appear here.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {invoices.map((i) => {
              const s = CUSTOMER_INVOICE_STATUS[i.status];
              const open = isOpenInvoice(i);
              return (
                <li key={i.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-medium text-ink">{INVOICE_KIND[i.kind] ?? "Invoice"} {i.number}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-muted">
                        Issued {fmtDate(i.issue_date)}{i.due_date && ` · Due ${fmtDate(i.due_date)}`}
                      </p>
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <dl className="tabular mt-3 grid grid-cols-3 gap-3 text-[13px]">
                    <div><dt className="text-[11.5px] text-ink-faint">Total (incl. GST)</dt><dd className="text-ink">{money(i.total, i.currency || cur)}</dd></div>
                    <div><dt className="text-[11.5px] text-ink-faint">Paid</dt><dd className="text-ink">{money(i.amount_paid, i.currency || cur)}</dd></div>
                    <div><dt className="text-[11.5px] text-ink-faint">Balance</dt><dd className="font-semibold text-ink">{money(i.balance, i.currency || cur)}</dd></div>
                  </dl>
                  {open && (
                    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-zinc-50 p-3">
                      <button type="button" disabled className={portalButton("primary", "h-9 text-[13px]")} title="Online payment coming soon">
                        Pay now
                      </button>
                      <p className="text-[12.5px] text-ink-muted">
                        Online payment coming soon — pay by bank transfer using invoice number <strong className="text-ink">{i.number}</strong> as the reference.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Payments received">
        {payments.length === 0 ? (
          <p className="border-t border-line px-5 py-8 text-center text-[13px] text-ink-muted sm:px-6">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-medium sm:px-6">Date</th>
                  <th className="px-3 py-2.5 font-medium">Invoice</th>
                  <th className="px-3 py-2.5 font-medium">Method</th>
                  <th className="px-5 py-2.5 text-right font-medium sm:px-6">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-ink sm:px-6">{fmtDateTime(p.paid_at, tz, "date")}</td>
                    <td className="px-3 py-3 text-ink-muted">{invoices.find((i) => i.id === p.invoice_id)?.number ?? "—"}</td>
                    <td className="px-3 py-3 capitalize text-ink-muted">{p.method?.replace(/_/g, " ") ?? "—"}{p.reference && <span className="normal-case text-ink-faint"> · {p.reference}</span>}</td>
                    <td className="tabular px-5 py-3 text-right font-medium text-ink sm:px-6">{money(p.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ================================================================== */
/* Messages                                                            */
/* ================================================================== */

function Messages({ slug, e, messages, businessName, tz }: { slug: string; e: PortalEvent; messages: MessageRow[]; businessName: string; tz: string }) {
  return (
    <Panel title="Messages" subtitle={`Your conversation with ${businessName} about this booking.`}>
      <div className="space-y-3 border-t border-line px-5 py-5 sm:px-6">
        {messages.length === 0 && <p className="py-4 text-center text-[13px] text-ink-muted">No messages yet. Ask us anything about your booking.</p>}
        {messages.map((m) => {
          const mine = m.author_type === "customer";
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5",
                mine ? "rounded-br-md bg-[var(--portal-brand)] text-[color:var(--portal-brand-fg)]" : "rounded-bl-md bg-zinc-100 text-ink"
              )}>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{m.body}</p>
                <p className={cn("mt-1 text-[11px]", mine ? "opacity-75" : "text-ink-faint")}>
                  {mine ? "You" : businessName} · {fmtDateTime(m.created_at, tz)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-line px-5 py-5 sm:px-6">
        <MessageForm slug={slug} eventId={e.id} />
      </div>
    </Panel>
  );
}
