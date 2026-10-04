import QRCode from "qrcode";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { appBaseUrl } from "@/lib/integrations/registry";
import { readSettings, shareLink } from "@/lib/bookings/core";
import { relative } from "@/lib/format";
import { CopyField, PluginKeys, CsvImport, SettingsForm } from "@/components/bookings/website-tools";

export const dynamic = "force-dynamic";

export default async function WebsitePage() {
  const { supabase, org, role } = await requireOrg();
  const base = appBaseUrl();
  const bookUrl = `${base}/book/${org.slug}`;
  const [{ data: o }, { data: courses }, { data: keys }, { data: lastSync }] = await Promise.all([
    supabase.from("organisations").select("settings, website").eq("id", org.id).single(),
    supabase.from("booking_courses").select("slug, name").eq("organisation_id", org.id).eq("active", true).order("position"),
    supabase.from("inbound_connections").select("id, label, key_prefix, created_at, last_used_at, revoked_at").eq("organisation_id", org.id).eq("provider", "wordpress").order("created_at", { ascending: false }),
    supabase.from("bookings").select("created_at").eq("organisation_id", org.id).in("source", ["bookly", "classbento"]).order("created_at", { ascending: false }).limit(1),
  ]);
  const settings = readSettings(o?.settings);
  const links = [
    { label: "Facebook", url: shareLink(bookUrl, "facebook") },
    { label: "Instagram (link in bio / Book button)", url: shareLink(bookUrl, "instagram") },
    { label: "Google Business Profile", url: shareLink(bookUrl, "google", "local") },
    { label: "Email newsletter", url: shareLink(bookUrl, "newsletter", "email") },
  ];
  const qrUrl = shareLink(bookUrl, "qr", "print");
  const qrSvg = await QRCode.toString(qrUrl, { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" });
  const gift = `${base}/book/${org.slug}/gift`;
  const snippet = `<div data-eventureos-book="${org.slug}"></div>\n<script src="${base}/embed.js" async></script>`;
  const isAdmin = role === "owner" || role === "admin";

  return (
    <>
      <PageHeader title="Website & settings" subtitle="Your booking page, the widget for your website, social links, and how bookings work." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Your booking page</h2>
          <p className="mb-3 text-[0.8125rem] text-ink-muted">Works on its own — share it anywhere. Phones get a fast, simple page.</p>
          <CopyField value={bookUrl} open />
          <div className="mt-2"><CopyField value={gift} label="Gift certificates" open /></div>
          {(courses ?? []).length > 0 && (
            <details className="mt-3"><summary className="cursor-pointer text-[0.8125rem] font-medium text-ink">Links to each course</summary>
              <div className="mt-2 space-y-2">{(courses ?? []).map((c) => <CopyField key={c.slug} label={c.name as string} value={`${bookUrl}/${c.slug}`} />)}</div>
            </details>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Social media</h2>
          <p className="mb-3 text-[0.8125rem] text-ink-muted">Use these links so you can see which bookings came from where. On your Facebook page, add a <b>Book now</b> action button with the Facebook link; on Instagram, add the Instagram link to your profile links. Shared links show the course photo and price.</p>
          <div className="space-y-2">{links.map((l) => <CopyField key={l.label} label={l.label} value={l.url} />)}</div>
          <div className="mt-4 flex items-center gap-4">
            <div className="h-[120px] w-[120px] shrink-0 rounded-lg bg-white p-1 ring-1 ring-line [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="text-[0.8125rem] text-ink-muted">
              <p className="font-medium text-ink">QR code for flyers, the counter and the van</p>
              <p>Scans go straight to booking.</p>
              <a download={`booking-qr-${org.slug}.svg`} href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`} className="mt-1 inline-block font-medium text-brand-700 hover:underline">Download QR code</a>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Booking form on your website</h2>
          <p className="mb-3 text-[0.8125rem] text-ink-muted">Paste this where the form should go (any website). It fits phones and resizes itself. For one course, add <code className="rounded bg-zinc-100 px-1">data-course=&quot;course-link-name&quot;</code>; for gifts, <code className="rounded bg-zinc-100 px-1">data-page=&quot;gift&quot;</code>.</p>
          <CopyField value={snippet} multiline />
          <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-[0.8125rem] text-ink-muted">
            <p className="font-medium text-ink">WordPress</p>
            <p className="mt-1">Install the EventureOS Bookings plugin, then use the <b>EventureOS booking</b> block, or the shortcode <code className="rounded bg-white px-1">[eventureos_booking]</code> (options: <code className="rounded bg-white px-1">course=&quot;…&quot;</code>, <code className="rounded bg-white px-1">page=&quot;gift&quot;</code>).</p>
            <a href="/downloads/eventureos-bookings.zip" className="mt-2 inline-flex h-9 items-center rounded-lg bg-brand-500 px-3.5 text-[0.8125rem] font-medium text-on-brand hover:bg-brand-600">Download the WordPress plugin</a>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Copy bookings from Bookly</h2>
          <p className="mb-3 text-[0.8125rem] text-ink-muted">The WordPress plugin reads your Bookly bookings on your website&apos;s server and sends them here — students, dates and seats — then keeps sending new ones every 10 minutes until you switch Bookly off, so nothing gets double-booked. ClassBento bookings that went through Bookly come across too.</p>
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-[0.8125rem] text-ink-muted">
            <li>Make a key below and copy it.</li>
            <li>In WordPress: <b>Settings → EventureOS Bookings</b>, paste the key, tick <b>Sync Bookly</b>, Save.</li>
          </ol>
          {isAdmin ? <PluginKeys keys={((keys ?? []) as { id: string; label: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }[])} /> : <p className="text-[0.8125rem] text-ink-muted">Ask an owner or admin to make a plugin key.</p>}
          {lastSync?.[0] && <p className="mt-2 text-[0.75rem] text-ink-faint">Last booking copied from Bookly {relative(lastSync[0].created_at as string)}.</p>}
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[0.875rem] font-medium text-ink">Or import a spreadsheet</p>
            <p className="mb-2 text-[0.78rem] text-ink-muted">A CSV with columns for date, time, course, name (and optionally email, phone, seats, status, reference). Exports from ClassBento or Bookly work.</p>
            <CsvImport />
          </div>
        </Card>

        <div className="xl:col-span-2">
          <SettingsForm initial={settings} />
        </div>
      </div>
    </>
  );
}
