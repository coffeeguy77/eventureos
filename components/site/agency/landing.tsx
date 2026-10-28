import Link from "next/link";
import { ArrowUpRight, Check, ChevronRight, Minus, Phone } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { AGENCY, COMPARE, serviceBySlug, type Service } from "@/lib/site/agency/content";
import { ServiceGraphic } from "./graphics";
import { QuoteForm } from "./forms";
import { BTN, FaqList, H2, Icon, WRAP } from "./ui";

function Crumbs({ base, name, label }: { base: string; name: string; label: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-[0.875rem] text-white/55">
        <li><Link href={base} className="hover:text-white">{name}</Link></li>
        <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
        <li aria-current="page" className="text-white/85">{label}</li>
      </ol>
    </nav>
  );
}

/** Dark page header used by service, quote and support pages. */
export function PageHero({ org, label, title, lede, children, aside }: { org: PublicOrg; label: string; title: string; lede: string; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-[var(--ink)] text-white">
      <div aria-hidden className="ag-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="ag-grid pointer-events-none absolute inset-0" />
      <div className={`${WRAP} relative grid items-center gap-12 pb-16 pt-10 sm:pt-14 lg:pb-24 ${aside ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" : ""}`}>
        <div>
          <Crumbs base={`/site/${org.slug}`} name={org.name} label={label} />
          <h1 className="mt-8 max-w-[18ch] text-[2.5rem] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[3.5rem] lg:text-[4.25rem]">{title}</h1>
          <p className="mt-6 max-w-[56ch] text-[1.125rem] leading-relaxed text-white/75 sm:text-[1.1875rem]">{lede}</p>
          {children}
        </div>
        {aside && <div className="mx-auto w-full max-w-[520px] lg:mr-0">{aside}</div>}
      </div>
    </section>
  );
}

