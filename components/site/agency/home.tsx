import Link from "next/link";
import { ArrowUpRight, Check, Mail, MapPin, Minus, Phone } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { AGENCY, BUILT, CLIENTS, COMPARE, GROUPS, HOME_FAQS, SERVICES, TESTIMONIALS, YEAR_STATS } from "@/lib/site/agency/content";
import { HeroComposite } from "./graphics";
import { QuoteForm } from "./forms";
import { BTN, FaqList, H2, Icon, WRAP } from "./ui";

/** The agency's home page: what we do, why us, LeadPages vs WordPress, how we work, prices, software we've built, FAQs, quote form. */
export function AgencyHome({ org }: { org: PublicOrg }) {
  const base = `/site/${org.slug}`;
  const phone = org.contact_phone || AGENCY.phone, email = org.contact_email || AGENCY.email, address = org.address || AGENCY.address;
  const tel = `tel:${phone.replace(/[^\d+]/g, "")}`;
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[var(--ink)] text-white">
        <div aria-hidden className="ag-glow pointer-events-none absolute inset-0" />
        <div aria-hidden className="ag-grid pointer-events-none absolute inset-0" />
        <div className={`${WRAP} relative grid items-center gap-12 pb-16 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 lg:pb-24 lg:pt-24`}>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.04] px-3.5 py-1.5 text-[0.875rem] text-white/80">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--lime)]" />Web design, hosting and support in Canberra
            </p>
            <h1 className="mt-6 text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[4rem] lg:text-[4.75rem] xl:text-[5.5rem]">
              Fast websites.<br />Local support.<br /><span className="text-white/45">One team.</span>
            </h1>
            <p className="mt-7 max-w-[54ch] text-[1.125rem] leading-relaxed text-white/75 sm:text-[1.1875rem]">
              {org.name} designs, hosts and looks after websites for Canberra businesses — and builds custom apps and AI tools when a website isn&apos;t enough.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={`${base}/quote`} className={BTN.primary}>Get a quote</Link>
              <Link href={`${base}/support`} className={BTN.ghostDark}>Lodge a support ticket</Link>
            </div>
            <p className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.9375rem] text-white/60">
              <a href={tel} className="inline-flex items-center gap-2 hover:text-white"><Phone aria-hidden className="h-4 w-4 text-[var(--lime)]" strokeWidth={1.6} />{phone}</a>
              <span className="inline-flex items-center gap-2"><MapPin aria-hidden className="h-4 w-4 text-[var(--lime)]" strokeWidth={1.6} />Mitchell, ACT</span>
            </p>
          </div>
          <div className="mx-auto w-full max-w-[640px] lg:mr-0"><HeroComposite /></div>
        </div>
        {/* Clients */}
        <div className="relative border-t border-white/10">
          <div className={`${WRAP} flex flex-col gap-4 py-7 lg:flex-row lg:items-center lg:gap-10`}>
            <p className="shrink-0 text-[0.875rem] text-white/50">Trusted by Canberra businesses including</p>
            <ul className="flex flex-wrap gap-x-8 gap-y-3 text-[0.9375rem] font-semibold tracking-[-0.01em] text-white/80">
              {CLIENTS.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="ag-light py-20 sm:py-28" aria-labelledby="svc-h">
        <div className={WRAP}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
            <H2 id="svc-h">Everything your website needs, from one team.</H2>
            <p className="max-w-[52ch] text-[1.0625rem] leading-relaxed text-[var(--muted)] lg:justify-self-end">We build it, host it, keep it updated and help it grow. When something breaks, you call the people who built it.</p>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--line)] md:grid-cols-2 xl:grid-cols-4">
            {GROUPS.map((g) => (
              <div key={g.key} className="bg-white p-6 sm:p-8">
                <p className="text-[0.9375rem] font-semibold">{g.label}</p>
                <p className="mt-0.5 text-[0.875rem] text-[var(--muted)]">{g.text}</p>
                <ul className="mt-6 space-y-1">
                  {SERVICES.filter((s) => s.group === g.key).map((s) => (
                    <li key={s.slug}>
                      <Link href={`${base}/${s.slug}`} className="group -mx-3 flex items-start gap-3.5 rounded-2xl p-3 transition hover:bg-[var(--paper)]">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] text-[var(--ac-ink)] transition group-hover:border-[var(--ac)] group-hover:bg-[var(--ac)] group-hover:text-[var(--on-ac)]"><Icon k={s.icon} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-[1rem] font-semibold">{s.name}<ArrowUpRight aria-hidden className="h-4 w-4 opacity-0 transition group-hover:opacity-100" strokeWidth={1.8} /></span>
                          <span className="mt-0.5 block text-[0.875rem] leading-snug text-[var(--muted)]">{s.blurb}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {g.key === "apps" && (
                  <p className="mt-6 rounded-2xl bg-[var(--paper)] p-4 text-[0.875rem] leading-relaxed text-[var(--muted)]">Client portals, dashboards, automations and Claude or OpenAI integrations — built by the team behind our own software products.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="ag-light border-t border-[var(--line)] bg-white py-20 sm:py-28" aria-labelledby="why-h">
        <div className={`${WRAP} grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20`}>
          <div>
            <H2 id="why-h">Local people who answer, and fix the actual problem.</H2>
            <p className="mt-6 max-w-[52ch] text-[1.0625rem] leading-relaxed text-[var(--muted)]">We&apos;re in Mitchell, not a call centre. The people who host your site are the people who build websites, so when something goes wrong we fix the website — not just tell you the server is fine. Drop in for a coffee and we&apos;ll talk it through.</p>
            <dl className="mt-10 grid max-w-[520px] grid-cols-3 gap-4 border-t border-[var(--line)] pt-6">
              {YEAR_STATS.items.map((s) => (
                <div key={s.label} className="flex flex-col-reverse"><dt className="mt-2 text-[0.8125rem] leading-snug text-[var(--muted)]">{s.label} in {YEAR_STATS.year}</dt><dd className="text-[2.25rem] font-semibold leading-none tracking-[-0.04em]">{s.value}</dd></div>
              ))}
            </dl>
          </div>
          <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {[
              { i: "map" as const, t: "Canberra-based", d: "An office in Mitchell and a team that knows local businesses. Meet us face to face." },
              { i: "ticket" as const, t: "Support you can track", d: "Every request becomes a ticket with a number. Follow it in your client portal from lodged to done." },
              { i: "wallet" as const, t: "Prices on the page", d: "Hosting, maintenance, builds and support rates are listed on this site. No surprises." },
              { i: "gauge" as const, t: "Built to be fast", d: "Lean pages, good hosting and our own LeadPages platform for sites that load quickly and rank well." },
            ].map((x) => (
              <li key={x.t}>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--ink)] text-[var(--lime)]"><Icon k={x.i} className="h-6 w-6" /></span>
                <p className="mt-5 text-[1.1875rem] font-semibold tracking-[-0.01em]">{x.t}</p>
                <p className="mt-2 text-[1rem] leading-relaxed text-[var(--muted)]">{x.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* LeadPages vs WordPress */}
      <section className="relative overflow-hidden bg-[var(--ink)] py-20 text-white sm:py-28" aria-labelledby="cmp-h">
        <div aria-hidden className="ag-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className={`${WRAP} relative grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16`}>
          <div>
            <H2 id="cmp-h" className="lg:text-[2.75rem]">WordPress is great. For most small businesses, LeadPages is better.</H2>
            <p className="mt-6 max-w-[48ch] text-[1.0625rem] leading-relaxed text-white/70">LeadPages is our own website platform. Live visual editing, apps for bookings and quotes, fast static pages — and nothing to patch. We still build on WordPress when it&apos;s the right tool.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={`${base}/leadpages`} className={BTN.lime}>See how LeadPages works</Link>
              <Link href={`${base}/wordpress`} className={BTN.ghostDark}>WordPress services</Link>
            </div>
          </div>
          <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-white/[.03]">
            <table className="w-full min-w-[560px] text-left text-[0.9375rem]">
              <caption className="sr-only">LeadPages compared with WordPress</caption>
              <thead><tr className="border-b border-white/10">
                <th scope="col" className="w-[26%] px-5 py-4 font-medium text-white/50"><span className="sr-only">Feature</span></th>
                <th scope="col" className="px-5 py-4 font-semibold text-[var(--lime)]">LeadPages</th>
                <th scope="col" className="px-5 py-4 font-semibold text-white/80">WordPress</th>
              </tr></thead>
              <tbody>
                {COMPARE.slice(0, 5).map((r) => (
                  <tr key={r.label} className="border-b border-white/[.07] last:border-0">
                    <th scope="row" className="px-5 py-4 align-top font-medium text-white/60">{r.label}</th>
                    <td className="px-5 py-4 align-top"><span className="flex gap-2.5"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lime)]" strokeWidth={2} />{r.leadpages}</span></td>
                    <td className="px-5 py-4 align-top text-white/65"><span className="flex gap-2.5"><Minus aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-white/35" strokeWidth={2} />{r.wordpress}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* How we work */}
      <section className="ag-light py-20 sm:py-28" aria-labelledby="how-h">
        <div className={WRAP}>
          <H2 id="how-h" className="max-w-[18ch]">How a new website comes together.</H2>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "Talk it through", d: "A quick chat or the quote form. We work out what the site needs to do and give you a clear price." },
              { t: "Plan and design", d: "Pages, words and look agreed before we build, so there are no surprises." },
              { t: "Build and launch", d: "We build, test on phones and desktops, redirect your old addresses and go live." },
              { t: "Look after it", d: "Hosting, maintenance checks and support — so it stays fast, secure and working." },
            ].map((s, i) => (
              <li key={s.t} className="bg-white p-7 sm:p-8">
                <span className="text-[3rem] font-semibold leading-none tracking-[-0.05em] text-[var(--ac-ink)]">{i + 1}</span>
                <p className="mt-6 text-[1.1875rem] font-semibold">{s.t}</p>
                <p className="mt-2 text-[1rem] leading-relaxed text-[var(--muted)]">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Prices */}
      <section className="ag-light border-t border-[var(--line)] bg-white py-20 sm:py-28" aria-labelledby="price-h">
        <div className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20`}>
          <div>
            <H2 id="price-h">Straightforward prices.</H2>
            <p className="mt-6 max-w-[46ch] text-[1.0625rem] leading-relaxed text-[var(--muted)]">No packages to decode. Here&apos;s what things cost, excluding GST.</p>
            <div className="mt-10 rounded-[24px] bg-[var(--ink)] p-7 text-white sm:p-8">
              <p className="text-[0.9375rem] text-white/60">A typical care setup</p>
              <p className="mt-1 text-[1.125rem] font-semibold">Hosting, off-server backups and quarterly maintenance</p>
              <ul className="mt-5 space-y-2 text-[0.9375rem] text-white/75">
                <li className="flex justify-between gap-4"><span>Annual web hosting</span><span className="tabular-nums">$400</span></li>
                <li className="flex justify-between gap-4"><span>Annual website backup</span><span className="tabular-nums">$104</span></li>
                <li className="flex justify-between gap-4"><span>4 maintenance checks at $120</span><span className="tabular-nums">$480</span></li>
              </ul>
              <p className="mt-5 flex items-baseline justify-between gap-4 border-t border-white/15 pt-5"><span className="text-white/70">Per year</span><span className="text-[2.25rem] font-semibold tracking-[-0.04em] text-[var(--lime)] tabular-nums">$984 <span className="text-[0.9375rem] font-normal text-white/60">+ GST</span></span></p>
            </div>
          </div>
          <div>
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {[
                { n: "New website build", d: "40 hours: design, build, SEO setup, Google Analytics, training", p: "$4,950", u: "" , h: "website-design" },
                { n: "Web hosting", d: "cPanel, CloudLinux, Xeon Gold servers, SSD storage", p: "$400", u: "/ year", h: "web-hosting" },
                { n: "Website backup", d: "Weekly, stored off-server", p: "$104", u: "/ year", h: "web-hosting" },
                { n: "Maintenance check", d: "Updates, malware scan, compatibility testing", p: "$120", u: "/ check", h: "website-maintenance" },
                { n: "Website, email and server support", d: "Tracked by ticket", p: "$120", u: "/ hour", h: "website-support" },
                { n: "Google Ads management", d: "8 hours management + 1-hour consult; ad spend separate", p: "$600", u: "/ month", h: "google-ads" },
              ].map((r) => (
                <li key={r.n}>
                  <Link href={`${base}/${r.h}`} className="group flex items-baseline justify-between gap-6 py-5">
                    <span><span className="block text-[1.0625rem] font-semibold group-hover:underline group-hover:underline-offset-4">{r.n}</span><span className="mt-0.5 block text-[0.875rem] text-[var(--muted)]">{r.d}</span></span>
                    <span className="shrink-0 text-right"><span className="text-[1.5rem] font-semibold tracking-[-0.03em] tabular-nums">{r.p}</span><span className="ml-1 text-[0.875rem] text-[var(--muted)]">{r.u}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.875rem] text-[var(--muted)]">All prices exclude GST. Online stores, SEO and custom apps are quoted to scope.</p>
          </div>
        </div>
      </section>

      {/* Software we've built */}
      <section className="relative overflow-hidden bg-[var(--ink)] py-20 text-white sm:py-28" aria-labelledby="ai-h">
        <div aria-hidden className="ag-glow pointer-events-none absolute inset-0 opacity-60" />
        <div className={`${WRAP} relative`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
            <H2 id="ai-h">We build software, not just websites.</H2>
            <div className="lg:justify-self-end">
              <p className="max-w-[50ch] text-[1.0625rem] leading-relaxed text-white/70">Client portals, dashboards, automations and AI features using Claude and OpenAI — connected to Xero, Stripe and Gmail. These are products our team has built:</p>
            </div>
          </div>
          <ul className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {BUILT.map((b) => (
              <li key={b.name} className="flex flex-col bg-[var(--ink)] p-6 sm:p-7">
                <p className="text-[0.875rem] text-[var(--ac-hi)]">{b.kind}</p>
                <p className="mt-1 text-[1.375rem] font-semibold tracking-[-0.02em]">{b.name}</p>
                <p className="mt-3 flex-1 text-[0.9375rem] leading-relaxed text-white/65">{b.text}</p>
                <ul className="mt-5 flex flex-wrap gap-1.5">{b.tags.map((t) => <li key={t} className="rounded-full border border-white/15 px-2.5 py-0.5 text-[0.75rem] text-white/70">{t}</li>)}</ul>
              </li>
            ))}
          </ul>
          <div className="mt-10"><Link href={`${base}/ai-and-custom-apps`} className={BTN.lime}>AI and custom apps</Link></div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="ag-light py-20 sm:py-28" aria-labelledby="tst-h">
        <div className={WRAP}>
          <H2 id="tst-h">What clients say.</H2>
          <ul className="mt-12 grid gap-x-12 gap-y-12 md:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <li key={t.name}>
                <figure className="border-l-2 border-[var(--ac)] pl-6">
                  <blockquote className="ag-serif text-[1.375rem] leading-[1.45] tracking-[-0.01em] sm:text-[1.5rem]">“{t.quote}”</blockquote>
                  <figcaption className="mt-4 text-[0.9375rem] font-semibold">{t.name} <span className="font-normal text-[var(--muted)]">on Google</span></figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQs */}
      <section className="ag-light border-t border-[var(--line)] bg-white py-20 sm:py-28" aria-labelledby="faq-h">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
          <H2 id="faq-h">Questions people ask us.</H2>
          <FaqList faqs={HOME_FAQS} />
        </div>
      </section>

      {/* Quote */}
      <section id="quote" className="relative overflow-hidden bg-[var(--ink)] py-20 text-white sm:py-28" aria-labelledby="cta-h">
        <div aria-hidden className="ag-glow pointer-events-none absolute inset-0" />
        <div className={`${WRAP} relative grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16`}>
          <div>
            <H2 id="cta-h">Tell us what you need. We&apos;ll come back with a clear price.</H2>
            <p className="mt-6 max-w-[46ch] text-[1.0625rem] leading-relaxed text-white/70">A new site, a rescue job, hosting, ads or an app idea — send a few details and we&apos;ll be in touch. Existing client with a problem? Lodge a support ticket instead.</p>
            <ul className="mt-8 space-y-3 text-[1rem]">
              <li><a href={tel} className="inline-flex items-center gap-3 text-white/85 hover:text-white"><Phone aria-hidden className="h-5 w-5 text-[var(--lime)]" strokeWidth={1.6} />{phone}</a></li>
              <li><a href={`mailto:${email}`} className="inline-flex items-center gap-3 text-white/85 hover:text-white"><Mail aria-hidden className="h-5 w-5 text-[var(--lime)]" strokeWidth={1.6} />{email}</a></li>
              <li className="flex items-start gap-3 text-white/85"><MapPin aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[var(--lime)]" strokeWidth={1.6} />{address}</li>
            </ul>
            <Link href={`${base}/support`} className={`${BTN.ghostDark} mt-8`}>Lodge a support ticket</Link>
          </div>
          <div className="ag-light rounded-[28px] bg-white p-6 text-[var(--ink)] sm:p-9">
            <p className="mb-6 text-[1.375rem] font-semibold tracking-[-0.02em]">Quick quote</p>
            <QuoteForm slug={org.slug} variant="quick" />
          </div>
        </div>
      </section>
    </>
  );
}
