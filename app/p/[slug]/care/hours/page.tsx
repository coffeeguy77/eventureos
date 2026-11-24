import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { fmtDate, money } from "@/lib/format";
import { fmtHours, packPrice, readCare } from "@/lib/nerdherd/care";
import { loadBlock } from "@/lib/nerdherd/care-server";
import { readNerd } from "@/lib/nerdherd/core";
import { BuyHours } from "@/components/portal/care-forms";
import { requirePortal } from "../../portal-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prepaid hours", robots: { index: false, follow: false } };

/** The client's prepaid hours: balance, blocks bought, every request that used time, and buying more. */
export default async function PrepaidHours({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, billingCustomerIds: customerIds } = await requirePortal(slug);
  if (!customerIds.length) return <NoBilling slug={slug} />;
  const svc = createServiceClient();
  const [{ data: o }, block] = await Promise.all([svc.from("organisations").select("settings").eq("id", org.id).single(), loadBlock(svc, org.id, customerIds)]);
  const care = readCare(o?.settings);
  const nerd = readNerd(o?.settings);
  const packs = care.packs.map((p) => ({ ...p, ...packPrice(p, nerd.hourlyRate) }));
  const left = block?.leftMin ?? 0;

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <Link href={`/p/${slug}`} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Your account</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="portal-serif text-[2.25rem] font-semibold leading-tight text-ink">Prepaid hours</h1>
          <p className="mt-1 max-w-[560px] text-[0.9375rem] text-ink-muted">Buy a block, list the changes you want, and we do them — no waiting for a quote each time. Each request uses at least {nerd.minHours === 1 ? "1 hour" : `${nerd.minHours} hours`}, then our time to the next 15 minutes.</p>
        </div>
        {block && block.boughtMin > 0 && (
          <div className="rounded-[22px] bg-surface px-5 py-4 ring-1 ring-line">
            <p className={`text-[2rem] font-semibold leading-none ${left < 0 ? "text-rose-700" : "text-ink"}`}>{fmtHours(left)}</p>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">{left < 0 ? "over" : "left"} · {fmtHours(block.usedMin)} used of {fmtHours(block.boughtMin)}</p>
          </div>
        )}
      </div>

      {!block ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[0.875rem] text-amber-900 ring-1 ring-amber-200">Prepaid hours are being switched on for your account — please check back shortly.</p>
      ) : care.enabled ? (
        <section className="rounded-[24px] bg-surface p-5 ring-1 ring-line sm:p-7">
          <h2 className="text-[1.25rem] font-semibold text-ink">{block.boughtMin ? "Top up" : "Choose a block"}</h2>
          <div className="mt-4"><BuyHours slug={slug} customer={customerIds[0]} packs={packs} currency={org.currency} rate={nerd.hourlyRate} /></div>
        </section>
      ) : null}

      {block && block.usage.length > 0 && (
        <section>
          <h2 className="text-[1.25rem] font-semibold text-ink">Where your hours went</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[22px] bg-surface ring-1 ring-line">
            {block.usage.map((u) => (
              <li key={u.ticket_id}><Link href={`/p/${slug}/support/${u.ticket_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-zinc-50">
                <span className="min-w-0"><span className="block truncate font-medium text-ink">#{u.number} {u.subject}</span><span className="block text-[0.8125rem] text-ink-muted">Updated {fmtDate(u.updated_at)}{u.minutes_charged > u.minutes_logged ? ` · ${fmtHours(u.minutes_logged)} worked, minimum applies` : ""}</span></span>
                <span className="shrink-0 font-semibold text-ink">{fmtHours(u.minutes_charged)}</span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      {block && block.blocks.length > 0 && (
        <section>
          <h2 className="text-[1.25rem] font-semibold text-ink">Blocks</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[22px] bg-surface ring-1 ring-line">
            {block.blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="flex min-w-0 items-center gap-3">{b.paid ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Clock className="h-5 w-5 shrink-0 text-amber-600" />}
                  <span className="min-w-0"><span className="block font-medium text-ink">{b.hours} hours{b.price_ex_gst > 0 ? ` · ${money(b.price_ex_gst * 1.1, org.currency)}` : ""}</span><span className="block truncate text-[0.8125rem] text-ink-muted">{fmtDate(b.created_at)}{b.invoice ? ` · invoice ${b.invoice.number}` : b.label ? ` · ${b.label}` : ""}</span></span></span>
                {!b.paid && b.invoice && <a href={`/pay/${b.invoice.pay_token}`} className="inline-flex h-9 items-center rounded-full bg-[var(--portal-brand)] px-4 text-[0.8125rem] font-semibold text-[color:var(--portal-brand-fg)]">Pay to start using</a>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function NoBilling({ slug }: { slug: string }) {
  return (
    <div className="mx-auto max-w-[640px] space-y-4 py-10 text-center">
      <h1 className="portal-serif text-[2rem] font-semibold leading-tight text-ink">Your accounts contact looks after this</h1>
      <p className="text-[0.9375rem] text-ink-muted">Your access shows the work and your requests. Invoices, prices and hours go to the person who handles your accounts.</p>
      <Link href={`/p/${slug}`} className="inline-flex font-semibold text-[color:var(--portal-brand-ink)] hover:underline">Back to your account</Link>
    </div>
  );
}
