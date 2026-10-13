import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Mail, Phone, XCircle, Coffee, ArrowRight } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { QuoteDocument } from "@/components/quotes/quote-document";
import type { QuoteSnapshotData } from "@/components/quotes/types";
import { brandVars } from "@/app/p/[slug]/portal-data";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { LinkResponse, PrintButton, ViewBeacon } from "./client";
import { readShop } from "@/lib/shop/core";
import { loadCustomerEdit } from "@/lib/quotes/customer-edit-server";
import { CustomerChange } from "@/components/quotes/customer-change";

import { loadBillTo } from "@/lib/customers/bill-to";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your quote", robots: { index: false, follow: false }, referrer: "no-referrer" };

interface LinkData {
  recipient: { name: string | null; email: string; role: "to" | "copy" };
  quote: { id: string; number: number; status: string; expiry_date: string | null; expired: boolean };
  version: { id: string; number: number; status: string; snapshot: QuoteSnapshotData; subtotal: number; tax_total: number; total: number;
    published_at: string; responded_at: string | null; accepted_by_name: string | null; decline_reason: string | null };
  org: { name: string; logo_url: string | null; brand_colour: string | null; contact_email: string | null; contact_phone: string | null;
    website: string | null; currency: string | null; timezone: string | null; booking_approval: string; approval_on_accept: boolean };
  event: { id: string; name: string; event_date: string | null; venue: string | null } | null;
  customer: { name: string } | null;
}

const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");

