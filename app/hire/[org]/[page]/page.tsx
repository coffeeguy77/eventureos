import type { Metadata } from "next";
import { siteMeta } from "@/lib/site/meta";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Download } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { eventsOrg, packageFor, priceList } from "@/lib/events/server";
import { hireKindFromSlug, hirePageSlug, offered, type EventsSettings } from "@/lib/events/core";
import { EventsFrame, Heading, btn, btnOutline, eyebrow, serif, WRAP } from "@/components/events/frame";
import { fleetLine, HowItWorks, KindVisual, QuoteBand } from "@/components/events/blocks";
import { ContactForm } from "@/components/events/contact-form";
import { CartDiagram, VanDiagram } from "@/components/events/size-diagram";
import { loadLibrary, shareToken } from "@/lib/documents/library";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

const titleFor = (kind: "cart" | "van", s: EventsSettings) => `${s.labels[kind]} Hire${s.city ? ` ${s.city}` : ""}`.replace(/\b\w/g, (c) => c.toUpperCase());

async function load(slug: string, page: string) {
  const kind = hireKindFromSlug(page);
  if (!kind) return null;
  const eo = await eventsOrg(slug);
  if (!eo || !offered(eo.s).includes(kind)) return null;
  return { ...eo, kind, canonical: hirePageSlug(kind, eo.s) };
}

export async function generateMetadata({ params }: { params: Promise<{ org: string; page: string }> }): Promise<Metadata> {
  const p = await params;
  const x = await load(p.org, p.page);
  if (!x) return { title: "Not found" };
  const t = titleFor(x.kind, x.s);
  return siteMeta(x.org, `/hire/${x.org.slug}/${x.canonical}`, {
    title: `${t} | ${x.org.name}`,
    description: (x.s.pages[x.kind as "cart" | "van"]?.metaDescription || `${t} — ${x.s.blurbs[x.kind]} Check your date and get a quote online.`).slice(0, 160),
  });
}

