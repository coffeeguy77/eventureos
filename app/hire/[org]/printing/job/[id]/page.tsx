import { notFound } from "next/navigation";
import { eventsOrg } from "@/lib/events/server";
import { cleanExtras, cleanItems, priceJob, readPrinting } from "@/lib/printing/core";
import { jobForCustomer } from "@/lib/printing/server";
import { EventsFrame, eyebrow, serif, WRAP } from "@/components/events/frame";
import { CustomerJob } from "@/components/printing/customer-job";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your print job", robots: { index: false, follow: false } };

const money = (n: number) => `$${n.toFixed(2)}`;

/** The customer's print job: the quote, approving it, and their artwork. Reached from the quote email. */
export default async function CustomerPrintJobPage({ params, searchParams }: { params: Promise<{ org: string; id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { org: slug, id } = await params;
  const { t = "" } = await searchParams;
  const eo = await eventsOrg(slug);
  if (!eo) notFound();
  const j = await jobForCustomer(id, t);
  if (!j || j.job.organisation_id !== eo.org.id) notFound();
  const p = readPrinting(eo.org.rawSettings);
  const price = priceJob({ items: cleanItems(j.job.items), setup: !!j.job.setup, cut: !!j.job.cut, extras: cleanExtras(j.job.extras) }, p);
  const quoted = !!j.job.quote_sent_at;
  return (
    <EventsFrame org={eo.org} s={eo.s} active="printing">
      <section className={`${WRAP} max-w-[760px] py-12 sm:py-16`}>
        <p className={eyebrow}>Print job {j.job.number}</p>
        <h1 className={`${serif} mt-3 text-[2.25rem] font-semibold leading-tight`}>{j.job.title}</h1>
        <div className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-[#EFE6DF]">
          {quoted ? <>
            <p className="font-semibold">Your quote</p>
            <ul className="mt-3 divide-y divide-[#F1EAE4] text-[0.9375rem]">
              {price.lines.map((l, k) => <li key={k} className="flex justify-between gap-4 py-2"><span>{l.description}</span><span className="tabular-nums">{money(l.amount)}</span></li>)}
            </ul>
            <div className="mt-3 space-y-1 border-t border-[#E4DCD5] pt-3 text-[0.9375rem]">
              <p className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(price.exGst)}</span></p>
              <p className="flex justify-between"><span>GST</span><span className="tabular-nums">{money(price.gst)}</span></p>
              <p className="flex justify-between text-[1.125rem] font-semibold"><span>Total</span><span className="tabular-nums">{money(price.total)}</span></p>
            </div>
          </> : <p className="text-[#5E5853]">We&apos;re checking your artwork and will send your quote soon.</p>}
          <div className="mt-6"><CustomerJob jobId={j.job.id} token={t} canApprove={quoted} approved={!["new", "quoted"].includes(j.job.status as string)} /></div>
        </div>
        {j.files.length > 0 && (
          <div className="mt-6 rounded-3xl bg-white p-6 ring-1 ring-[#EFE6DF]">
            <p className="font-semibold">Artwork we have</p>
            <ul className="mt-2 space-y-1 text-[0.9375rem] text-[#5E5853]">{(j.files as { name: string; size: number | null }[]).map((f, k) => <li key={k}>{f.name}{f.size ? ` · ${(Number(f.size) / 1_048_576).toFixed(1)} MB` : ""}</li>)}</ul>
          </div>
        )}
      </section>
    </EventsFrame>
  );
}
