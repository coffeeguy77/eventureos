import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { giftByToken, publicOrg, settleFromStripe } from "@/lib/bookings/server";
import { money } from "@/lib/format";
import { BookShell } from "@/components/book/shell";
import { AutoRefresh } from "@/components/book/auto-refresh";
import { PrintButton } from "@/components/book/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gift certificate", robots: { index: false, follow: false } };

export default async function GiftView({ params, searchParams }: { params: Promise<{ org: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { org: slug, token } = await params;
  const sp = await searchParams;
  const org = await publicOrg(slug);
  let g = org ? await giftByToken(token) : null;
  if (!org || !g || g.organisation_id !== org.id) notFound();
  if (sp.paid === "1" && g.status === "pending") {
    await settleFromStripe("gift", g.id, org.id, g.stripe_session_id).catch(() => undefined);
    g = (await giftByToken(token))!;
  }
  const expires = g.expires_on ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(g.expires_on + "T00:00:00Z")) : null;
  const bookHref = g.course ? `/book/${org.slug}/${g.course.slug}` : `/book/${org.slug}`;

  return (
    <BookShell org={org} embed={false}>
      <div className="mx-auto max-w-xl">
        {g.status === "pending" ? (
          <div className="py-10 text-center">
            {sp.paid === "1" && <AutoRefresh />}
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-[var(--b)]" />
            <h1 className="mt-3 text-[1.5rem] font-bold text-ink">{sp.paid === "1" ? "Confirming your payment…" : "Waiting for payment"}</h1>
          </div>
        ) : (
          <>
            {sp.paid === "1" && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-center text-[0.9375rem] font-medium text-emerald-800 print:hidden">Thank you! The certificate is on its way to your inbox{g.recipient_email ? " (and theirs)" : ""}.</p>}
            <div className="relative overflow-hidden rounded-3xl border-2 border-[var(--b)] bg-surface p-8 text-center shadow-card print:shadow-none">
              <div className="absolute inset-x-0 top-0 h-2 bg-[var(--b)]" />
              {org.logo_url && /^https:\/\//.test(org.logo_url) ? <img src={org.logo_url} alt={org.name} className="mx-auto h-14 max-w-[200px] object-contain" /> : <p className="text-[1.25rem] font-bold text-ink">{org.name}</p>}
              <p className="mt-5 text-[0.8125rem] font-semibold uppercase tracking-[0.2em] text-ink-faint">Gift certificate</p>
              {g.recipient_name && <p className="mt-2 text-[1.5rem] font-semibold text-ink">for {g.recipient_name}</p>}
              <p className="mt-3 text-[2.25rem] font-bold tracking-tight text-ink">{g.course ? g.course.name : money(g.amount, org.currency)}</p>
              {g.course && <p className="text-[0.9375rem] text-ink-muted">{money(g.amount, org.currency)} value</p>}
              {g.message && <p className="mx-auto mt-4 max-w-sm whitespace-pre-line text-[1rem] italic text-ink">“{g.message}”</p>}
              {g.purchaser_name && <p className="mt-2 text-[0.875rem] text-ink-muted">From {g.purchaser_name}</p>}
              <div className="mx-auto mt-6 inline-block rounded-xl bg-zinc-100 px-5 py-3 font-mono text-[1.375rem] font-bold tracking-[0.12em] text-ink">{g.code}</div>
              <p className="mt-3 text-[0.8125rem] text-ink-muted">Book at {org.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") || `eventureos.com.au/book/${org.slug}`} and enter the code at checkout.{expires ? ` Valid until ${expires}.` : ""}</p>
              {g.status === "redeemed" ? <p className="mt-3 text-[0.875rem] font-semibold text-ink-muted">Used — thank you!</p> : Number(g.balance) < Number(g.amount) && Number(g.balance) > 0 ? <p className="mt-3 text-[0.875rem] font-semibold text-ink">{money(g.balance, org.currency, { cents: true })} left to use</p> : null}
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2 print:hidden">
              <PrintButton />
              {g.status === "active" && <Link href={bookHref} className="inline-flex h-12 items-center rounded-xl bg-[var(--b)] px-5 text-[0.9375rem] font-semibold text-[var(--on-b)]">Book with this code</Link>}
            </div>
          </>
        )}
      </div>
    </BookShell>
  );
}
