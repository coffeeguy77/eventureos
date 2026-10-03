import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { requireOrg, getMembers } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NextActionBanner } from "@/components/records/next-action";
import { cleanSections, templateTotals } from "@/lib/quotes/templates";
import type { TemplateChoice } from "@/components/quotes/template-picker";
import type { DrawerThread } from "@/components/quotes/email-drawer";
import { QuoteBuilder, DuplicateButton } from "@/components/quotes/builder";
import { loadBillTo } from "@/lib/customers/bill-to";
import type { PricingPackage } from "@/components/quotes/price-job";
import type { PricedService } from "@/lib/pricing/engine";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { QuoteAttachments } from "@/components/quotes/attachments";
import { VersionHistory } from "@/components/quotes/version-history";
import { SentHistory, type SentEmail } from "@/components/quotes/sent-history";
import { quoteNextAction } from "@/components/quotes/next-action";
import type { CatalogueItem, QItem, QSection, QuoteDoc, QuoteSnapshotData, VersionInfo } from "@/components/quotes/types";
import { QUOTE_STATUS } from "@/lib/status";
import { fmtDate, fmtDateTime, money, todayISO } from "@/lib/format";
import type { EventStatus, QuoteStatus } from "@/lib/types";

export const metadata = { title: "Quote" };

interface QuoteRow {
  id: string; number: number; title: string; status: QuoteStatus; issue_date: string; expiry_date: string | null;
  notes: string | null; terms: string | null; has_unpublished_changes: boolean; current_version_id: string | null;
  discount_type: "percent" | "amount" | null; discount_value: number; discount_label: string | null;
  event: { id: string; number: number; name: string; event_date: string | null; start_time: string | null; finish_time: string | null; guest_count: number | null; status: EventStatus; primary_contact_id: string | null } | null;
  customer: { id: string; name: string } | null;
}