export default async function HireKindPage({ params }: { params: Promise<{ org: string; page: string }> }) {
  const p = await params;
  const x = await load(p.org, p.page);
  if (!x) notFound();
  if (p.page !== x.canonical) permanentRedirect(`/hire/${x.org.slug}/${x.canonical}`);
  const { org, s, kind } = x;
  const base = `/hire/${org.slug}`;
  const title = titleFor(kind, s);
  const label = s.labels[kind];
  const lower = label.toLowerCase();

  // "What's included" straight from the business's own price list descriptions (no prices shown)
  const { services, packages } = await priceList(createServiceClient(), org.id);
  const pkg = packageFor(kind, s, packages);
  const byId = new Map(services.map((v) => [v.id, v]));
  const parts = pkg ? [pkg.rules.hire, pkg.rules.delivery, pkg.rules.staff].map((r) => (r ? byId.get(r.service_id) : null)).filter((v): v is NonNullable<typeof v> => !!v) : [];
  const included = parts.map((v) => ({ name: v.name, text: (v.description ?? "").replace(/\s*-\s*pricing.*$/i, "").trim() }));
  const milks = s.drinks.find((g) => /milk/i.test(g.title))?.items.map((i) => i.name);
  const extra = s.pages[kind as "cart" | "van"] ?? null;
  const sp = extra?.specs;
  const sized = !!(sp?.length && sp.width && sp.height);
  // Artwork templates and the food licence / insurance, from the business's document library (public ones only)
  const db = createServiceClient();
  const lib = extra && (extra.artwork || extra.documents) ? ((await loadLibrary(db, org.id, { publicOnly: true, current: todayISO(org.timezone) })) ?? []) : [];
  const artwork = extra?.artwork ? lib.filter((d) => d.category === "Artwork template") : [];
  const proofs = extra?.documents ? lib.filter((d) => d.category === "Food licence" || d.category === "Insurance certificate") : [];
  const docsBase = lib.length ? `/p/${org.slug}/docs/${await shareToken(db, org.id)}` : null;

  const faqs = [
    { q: `How do I book ${s.fleet[kind] === 1 ? `the ${lower}` : `a ${lower}`}?`, a: `Build your event on our quote page — choose your days, hours and how many baristas. We check the calendar as you go and email your itemised quote. Accept it online and we'll send the invoice.` },
    ...(s.fleet[kind] > 1 ? [{ q: `Can I hire more than one ${lower}?`, a: `Yes — we have ${s.fleet[kind]}, so you can book up to ${s.fleet[kind]} for the same day, subject to availability.` }] : [{ q: `How many ${lower}s do you have?`, a: `Just the one, so it books out quickly. Check your date early to avoid missing out.` }]),
    ...(s.leadDays ? [{ q: "How far ahead should I book?", a: `Book at least ${s.leadDays} days ahead to lock your date in. Under ${s.leadDays} days we can often still help — the booking is tentative until our baristas are confirmed.` }] : []),
    ...(milks?.length && !extra?.faqs.some((f) => /milk/i.test(f.q)) ? [{ q: "What milks do you have?", a: `${milks.join(", ")}.` }] : []),
    { q: `Can the ${lower} carry our branding?`, a: `Yes — we can wrap it in your signage${s.stickerPrice ? ` and put your logo on every cup with ${s.stickerSize} stickers` : ""}. See our branding page for ideas.` },
    ...(s.areas.length ? [{ q: "Which areas do you cover?", a: `${s.city ? `${s.city} and ` : ""}${s.areas.join(", ")}.` }] : []),
    ...(sized && !extra?.faqs.some((f) => /how big|size|dimension/i.test(f.q)) ? [{ q: `How big is the ${lower}?`, a: `${sp!.vehicle ? `${sp!.vehicle} — ` : ""}${sp!.length} mm ${kind === "van" ? "long" : "wide"} × ${sp!.width} mm ${kind === "van" ? "wide" : "deep"} × ${sp!.height} mm high.${sp!.equipment.length ? ` ${sp!.equipment.join(" and ")}${kind === "cart" ? " sit on top" : " on board"}.` : ""}` }] : []),
    ...(extra?.faqs ?? []),
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Service", name: title, serviceType: `${label} hire`, provider: { "@type": "LocalBusiness", name: org.name, ...(org.address ? { address: org.address } : {}), ...(org.contact_phone ? { telephone: org.contact_phone } : {}) }, ...(s.city ? { areaServed: [s.city, ...s.areas] } : {}), description: s.blurbs[kind] },
      { "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };

  return (
    <EventsFrame org={org} s={s} active={kind}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section data-section="hero">
        <div className={`${WRAP} grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:py-20`}>
          <div>
            <p className={eyebrow}>{fleetLine(kind, s)}</p>
            <h1 className={`${serif} mt-4 text-[2.75rem] font-semibold leading-[1.02] sm:text-[3.75rem] lg:text-[4.25rem]`}>{title}</h1>
            <p className="mt-6 max-w-[540px] text-[1.125rem] leading-relaxed text-[#5E5853]">{s.blurbs[kind]}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={`${base}/quote?kind=${kind}`} data-track={`Check my date (${kind} hero)`} className={btn}>Check my date<ArrowRight className="h-5 w-5" /></Link>
              <Link href={`${base}/drinks`} className={btnOutline}>The drinks menu</Link>
            </div>
          </div>
          <div className="aspect-[5/4] overflow-hidden rounded-[34px]"><KindVisual kind={kind} s={s} /></div>
        </div>
      </section>

      {extra && (extra.about || extra.highlights.length > 0) && (
        <section className="py-14 sm:py-20" data-section="about">
          <div className={`${WRAP} grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16`}>
            <div>
              <h2 className={`${serif} text-[2.25rem] font-semibold leading-tight sm:text-[2.75rem]`}>{title}</h2>
              <div className="mt-5 space-y-4 text-[1.0313rem] leading-relaxed text-[#3A3431]">
                {extra.about.split(/\n{2,}/).map((para, i) => /^##\s/.test(para)
                  ? <h3 key={i} className="pt-2 text-[1.25rem] font-semibold text-[#151312]">{para.replace(/^##\s*/, "")}</h3>
                  : <p key={i} className="whitespace-pre-line">{para}</p>)}
              </div>
            </div>
            {extra.highlights.length > 0 && (
              <div className="grid content-start gap-3 sm:grid-cols-2">
                {extra.highlights.map((h) => (
                  <div key={h.title} className="rounded-[20px] bg-white p-5 ring-1 ring-[#EDE3DB]">
                    <h3 className="text-[1.0625rem] font-semibold">{h.title}</h3>
                    {h.text && <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[#5E5853]">{h.text}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {included.length > 0 && (
        <section className="bg-[#FFF7F5] py-14 sm:py-20" data-section="included">
          <div className={WRAP}>
            <Heading kicker="What's included" title={`Everything you get with the ${lower}`} />
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {included.map((i) => (
                <div key={i.name} className="rounded-[22px] bg-white p-6 ring-1 ring-[#EDE3DB]">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><Check className="h-5 w-5" /></span>
                  <p className="mt-4 text-[1.125rem] font-semibold">{i.name}</p>
                  {i.text && <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[#5E5853]">{i.text}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-14 sm:py-20" data-section="how">
        <div className={WRAP}>
          <Heading kicker="How it works" title={`Booking ${s.fleet[kind] === 1 ? `the ${lower}` : `a ${lower}`}${s.city ? ` in ${s.city}` : ""}`} />
          <div className="mt-10"><HowItWorks s={s} /></div>
        </div>
      </section>

      {sized && (
        <section className="bg-[#FFF7F5] py-14 sm:py-20" data-section="size" id="size">
          <div className={`${WRAP} grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16`}>
            <div>
              <Heading kicker="Size & setup" title={`How big is the ${lower}?`} />
              <dl className="mt-6 grid grid-cols-3 gap-3">
                {([[kind === "van" ? "Length" : "Width", sp!.length], [kind === "van" ? "Width" : "Depth", sp!.width], ["Height", sp!.height]] as [string, number][]).map(([k2, v2]) => (
                  <div key={k2} className="rounded-2xl bg-white p-4 text-center ring-1 ring-[#EDE3DB]"><dt className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#8C847D]">{k2}</dt><dd className={`${serif} mt-1 text-[1.75rem] font-semibold leading-none`}>{v2.toLocaleString("en-AU")}<span className="ml-1 text-[0.875rem] font-normal text-[#8C847D]">mm</span></dd></div>
                ))}
              </dl>
              <ul className="mt-6 space-y-2.5 text-[0.9688rem] text-[#3A3431]">
                {sp!.vehicle && <li className="flex gap-2.5"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" />{sp!.vehicle}</li>}
                {sp!.equipment.map((e) => <li key={e} className="flex gap-2.5"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" />{e}</li>)}
                {sp!.power && <li className="flex gap-2.5"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" />{sp!.power}</li>}
              </ul>
              {sp!.note && <p className="mt-5 rounded-2xl bg-white p-4 text-[0.9375rem] leading-relaxed text-[#3A3431] ring-1 ring-[#EDE3DB]">{sp!.note}</p>}
            </div>
            <div className="rounded-[28px] bg-white p-5 ring-1 ring-[#EDE3DB] sm:p-8">
              {kind === "van" ? <VanDiagram s={sp!} title={label} /> : <CartDiagram s={sp!} title={label} />}
            </div>
          </div>
        </section>
      )}

      {(artwork.length > 0 || proofs.length > 0) && docsBase && (
        <section className="py-14 sm:py-20" data-section="downloads" id="artwork">
          <div className={`${WRAP} grid gap-10 lg:grid-cols-2`}>
            {artwork.length > 0 && (
              <div>
                <Heading kicker="Branding" title={`${label} wrap templates`} />
                <p className="mt-4 text-[1rem] leading-relaxed text-[#5E5853]">Designing your own wrap or signage? Download the templates, add your artwork and send it back — no need to ask us first.</p>
                <ul className="mt-6 divide-y divide-[#EDE3DB] rounded-[22px] bg-white ring-1 ring-[#EDE3DB]">
                  {artwork.map((d) => (
                    <li key={d.id}><a href={`${docsBase}/${d.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[#FFFBF8]" data-track={`Download template: ${d.name}`}>
                      <span className="min-w-0"><span className="block font-semibold">{d.name}</span>{d.description && <span className="block text-[0.875rem] text-[#5E5853]">{d.description}</span>}</span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-[0.875rem] font-semibold text-[var(--pk)]"><Download className="h-4 w-4" />Download</span>
                    </a></li>
                  ))}
                </ul>
              </div>
            )}
            {proofs.length > 0 && (
              <div>
                <Heading kicker="Peace of mind" title="Food licence & public liability" />
                <p className="mt-4 text-[1rem] leading-relaxed text-[#5E5853]">We&apos;re a registered food business and fully insured. Download the documents for your venue or event organiser.</p>
                <ul className="mt-6 divide-y divide-[#EDE3DB] rounded-[22px] bg-white ring-1 ring-[#EDE3DB]">
                  {proofs.map((d) => (
                    <li key={d.id}><a href={`${docsBase}/${d.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[#FFFBF8]">
                      <span className="min-w-0"><span className="block font-semibold">{d.category}</span><span className="block text-[0.875rem] text-[#5E5853]">{d.name}{d.expires_on ? ` · current to ${new Date(`${d.expires_on}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : ""}</span></span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-[0.875rem] font-semibold text-[var(--pk)]"><Download className="h-4 w-4" />Download</span>
                    </a></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="bg-[#FFF7F5] py-14 sm:py-20" data-section="faq">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[0.8fr_1.2fr]`}>
          <Heading kicker="Questions" title="Good to know" />
          <div className="divide-y divide-[#EDE3DB] rounded-[24px] bg-white px-6 ring-1 ring-[#EDE3DB] sm:px-8">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.0625rem] font-semibold">{f.q}<ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" /></summary>
                <p className="mt-3 text-[0.9688rem] leading-relaxed text-[#5E5853]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <QuoteBand slug={org.slug} kind={kind} title={s.fleet[kind] === 1 ? `Grab the ${lower} before someone else does` : `Book up to ${s.fleet[kind]} ${lower}s`} body={s.fleet[kind] === 1 ? `There's only one, and popular dates go fast.` : "Check your date and get your itemised quote by email."} />

      <section className="pb-20" data-section="contact">
        <div className="mx-auto w-full max-w-[940px] px-5 sm:px-8">
          <ContactForm slug={org.slug} section="events" heading={`Questions about ${lower} hire?`} intro="Send us a message and we'll get back to you." messageHint="Tell us about your event" />
        </div>
      </section>
    </EventsFrame>
  );
}