/** A service page: hero, why it matters, what's included and price, process, (LeadPages: full comparison), FAQs, related, quote. */
export function AgencyLanding({ org, s }: { org: PublicOrg; s: Service }) {
  const base = `/site/${org.slug}`;
  const phone = org.contact_phone || AGENCY.phone;
  const from = s.pricing?.items[0];
  const related = s.related.map(serviceBySlug).filter((x): x is Service => !!x);
  return (
    <>
      <PageHero org={org} label={s.name} title={s.title} lede={s.lede} aside={<ServiceGraphic kind={s.graphic} />}>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href={`${base}/quote?service=${s.slug}`} className={BTN.primary}>Get a quote</Link>
          <Link href={`${base}/support`} className={BTN.ghostDark}>Lodge a support ticket</Link>
        </div>
        {from && /\d/.test(from.price) && (
          <p className="mt-7 text-[0.9375rem] text-white/60">{from.name}: <span className="font-semibold text-[var(--lime)]">{from.price}</span> {from.unit}</p>
        )}
      </PageHero>

      {/* Why */}
      <section className="ag-light py-20 sm:py-24" aria-label={`About ${s.name}`}>
        <h2 className="sr-only">Why {s.name} with {org.name}</h2>
        <div className={`${WRAP} grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20`}>
          <div className="space-y-5 text-[1.125rem] leading-[1.7] text-[rgba(15,11,30,.85)]">
            {s.intro.map((p, i) => <p key={i} className={i === 0 ? "text-[1.25rem] leading-[1.6] text-[var(--ink)] sm:text-[1.375rem]" : ""}>{p}</p>)}
          </div>
          <ul className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {s.benefits.map((b) => (
              <li key={b.title}>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--ink)] text-[var(--lime)]"><Icon k={b.icon} /></span>
                <h3 className="mt-4 text-[1.125rem] font-semibold tracking-[-0.01em]">{b.title}</h3>
                <p className="mt-1.5 text-[1rem] leading-relaxed text-[var(--muted)]">{b.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Included + price */}
      <section className="ag-light border-y border-[var(--line)] bg-white py-20 sm:py-24" aria-labelledby="inc-h">
        <div className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16`}>
          <div>
            <H2 id="inc-h">What&apos;s included</H2>
            <ul className="mt-10 grid gap-x-10 gap-y-4 sm:grid-cols-2">
              {s.included.map((x) => (
                <li key={x} className="flex gap-3 border-b border-[var(--line)] pb-4 text-[1.0625rem]">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)]"><Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.4} /></span>{x}
                </li>
              ))}
            </ul>
          </div>
          <aside aria-label="Pricing" className="self-start rounded-[28px] bg-[var(--ink)] p-7 text-white sm:p-9 lg:sticky lg:top-24">
            <p className="text-[1.25rem] font-semibold">Pricing</p>
            {s.pricing ? (
              <ul className="mt-5 divide-y divide-white/10">
                {s.pricing.items.map((p) => (
                  <li key={p.name} className="py-4">
                    <p className="text-[0.9375rem] text-white/70">{p.name}</p>
                    <p className="mt-1"><span className="text-[2.25rem] font-semibold tracking-[-0.04em] tabular-nums">{p.price}</span> <span className="text-[0.9375rem] text-white/60">{p.unit}</span></p>
                    {p.note && <p className="mt-1 text-[0.875rem] text-white/55">{p.note}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 text-[1rem] text-white/70">Every setup is a little different, so we&apos;ll quote it for you.</p>}
            {s.pricing?.note && <p className="mt-2 text-[0.875rem] text-white/60">{s.pricing.note}</p>}
            <p className="mt-2 text-[0.8125rem] text-white/45">Prices exclude GST.</p>
            <Link href={`${base}/quote?service=${s.slug}`} className={`${BTN.lime} mt-6 w-full`}>Get a quote</Link>
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="mt-4 flex items-center justify-center gap-2 text-[0.9375rem] text-white/70 hover:text-white"><Phone aria-hidden className="h-4 w-4" strokeWidth={1.6} />Or call {phone}</a>
          </aside>
        </div>
      </section>

      {/* LeadPages vs WordPress (full) */}
      {(s.slug === "leadpages" || s.slug === "wordpress") && (
        <section className="ag-light py-20 sm:py-24" aria-labelledby="cmp-h">
          <div className={WRAP}>
            <H2 id="cmp-h" className="max-w-[20ch]">LeadPages or WordPress? An honest comparison.</H2>
            <div className="mt-10 overflow-x-auto rounded-[24px] border border-[var(--line)] bg-white">
              <table className="w-full min-w-[640px] text-left text-[1rem]">
                <caption className="sr-only">LeadPages compared with WordPress</caption>
                <thead><tr className="border-b border-[var(--line)]">
                  <th scope="col" className="w-[24%] px-6 py-4"><span className="sr-only">Feature</span></th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[var(--ac-ink)]">LeadPages</th>
                  <th scope="col" className="px-6 py-4 font-semibold">WordPress</th>
                </tr></thead>
                <tbody>
                  {COMPARE.map((r) => (
                    <tr key={r.label} className="border-b border-[var(--line)] last:border-0">
                      <th scope="row" className="px-6 py-4 align-top font-medium text-[var(--muted)]">{r.label}</th>
                      <td className="px-6 py-4 align-top"><span className="flex gap-2.5"><Check aria-hidden className="mt-1 h-4 w-4 shrink-0 text-[var(--ac-ink)]" strokeWidth={2.2} />{r.leadpages}</span></td>
                      <td className="px-6 py-4 align-top text-[var(--muted)]"><span className="flex gap-2.5"><Minus aria-hidden className="mt-1 h-4 w-4 shrink-0 opacity-50" strokeWidth={2.2} />{r.wordpress}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Process */}
      <section className={`ag-light py-20 sm:py-24 ${s.slug === "leadpages" || s.slug === "wordpress" ? "border-t border-[var(--line)] bg-white" : ""}`} aria-labelledby="how-h">
        <div className={WRAP}>
          <H2 id="how-h">How it works</H2>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
            {s.process.map((p, i) => (
              <li key={p.title} className="bg-white p-7">
                <span className="text-[2.5rem] font-semibold leading-none tracking-[-0.05em] text-[var(--ac-ink)]">{i + 1}</span>
                <p className="mt-5 text-[1.125rem] font-semibold">{p.title}</p>
                <p className="mt-2 text-[1rem] leading-relaxed text-[var(--muted)]">{p.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQs */}
      <section className="ag-light border-t border-[var(--line)] bg-white py-20 sm:py-24" aria-labelledby="faq-h">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
          <H2 id="faq-h">{s.name}: common questions</H2>
          <FaqList faqs={s.faqs} />
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="ag-light py-16 sm:py-20" aria-labelledby="rel-h">
          <div className={WRAP}>
            <h2 id="rel-h" className="text-[1.5rem] font-semibold tracking-[-0.02em]">Goes well with</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`${base}/${r.slug}`} className="group flex h-full flex-col rounded-[20px] border border-[var(--line)] bg-white p-6 transition hover:border-[var(--ink)]">
                    <span className="flex items-center justify-between text-[var(--ac-ink)]"><Icon k={r.icon} className="h-6 w-6" /><ArrowUpRight aria-hidden className="h-5 w-5 text-[var(--muted)] transition group-hover:text-[var(--ink)]" strokeWidth={1.6} /></span>
                    <span className="mt-5 text-[1.0625rem] font-semibold">{r.name}</span>
                    <span className="mt-1 text-[0.9375rem] leading-snug text-[var(--muted)]">{r.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <QuoteBand org={org} preselect={s.slug} />
    </>
  );
}

/** Closing band: quick quote form beside a support link. */
export function QuoteBand({ org, preselect }: { org: PublicOrg; preselect?: string }) {
  const base = `/site/${org.slug}`;
  return (
    <section className="relative overflow-hidden bg-[var(--ink)] py-20 text-white sm:py-24" aria-labelledby="band-h">
      <div aria-hidden className="ag-glow pointer-events-none absolute inset-0" />
      <div className={`${WRAP} relative grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16`}>
        <div>
          <H2 id="band-h">Ready when you are.</H2>
          <p className="mt-6 max-w-[44ch] text-[1.0625rem] leading-relaxed text-white/70">Send a few details for a quote. Already a client and something&apos;s not working? Lodge a ticket and follow it in your portal.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={`${base}/support`} className={BTN.ghostDark}>Lodge a support ticket</Link>
            <Link href={`/p/${org.slug}`} className={BTN.ghostDark}>Client login</Link>
          </div>
        </div>
        <div className="ag-light rounded-[28px] bg-white p-6 text-[var(--ink)] sm:p-9">
          <p className="mb-6 text-[1.375rem] font-semibold tracking-[-0.02em]">Quick quote</p>
          <QuoteForm slug={org.slug} variant="quick" preselect={preselect} />
        </div>
      </div>
    </section>
  );
}