export default async function QuoteLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { token } = await params;
  const wantPreview = (await searchParams).preview === "1";
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const { data, error } = await createServiceClient().rpc("quote_link_get", { p_token: token });
  if (error) throw new Error("This quote couldn't be loaded. Please try again shortly.");
  if (!data) notFound();
  const d = data as LinkData;
  // The client's details for "Prepared for" (the link's token is already checked above)
  const billTo = await (async () => {
    const db = createServiceClient();
    const { data: qr } = await db.from("quotes").select("organisation_id, customer_id, event:events(primary_contact_id)").eq("id", d.quote.id).maybeSingle();
    if (!qr) return null;
    return loadBillTo(db, qr.organisation_id, qr.customer_id, (qr.event as unknown as { primary_contact_id: string | null } | null)?.primary_contact_id ?? null).catch(() => null);
  })();
  // Coffee shop: equipment-hire / event customers can add bags of coffee, delivered with their booking
  const coffee = await (async () => {
    if (!d.event || d.quote.expired) return null;
    const db = createServiceClient();
    const { data: qr } = await db.from("quotes").select("organisation:organisations(slug, settings)").eq("id", d.quote.id).maybeSingle();
    const o = qr?.organisation as unknown as { slug: string; settings: unknown } | null;
    if (!o) return null;
    const shop = readShop(o.settings);
    if (!shop.enabled || !shop.eventAddon) return null;
    return { href: `/shop/${o.slug}?event=${token}`, roastNote: shop.roastNote };
  })().catch(() => null);
  const cur = d.org.currency || "AUD";
  const tz = d.org.timezone || "Australia/Sydney";
  const v = d.version;
  const snap: QuoteSnapshotData = { ...v.snapshot, subtotal: Number(v.subtotal), tax_total: Number(v.tax_total), total: Number(v.total) };
  const total = money(v.total, cur, { cents: true });
  const open = (v.status === "sent" || v.status === "viewed") && !d.quote.expired;
  // ?preview=1 opened by the business (signed in): exactly what the customer sees, but nothing is recorded or saved
  const preview = wantPreview && await (async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: q } = await createServiceClient().from("quotes").select("organisation_id").eq("id", d.quote.id).maybeSingle();
    const { data: m } = await supabase.from("organisation_users").select("role").eq("user_id", user.id).eq("organisation_id", q?.organisation_id ?? "").eq("status", "active").maybeSingle();
    return !!m && ["owner", "admin", "manager", "staff"].includes(m.role as string);
  })().catch(() => false);
  const isCopy = d.recipient.role === "copy" || preview;
  // Can they change the catering / drinks themselves? (Settings → Automations; on unless switched off)
  const edit = open && (!isCopy || preview) ? await loadCustomerEdit(createServiceClient(), token).catch(() => null) : null;

  return (
    <main style={brandVars(safeColour(d.org.brand_colour))} className="min-h-screen bg-canvas [color-scheme:light] print:bg-white">
      <div className="h-1 bg-[var(--portal-brand)] print:hidden" />
      {!isCopy && <ViewBeacon token={token} />}
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        {/* The logo is at the top of the quote itself (so it prints); just the print button up here */}
        <header className="mb-4 flex justify-end print:hidden">
          <PrintButton />
        </header>

        {preview ? (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-200 print:hidden">
            <b>Preview — this is exactly what {d.recipient.name || d.recipient.email} sees.</b> Opening it isn&apos;t counted as them viewing it.
            You can try &ldquo;Change your order&rdquo;, but nothing is saved, and the quote can&apos;t be accepted from here.
          </p>
        ) : isCopy && (
          <p className="mb-4 rounded-xl bg-zinc-100 px-4 py-3 text-[0.8125rem] text-ink-muted print:hidden">
            This is the sender&apos;s copy. Opening it isn&apos;t counted as the customer viewing the quote, and it can&apos;t be accepted from here.
          </p>
        )}
        {v.status === "accepted" && (
          <Banner tone="ok" icon={<CheckCircle2 className="h-5 w-5" />}>
            Accepted{v.accepted_by_name ? ` by ${v.accepted_by_name}` : ""} on {fmtDateTime(v.responded_at, tz)}. Thank you!
          </Banner>
        )}
        {v.status === "declined" && (
          <Banner tone="muted" icon={<XCircle className="h-5 w-5" />}>
            Declined on {fmtDateTime(v.responded_at, tz)}. If you&apos;ve changed your mind, please contact {d.org.name}.
          </Banner>
        )}
        {d.quote.expired && open === false && v.status !== "accepted" && v.status !== "declined" && (
          <Banner tone="warn" icon={<Clock className="h-5 w-5" />}>
            This quote expired on {fmtDate(d.quote.expiry_date, "long")}. Please contact {d.org.name} for an updated quote.
          </Banner>
        )}

        <QuoteDocument snap={snap} currency={cur} orgName={d.org.name} logoUrl={d.org.logo_url} quoteNumber={d.quote.number} customerName={d.customer?.name} billTo={billTo}
          eventLabel={d.event ? `${d.event.name}${d.event.event_date ? ` · ${fmtDate(d.event.event_date, "long")}` : ""}${d.event.venue ? ` · ${d.event.venue}` : ""}` : undefined}
          eventDate={d.event ? d.event.event_date ?? null : undefined}
          versionLabel={v.number > 1 ? String(v.number) : undefined} />

        {edit?.ok && (!edit.data.busy || preview) && (
          <div className="mt-6">
            <CustomerChange token={token} preview={preview} currency={cur} businessName={d.org.name} catalogue={edit.data.catalogue}
              lines={edit.data.lines.filter((l) => !l.is_optional).map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, tax_rate: l.tax_rate, editable: l.editable, section: l.section }))} />
          </div>
        )}

        {open && !isCopy && (
          <div className="mt-6">
            <LinkResponse token={token} versionNumber={v.number} total={total} defaultName={d.recipient.name ?? ""} businessName={d.org.name}
              needsApproval={d.org.approval_on_accept} />
          </div>
        )}

        {coffee && (
          <a href={coffee.href} className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-[#1d1915] p-5 text-white transition hover:brightness-110 print:hidden">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10"><Coffee className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[1rem] font-semibold">Need coffee for {d.event?.name ?? "your event"}?</span>
              <span className="block text-[0.875rem] text-white/75">Add bags of our freshly roasted coffee and we&apos;ll bring them with your booking — no shipping.</span></span>
            <span className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-white px-4 text-[0.9375rem] font-semibold text-[#1d1915]">Add coffee<ArrowRight className="h-4 w-4" /></span>
          </a>
        )}

        <footer className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-[0.8125rem] text-ink-muted">
          <span>Questions? Contact {d.org.name}:</span>
          {d.org.contact_email && <a href={`mailto:${d.org.contact_email}`} className="inline-flex items-center gap-1.5 font-medium text-[color:var(--portal-brand-ink)] hover:underline"><Mail className="h-4 w-4" />{d.org.contact_email}</a>}
          {d.org.contact_phone && <a href={`tel:${d.org.contact_phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 font-medium text-[color:var(--portal-brand-ink)] hover:underline"><Phone className="h-4 w-4" />{d.org.contact_phone}</a>}
        </footer>
      </div>
    </main>
  );
}

function Banner({ tone, icon, children }: { tone: "ok" | "warn" | "muted"; icon: React.ReactNode; children: React.ReactNode }) {
  const c = tone === "ok" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : tone === "warn" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-zinc-100 text-ink ring-line";
  return <div className={`mb-4 flex items-start gap-3 rounded-xl px-4 py-3 text-[0.875rem] ring-1 ring-inset ${c}`}><span className="mt-px shrink-0">{icon}</span><span>{children}</span></div>;
}
