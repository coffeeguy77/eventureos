import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { requireOrg, getMembers } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NextActionBanner } from "@/components/records/next-action";
import { QuoteBuilder, DuplicateButton } from "@/components/quotes/builder";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { QuoteAttachments } from "@/components/quotes/attachments";
import { VersionHistory } from "@/components/quotes/version-history";
import { quoteNextAction } from "@/components/quotes/next-action";
import type { CatalogueItem, QItem, QSection, QuoteDoc, QuoteSnapshotData, VersionInfo } from "@/components/quotes/types";
import { QUOTE_STATUS } from "@/lib/status";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/format";
import type { EventStatus, QuoteStatus } from "@/lib/types";

export const metadata = { title: "Quote" };

interface QuoteRow {
  id: string; number: number; title: string; status: QuoteStatus; issue_date: string; expiry_date: string | null;
  notes: string | null; terms: string | null; has_unpublished_changes: boolean; current_version_id: string | null;
  event: { id: string; number: number; name: string; event_date: string | null; status: EventStatus; primary_contact_id: string | null } | null;
  customer: { id: string; name: string } | null;
}

const VERSION_COLS = "id, version_number, status, subtotal, tax_total, total, published_at, published_by, viewed_at, responded_at, accepted_by_name, acceptance_ip, decline_reason";

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const tz = org.timezone;
  const cur = org.currency;
  const today = todayISO(tz);

  const { data: qData, error } = await supabase
    .from("quotes")
    .select("id, number, title, status, issue_date, expiry_date, notes, terms, has_unpublished_changes, current_version_id, event:events(id, number, name, event_date, status, primary_contact_id), customer:customers(id, name)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Could not load the quote: ${error.message}`);
  if (!qData) notFound();
  const q = qData as unknown as QuoteRow;
  if (!q.event || !q.customer) throw new Error("This quote's event or customer could not be loaded.");

  const [sectionsRes, itemsRes, versionsRes, docsRes, catRes, members, gmailRes, ruleRes, contactRes] = await Promise.all([
    supabase.from("quote_sections").select("id, title, description, position, is_optional").eq("organisation_id", org.id).eq("quote_id", q.id).order("position").order("created_at"),
    supabase.from("quote_items").select("id, section_id, name, description, quantity, unit, unit_price, tax_rate, discount_percent, is_optional, is_package, image_url, position").eq("organisation_id", org.id).eq("quote_id", q.id).order("position").order("created_at"),
    supabase.from("quote_versions").select(VERSION_COLS).eq("organisation_id", org.id).eq("quote_id", q.id).order("version_number", { ascending: false }),
    supabase.from("documents").select("id, name, storage_path, mime_type, size_bytes, created_at").eq("organisation_id", org.id).eq("quote_id", q.id).order("created_at", { ascending: false }),
    supabase.from("quote_items").select("name, description, unit, unit_price, tax_rate, is_package, image_url, updated_at").eq("organisation_id", org.id).neq("name", "").order("updated_at", { ascending: false }).limit(1000),
    getMembers(org.id),
    supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle(),
    supabase.from("automation_rules").select("enabled").eq("organisation_id", org.id).eq("trigger_type", "quote.accepted").eq("enabled", true).limit(1),
    q.event.primary_contact_id
      ? supabase.from("contacts").select("first_name, last_name").eq("id", q.event.primary_contact_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [sectionsRes, itemsRes, versionsRes, docsRes, catRes]) {
    if (r.error) throw new Error(`Could not load the quote: ${r.error.message}`);
  }

  const sections = (sectionsRes.data ?? []) as QSection[];
  const items = ((itemsRes.data ?? []) as QItem[]).map((i) => ({
    ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate), discount_percent: Number(i.discount_percent),
  }));
  const versions = ((versionsRes.data ?? []) as VersionInfo[]).map((v) => ({ ...v, total: Number(v.total), subtotal: Number(v.subtotal), tax_total: Number(v.tax_total) }));
  const docs = (docsRes.data ?? []) as QuoteDoc[];
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const currentVersion = versions.find((v) => v.id === q.current_version_id) ?? null;

  // Reusable catalogue: distinct item names, most recent price wins
  const seen = new Set<string>();
  const catalogue: CatalogueItem[] = [];
  for (const r of (catRes.data ?? []) as (CatalogueItem & { updated_at: string })[]) {
    const key = r.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    catalogue.push({ name: r.name.trim(), description: r.description, unit: r.unit, unit_price: Number(r.unit_price), tax_rate: Number(r.tax_rate), is_package: r.is_package, image_url: r.image_url });
  }
  catalogue.sort((a, b) => a.name.localeCompare(b.name));

  const settings = (org.settings ?? {}) as { quote_acceptance_action?: string; deposit_percent?: number; quote_follow_up_days?: number };
  const ruleOn = (ruleRes.data ?? []).length > 0;
  const action = settings.quote_acceptance_action ?? "deposit_invoice";
  const acceptanceNote = ruleOn
    ? `Recording acceptance runs your “Quote accepted” automation: the event is confirmed and added to the calendar${action === "deposit_invoice" ? `, and a ${settings.deposit_percent ?? 30}% deposit invoice is raised` : action === "full_invoice" ? ", and the full invoice is raised" : ""}.`
    : "Your “Quote accepted” automation is switched off, so the event won’t be confirmed or invoiced automatically.";
  const contact = contactRes.data as { first_name: string; last_name: string | null } | null;
  const signerName = contact ? `${contact.first_name} ${contact.last_name ?? ""}`.trim() : "";

  const na = quoteNextAction({ ...q, itemCount: items.length }, currentVersion?.published_at ?? null, today, settings.quote_follow_up_days ?? 3);
  const locked = q.status === "accepted";
  const viewN = sp.version ? Number(sp.version) : null;
  const viewing = viewN != null && Number.isInteger(viewN) ? versions.find((v) => v.version_number === viewN) ?? null : null;

  const history = (
    <VersionHistory quoteId={q.id} versions={versions} currentVersionId={q.current_version_id} activeNumber={viewing?.version_number ?? null}
      currency={cur} tz={tz} names={names} />
  );

  // ------------------------------------------------------------------ read-only: a specific version, or an accepted (locked) quote
  if (viewing || locked) {
    const shown = viewing ?? currentVersion;
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
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
            <Link href="/quotes" className="hover:text-ink">Quotes</Link><span>/</span>
            {viewing ? <Link href={`/quotes/${q.id}`} className="tabular hover:text-ink">Q-{q.number}</Link> : <span className="tabular">Q-{q.number}</span>}
            {viewing && <><span>/</span><span>Version {viewing.version_number}</span></>}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight text-ink">{q.title}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
                <Badge tone={s.tone} dot>{s.label}</Badge>
                <Link href={`/clients/${q.customer.id}`} className="font-medium text-ink hover:text-brand-700">{q.customer.name}</Link>
                <Link href={`/events/${q.event.id}?tab=quote`} className="hover:text-brand-700">EV-{q.event.number} · {q.event.name}{q.event.event_date ? ` · ${fmtDate(q.event.event_date)}` : ""}</Link>
                <span>Issued {fmtDate(q.issue_date)}</span>
                <span>Expires {fmtDate(q.expiry_date)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {viewing && !locked && (
                <Link href={`/quotes/${q.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-[13px] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">
                  <ArrowLeft className="h-4 w-4" />Back to draft
                </Link>
              )}
              <DuplicateButton quoteId={q.id} variant="button" />
            </div>
          </div>
        </div>

        {locked && currentVersion && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-5 py-3.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div className="text-[13px] text-emerald-900">
              <p className="font-semibold">Accepted{currentVersion.accepted_by_name ? ` by ${currentVersion.accepted_by_name}` : ""} on {fmtDateTime(currentVersion.responded_at, tz)} — this quote is locked.</p>
              <p className="mt-0.5 text-emerald-800">Version {currentVersion.version_number} is the agreed quote and can’t be edited. To change anything, duplicate it as a new quote and send that instead.</p>
            </div>
          </div>
        )}
        {viewing && (
          <div className="mb-4 rounded-xl border border-line bg-white px-5 py-3 text-[13px] text-ink-muted">
            You’re viewing <span className="font-medium text-ink">version {viewing.version_number}</span> exactly as it was sent on {fmtDateTime(viewing.published_at, tz)}.
            {viewing.id === q.current_version_id ? " This is the version the customer currently sees." : " A newer version has replaced it."}
          </div>
        )}
        {!viewing && <NextActionBanner action={na} />}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            {snap ? (
              <QuoteDocument snap={snap} currency={cur} orgName={org.name} quoteNumber={q.number} customerName={q.customer.name}
                eventLabel={`${q.event.name}${q.event.event_date ? ` · ${fmtDate(q.event.event_date, "long")}` : ""}`}
                versionLabel={shown ? String(shown.version_number) : undefined} />
            ) : (
              <Card><p className="px-5 py-6 text-[13px] text-ink-muted">This version could not be found.</p></Card>
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
  return (
    <QuoteBuilder
      key={q.id}
      quote={{
        id: q.id, number: q.number, title: q.title, status: q.status, issue_date: q.issue_date, expiry_date: q.expiry_date,
        notes: q.notes, terms: q.terms, has_unpublished_changes: q.has_unpublished_changes, current_version_id: q.current_version_id,
      }}
      currentVersion={currentVersion}
      sections={sections}
      items={items}
      catalogue={catalogue}
      docs={docs}
      orgId={org.id}
      orgName={org.name}
      currency={cur}
      tz={tz}
      today={today}
      customer={{ id: q.customer.id, name: q.customer.name }}
      event={{ id: q.event.id, number: q.event.number, name: q.event.name, event_date: q.event.event_date }}
      signerName={signerName}
      acceptanceNote={acceptanceNote}
      gmailConnected={gmailRes.data?.status === "connected"}
      nextAction={<NextActionBanner action={na} />}
      history={history}
    />
  );
}