const VERSION_COLS = "id, version_number, status, subtotal, tax_total, total, published_at, published_by, viewed_at, responded_at, accepted_by_name, acceptance_ip, decline_reason";

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; reply?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const tz = org.timezone;
  const cur = org.currency;
  const today = todayISO(tz);

  const { data: qData, error } = await supabase
    .from("quotes")
    .select("id, number, title, status, issue_date, expiry_date, notes, terms, has_unpublished_changes, current_version_id, discount_type, discount_value, discount_label, event:events(id, number, name, event_date, start_time, finish_time, guest_count, status, primary_contact_id), customer:customers(id, name)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Could not load the quote: ${error.message}`);
  if (!qData) notFound();
  const q = qData as unknown as QuoteRow;
  if (!q.event || !q.customer) throw new Error("This quote's event or customer could not be loaded.");
  const billTo = await loadBillTo(supabase, org.id, q.customer.id, q.event.primary_contact_id).catch(() => null);

  const [sectionsRes, itemsRes, versionsRes, docsRes, catRes, members, gmailRes, ruleRes, contactRes, svcRes, pkgRes, sendsRes, tplRes] = await Promise.all([
    supabase.from("quote_sections").select("id, title, description, position, is_optional").eq("organisation_id", org.id).eq("quote_id", q.id).order("position").order("created_at"),
    supabase.from("quote_items").select("id, section_id, name, description, quantity, unit, unit_price, tax_rate, discount_percent, discount_amount, is_optional, is_package, image_url, position, service_id, details").eq("organisation_id", org.id).eq("quote_id", q.id).order("position").order("created_at"),
    supabase.from("quote_versions").select(VERSION_COLS).eq("organisation_id", org.id).eq("quote_id", q.id).order("version_number", { ascending: false }),
    supabase.from("documents").select("id, name, storage_path, mime_type, size_bytes, created_at").eq("organisation_id", org.id).eq("quote_id", q.id).order("created_at", { ascending: false }),
    supabase.from("quote_items").select("name, description, unit, unit_price, tax_rate, is_package, image_url, updated_at").eq("organisation_id", org.id).neq("name", "").order("updated_at", { ascending: false }).limit(1000),
    getMembers(org.id),
    supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle(),
    supabase.from("automation_rules").select("enabled").eq("organisation_id", org.id).eq("trigger_type", "quote.accepted").eq("enabled", true).limit(1),
    q.event.primary_contact_id
      ? supabase.from("contacts").select("first_name, last_name").eq("id", q.event.primary_contact_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("services").select("id, code, name, description, unit, unit_price, tax_rate, category").eq("organisation_id", org.id).eq("active", true).order("position").order("name"),
    supabase.from("service_packages").select("id, name, summary, rules").eq("organisation_id", org.id).eq("active", true).order("position").order("name"),
    supabase.from("email_sends")
      .select("id, version_number, subject, message, sent_at, sent_by, channel, from_email, recipients:email_send_recipients(id, email, name, role, token, status, status_at, error, email_opened_at, first_viewed_at, last_viewed_at, view_count, views:document_link_views(viewed_at, city, region, country, user_agent))")
      .eq("organisation_id", org.id).eq("quote_id", q.id).order("sent_at", { ascending: false }).limit(50),
    supabase.from("quote_templates").select("id, name, summary, sections").eq("organisation_id", org.id).eq("active", true).order("position").order("name"),
  ]);
  if (sendsRes.error) throw new Error(`Could not load sent emails: ${sendsRes.error.message}`);
  for (const r of [sectionsRes, itemsRes, versionsRes, docsRes, catRes, svcRes, pkgRes]) {
    if (r.error) throw new Error(`Could not load the quote: ${r.error.message}`);
  }

  const sections = (sectionsRes.data ?? []) as QSection[];
  const items = ((itemsRes.data ?? []) as QItem[]).map((i) => ({
    ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate), discount_percent: Number(i.discount_percent), discount_amount: Number(i.discount_amount ?? 0),
  }));
  const versions = ((versionsRes.data ?? []) as VersionInfo[]).map((v) => ({ ...v, total: Number(v.total), subtotal: Number(v.subtotal), tax_total: Number(v.tax_total) }));
  const docs = (docsRes.data ?? []) as QuoteDoc[];
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const currentVersion = versions.find((v) => v.id === q.current_version_id) ?? null;

  // Reusable catalogue: the price list first, then distinct past item names (most recent price wins)
  const services: (PricedService & { category: string | null })[] = (svcRes.data ?? []).map((r) => ({ ...r, unit_price: Number(r.unit_price), tax_rate: Number(r.tax_rate) }));
  const packages = (pkgRes.data ?? []) as PricingPackage[];
  // Templates (null until the database update adds the table)
  const templates: TemplateChoice[] | null = tplRes.error ? null : ((tplRes.data ?? []) as { id: string; name: string; summary: string | null; sections: unknown }[]).map((t) => {
    const secs = cleanSections(t.sections);
    const names = new Map(services.map((x) => [x.id, x.name]));
    return {
      id: t.id, name: t.name, summary: t.summary, total: templateTotals(secs, services).total,
      lines: secs.flatMap((sec) => sec.items.map((i) => `${i.service_id ? names.get(i.service_id) ?? "(removed)" : i.name ?? "Item"}${i.quantity !== 1 ? ` × ${i.quantity}` : ""}`)).join(", "),
    };
  });
  const seen = new Set<string>(services.map((r) => r.name.trim().toLowerCase()));
  const priceList: CatalogueItem[] = services.map((r) => ({ service_id: r.id, category: (r as { category?: string | null }).category ?? null, name: r.name, description: r.description, unit: r.unit, unit_price: r.unit_price, tax_rate: r.tax_rate, is_package: false, image_url: null }));
  const catalogue: CatalogueItem[] = [];
  for (const r of (catRes.data ?? []) as (CatalogueItem & { updated_at: string })[]) {
    const key = r.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    catalogue.push({ name: r.name.trim(), description: r.description, unit: r.unit, unit_price: Number(r.unit_price), tax_rate: Number(r.tax_rate), is_package: r.is_package, image_url: r.image_url });
  }
  catalogue.sort((a, b) => a.name.localeCompare(b.name));
  catalogue.unshift(...priceList);

  const settings = (org.settings ?? {}) as { quote_acceptance_action?: string; deposit_percent?: number; quote_follow_up_days?: number; booking_approval?: string; booking_approval_days?: number };
  const ruleOn = (ruleRes.data ?? []).length > 0;
  const action = settings.quote_acceptance_action ?? "deposit_invoice";
  const acceptanceNote = ruleOn
    ? `Recording acceptance runs your “Quote accepted” automation: the event is confirmed and added to the calendar${action === "deposit_invoice" ? `, and a ${settings.deposit_percent ?? 30}% deposit invoice is raised` : action === "full_invoice" ? ", and the full invoice is raised" : ""}.`
    : "Your “Quote accepted” automation is switched off, so the event won’t be confirmed or invoiced automatically.";
  const approvalNote = settings.booking_approval === "all" ? " Every booking waits for an owner or admin to approve it first."
    : settings.booking_approval === "short_notice" ? ` If the event is within ${settings.booking_approval_days ?? 2} days, it waits for an owner or admin to approve it first.` : "";
  const contact = contactRes.data as { first_name: string; last_name: string | null } | null;
  const signerName = contact ? `${contact.first_name} ${contact.last_name ?? ""}`.trim() : "";

  const na = quoteNextAction({ ...q, itemCount: items.length }, currentVersion?.published_at ?? null, today, settings.quote_follow_up_days ?? 3);
  const locked = q.status === "accepted";
  const viewN = sp.version ? Number(sp.version) : null;
  const viewing = viewN != null && Number.isInteger(viewN) ? versions.find((v) => v.version_number === viewN) ?? null : null;

  const sends = ((sendsRes.data ?? []) as unknown as SentEmail[]).map((s) => ({
    ...s, recipients: s.recipients.map((r) => ({ ...r, views: [...(r.views ?? [])].sort((a, b) => b.viewed_at.localeCompare(a.viewed_at)) })),
  }));
  const history = (
    <>
      <SentHistory sends={sends} tz={tz} names={names} trackingOn={Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim())} />
      <VersionHistory quoteId={q.id} versions={versions} currentVersionId={q.current_version_id} activeNumber={viewing?.version_number ?? null}
        currency={cur} tz={tz} names={names} />
    </>
  );

  // ------------------------------------------------------------------ read-only: a specific version, or an accepted (locked) quote
  if (viewing || locked) {
    const shown = viewing ?? currentVersion;
    const { data: qi } = locked ? await supabase.from("invoices").select("id, number").eq("organisation_id", org.id).eq("quote_id", q.id).neq("status", "void").order("created_at", { ascending: false }).limit(1) : { data: null };
    const quoteInvoice = (qi?.[0] as { id: string; number: string } | undefined) ?? null;
    let snap: QuoteSnapshotData | null = null;
    if (shown) {
      const { data: sv, error: sErr } = await supabase.from("quote_versions").select("snapshot").eq("id", shown.id).single();
      if (sErr) throw new Error(`Could not load version ${shown.version_number}: ${sErr.message}`);
      snap = { ...(sv.snapshot as QuoteSnapshotData), subtotal: shown.subtotal, tax_total: shown.tax_total, total: shown.total };
    }
    const s = QUOTE_STATUS[q.status];
    return (
      <div>
        <div className="mb-5">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[0.75rem] text-ink-faint">
            <Link href="/quotes" className="hover:text-ink">Quotes</Link><span>/</span>
            {viewing ? <Link href={`/quotes/${q.id}`} className="tabular hover:text-ink">Q-{q.number}</Link> : <span className="tabular">Q-{q.number}</span>}
            {viewing && <><span>/</span><span>Version {viewing.version_number}</span></>}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1 basis-72">
              <h1 className="break-words text-[1.25rem] font-semibold tracking-tight text-ink sm:text-[1.375rem]">{q.title}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-muted">
                <Badge tone={s.tone} dot>{s.label}</Badge>
                <Link href={`/clients/${q.customer.id}`} className="font-medium text-ink hover:text-brand-700">{q.customer.name}</Link>
                <Link href={`/events/${q.event.id}?tab=quote`} className="min-w-0 break-words hover:text-brand-700">EV-{q.event.number} · {q.event.name}{q.event.event_date ? ` · ${fmtDate(q.event.event_date)}` : ""}</Link>
                <span>Issued {fmtDate(q.issue_date)}</span>
                <span>Expires {fmtDate(q.expiry_date)}</span>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
              {viewing && !locked && (
                <Link href={`/quotes/${q.id}`} className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg sm:h-9 bg-surface px-3.5 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">
                  <ArrowLeft className="h-4 w-4" />Back to draft
                </Link>
              )}
              {locked && !viewing && ["owner", "admin", "manager"].includes(role) && (
                <Link href={quoteInvoice ? `/invoices/${quoteInvoice.id}` : `/invoices/new?quote=${q.id}`} className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-600 px-3.5 text-[0.8125rem] font-medium text-on-brand hover:bg-brand-700 sm:h-9">
                  {quoteInvoice ? `Invoice ${quoteInvoice.number}` : "Create invoice"}
                </Link>
              )}
              <DuplicateButton quoteId={q.id} variant="button" />
            </div>
          </div>
        </div>

        {locked && currentVersion && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3.5 sm:px-5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div className="text-[0.8125rem] text-emerald-900">
              <p className="font-semibold">Accepted{currentVersion.accepted_by_name ? ` by ${currentVersion.accepted_by_name}` : ""} on {fmtDateTime(currentVersion.responded_at, tz)} — this quote is locked.</p>
              <p className="mt-0.5 text-emerald-800">Version {currentVersion.version_number} is the agreed quote and can’t be edited. To change anything, duplicate it as a new quote and send that instead.</p>
            </div>
          </div>
        )}
        {viewing && (
          <div className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-[0.8125rem] text-ink-muted sm:px-5">
            You’re viewing <span className="font-medium text-ink">version {viewing.version_number}</span> exactly as it was sent on {fmtDateTime(viewing.published_at, tz)}.
            {viewing.id === q.current_version_id ? " This is the version the customer currently sees." : " A newer version has replaced it."}
          </div>
        )}
        {!viewing && <NextActionBanner action={na} />}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            {snap ? (
              <QuoteDocument snap={snap} currency={cur} orgName={org.name} logoUrl={org.logo_url} quoteNumber={q.number} customerName={q.customer.name} billTo={billTo}
                eventLabel={`${q.event.name}${q.event.event_date ? ` · ${fmtDate(q.event.event_date, "long")}` : ""}`} eventDate={q.event.event_date ?? null}
                versionLabel={shown ? String(shown.version_number) : undefined} />
            ) : (
              <Card><p className="px-5 py-6 text-[0.8125rem] text-ink-muted">This version could not be found.</p></Card>
            )}
            {!viewing && (
              <Card>
                <CardHeader title="Attachments" subtitle="Shared with the customer in their portal" />
                <QuoteAttachments quoteId={q.id} orgId={org.id} initial={docs} />
              </Card>
            )}
          </div>
          <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">{history}</div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ editable draft
  // Is the booking already on the calendar? (for the one-click "Add to calendar")
  const { data: onCal } = await supabase.from("calendar_events").select("id").eq("organisation_id", org.id).eq("event_id", q.event.id).eq("kind", "event").limit(1);
  // The client's people: who's on this job (ticked when emailing) and everyone else on file
  const [{ data: jcRows }, { data: allPeople }] = await Promise.all([
    supabase.from("event_contacts").select("id, contact_id").eq("organisation_id", org.id).eq("event_id", q.event.id),
    supabase.from("contacts").select("id, first_name, last_name, email").eq("organisation_id", org.id).eq("customer_id", q.customer.id).order("first_name"),
  ]);
  const personName = (c: { first_name: string; last_name: string | null }) => `${c.first_name} ${c.last_name ?? ""}`.trim();
  const clientPeople = ((allPeople ?? []) as { id: string; first_name: string; last_name: string | null; email: string | null }[]).map((c) => ({ id: c.id, name: personName(c), email: c.email }));
  const links = (jcRows ?? []) as { id: string; contact_id: string }[];
  const jobPeople = clientPeople.filter((c) => links.some((l) => l.contact_id === c.id) || c.id === q.event!.primary_contact_id)
    .map((c) => ({ linkId: links.find((l) => l.contact_id === c.id)?.id ?? "", contactId: c.id, name: c.name, email: c.email, main: c.id === q.event!.primary_contact_id }))
    .sort((a, b) => Number(b.main) - Number(a.main));
  // The client's quotes in Xero (newest first) — can be brought in and edited here
  const { data: xqRows } = await supabase.from("xero_quotes").select("id, number, reference, status, quote_date, total, line_items")
    .eq("organisation_id", org.id).eq("customer_id", q.customer.id).neq("status", "DELETED").order("quote_date", { ascending: false, nullsFirst: false }).limit(20);
  const xeroQuotes = ((xqRows ?? []) as { id: string; number: string | null; reference: string | null; status: string; quote_date: string | null; total: number; line_items: { description?: string | null }[] | null }[])
    .map((x) => ({ id: x.id, number: x.number ?? "Xero quote", reference: x.reference, status: x.status, date: x.quote_date, total: Number(x.total ?? 0),
      lines: (x.line_items ?? []).filter((l) => (l.description ?? "").trim()).length }));
  // The client's special pricing (shown as a note, with "apply" for lines added before it was set)
  const { data: cpRows } = await supabase.from("customer_prices").select("service_id, kind, value, service:services(name)").eq("organisation_id", org.id).eq("customer_id", q.customer.id);
  const customerPricing = ((cpRows ?? []) as unknown as { service_id: string; kind: "percent" | "price"; value: number; service: { name: string } | null }[])
    .map((r) => `${r.kind === "percent" ? `${Number(r.value)}% off` : `${money(Number(r.value), cur)}`} ${r.service?.name ?? "item"}`);

  // The job's email conversations (event + its original enquiry), shown beside the quote while pricing
  const { data: evLink } = await supabase.from("events").select("enquiry_id").eq("id", q.event.id).maybeSingle();
  const threadFilter = [`event_id.eq.${q.event.id}`, evLink?.enquiry_id ? `enquiry_id.eq.${evLink.enquiry_id}` : null].filter(Boolean).join(",");
  const { data: thr } = await supabase.from("email_threads").select("id, subject, last_message_at").eq("organisation_id", org.id).or(threadFilter)
    .neq("classification", "spam").order("last_message_at", { ascending: false }).limit(6);
  const thrIds = (thr ?? []).map((x) => x.id as string);
  const { data: thrMsgs } = thrIds.length
    ? await supabase.from("email_messages").select("id, thread_id, direction, from_name, from_email, sent_at, body_text, snippet").in("thread_id", thrIds).order("sent_at", { ascending: false }).limit(60)
    : { data: [] };
  const emailThreads: DrawerThread[] = ((thr ?? []) as { id: string; subject: string | null }[]).map((x) => ({
    id: x.id, subject: x.subject ?? "(no subject)",
    messages: ((thrMsgs ?? []) as { id: string; thread_id: string; direction: "inbound" | "outbound"; from_name: string | null; from_email: string; sent_at: string; body_text: string | null; snippet: string | null }[])
      .filter((m) => m.thread_id === x.id)
      .map((m) => ({ id: m.id, direction: m.direction, from: m.from_name ?? m.from_email, at: m.sent_at, body: (m.body_text ?? m.snippet ?? "").slice(0, 20000) })),
  })).filter((x) => x.messages.length);

  // Opened from "Reply with quote" on an email conversation linked to this event (or its enquiry)
  let replyTo: { threadId: string; subject: string; backHref: string } | null = null;
  if (sp.reply && /^[0-9a-f-]{36}$/i.test(sp.reply)) {
    const { data: ev } = await supabase.from("events").select("enquiry_id").eq("id", q.event.id).maybeSingle();
    const { data: t } = await supabase.from("email_threads").select("id, subject, event_id, enquiry_id")
      .eq("organisation_id", org.id).eq("id", sp.reply).maybeSingle();
    if (t && (t.event_id === q.event.id || (ev?.enquiry_id && t.enquiry_id === ev.enquiry_id))) {
      replyTo = { threadId: t.id, subject: t.subject ?? "(no subject)", backHref: t.enquiry_id ? `/enquiries/${t.enquiry_id}` : `/events/${q.event.id}` };
    }
  }

  return (
    <QuoteBuilder
      key={q.id}
      replyTo={replyTo}
      templates={templates}
      emails={emailThreads}
      customerPricing={customerPricing}
      quote={{
        id: q.id, number: q.number, title: q.title, status: q.status, issue_date: q.issue_date, expiry_date: q.expiry_date,
        notes: q.notes, terms: q.terms, has_unpublished_changes: q.has_unpublished_changes, current_version_id: q.current_version_id,
        discount_type: q.discount_type, discount_value: Number(q.discount_value ?? 0), discount_label: q.discount_label,
      }}
      currentVersion={currentVersion}
      sections={sections}
      items={items}
      catalogue={catalogue}
      docs={docs}
      orgId={org.id}
      orgName={org.name}
      orgLogo={org.logo_url}
      onCalendar={!!onCal?.length}
      xeroQuotes={xeroQuotes}
      billTo={billTo}
      jobPeople={jobPeople}
      canAdminAccept={["owner", "admin", "manager"].includes(role)}
      clientPeople={clientPeople}
      currency={cur}
      tz={tz}
      today={today}
      customer={{ id: q.customer.id, name: q.customer.name }}
      event={{ id: q.event.id, number: q.event.number, name: q.event.name, event_date: q.event.event_date }}
      signerName={signerName}
      acceptanceNote={acceptanceNote + approvalNote}
      gmailConnected={gmailRes.data?.status === "connected"}
      nextAction={<NextActionBanner action={na} />}
      history={history}
      pricing={{ packages, services, defaults: { start: q.event.start_time, end: q.event.finish_time, guests: q.event.guest_count } }}
    />
  );
}
