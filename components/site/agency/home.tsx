import Link from "next/link";
import { ArrowUpRight, Check, Mail, MapPin, Phone } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { readSite } from "@/lib/site/site";
import { readApptSettings } from "@/lib/appointments/core";
import { AGENCY, BUILT, CATEGORIES, CLIENTS, HOME_FAQS, POINTS, PROCESS, TESTIMONIALS, YEAR_STATS, serviceBySlug } from "@/lib/site/agency/content";
import { QuoteForm } from "./forms";
import { BTN, FaqList, H2, Icon, WRAP } from "./ui";
import { Brackets, Cup, Cursor, EditorLaptop, HandArrow, OrganicClip, Sparks, StepArrow, Underline, WorkspaceScene } from "./deco";
import { Testimonials } from "./testimonials";

const eyebrow = "text-[0.8125rem] font-bold uppercase tracking-[0.12em] text-[var(--ink)]";
const lede = "text-[1.125rem] leading-[1.65] text-[var(--muted)] sm:text-[1.1875rem]";
const Arrow = () => <ArrowUpRight aria-hidden className="ag-arrow h-[18px] w-[18px]" strokeWidth={2.2} />;

/**
 * The agency's home page, top to bottom: hero, credibility strip, selected work, all things digital (six categories),
 * the people, LeadPages, software, process, reviews, FAQs and the contact form. Only real clients, reviews, numbers
 * and products appear; photos come from Website settings (hero and about images) and fall back to illustrations.
 */
export function AgencyHome({ org }: { org: PublicOrg }) {
  const base = `/site/${org.slug}`;
  const phone = org.contact_phone || AGENCY.phone, email = org.contact_email || AGENCY.email, address = org.address || AGENCY.address;
  const tel = `tel:${phone.replace(/[^\d+]/g, "")}`;
  const images = readSite(org.rawSettings).images;
  const appt = readApptSettings(org.rawSettings);
  const meet = appt.enabled && appt.on_website ? `${base}/meet` : `${base}/quote`;
  const lp = serviceBySlug("leadpages");
  const [featured, ...others] = BUILT;

  return (
    <>
      {/* 01 — Hero */}
      <section className="relative overflow-hidden" aria-labelledby="hero-h">
        <OrganicClip id="ag-organic" />
        <div className={`${WRAP} relative grid lg:min-h-[min(780px,calc(100svh-76px))] lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]`}>
          <div className="relative z-10 flex flex-col justify-center pb-10 pt-10 sm:pt-14 lg:py-16 lg:pr-6">
            <p className={`ag-in ag-d1 flex items-center gap-3 ${eyebrow}`}><span>Independent digital studio · Canberra, Australia</span><span aria-hidden className="hidden h-[3px] w-16 rounded-full bg-[var(--lime)] sm:block" /></p>
            <h1 id="hero-h" className="ag-serif ag-in ag-d2 mt-6 text-[2.875rem] font-semibold leading-[0.98] tracking-[-0.03em] text-[var(--ink)] sm:text-[4.25rem] lg:text-[3.5rem] xl:text-[4rem] 2xl:text-[5.25rem]">
              Good people.<br />Great websites.<br /><em className="font-medium text-[var(--forest)]">Seriously clever tech.</em>
            </h1>
            <p className={`ag-in ag-d3 mt-7 max-w-[34rem] ${lede} text-[var(--text)]`}>We design, build, host and grow digital experiences for businesses with big ideas. All the clever stuff, without the complicated conversations.</p>
            <div className="ag-in ag-d3 mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={`${base}/quote`} className={`${BTN.primary} px-7`}>Let&apos;s build something<Arrow /></Link>
              <Link href={`${base}#work`} className={`${BTN.ghostLight} px-7`}>Explore our work<Arrow /></Link>
            </div>
            <p className="ag-in ag-d4 mt-9 flex items-end gap-3 text-[var(--ink)]">
              <Cup className="h-9 w-9 shrink-0" />
              <span className="relative pb-1.5"><span className="ag-hand text-[1.5rem] leading-none sm:text-[1.625rem]">Powered by curiosity, code &amp; probably too much coffee.</span><Underline draw className="absolute -bottom-1 left-[30%] h-3 w-[70%]" /></span>
            </p>
          </div>
          <div className="relative -mx-5 sm:-mx-8 lg:mx-0">
            <div className="ag-reveal relative h-[400px] overflow-hidden rounded-t-[40px] sm:h-[520px] lg:absolute lg:inset-y-0 lg:left-0 lg:right-[calc(-1*(100vw-min(100vw,1520px))/2-3rem)] lg:h-auto lg:rounded-none lg:[clip-path:url(#ag-organic)] 2xl:right-[calc(-1*(100vw-min(100vw,1520px))/2-4rem)]">
              {images.hero
                ? <img src={images.hero} alt="Inside the Web Culture studio" className="h-full w-full object-cover" fetchPriority="high" />
                : <WorkspaceScene className="h-full w-full" />}
            </div>
          </div>
        </div>
      </section>

      {/* Credibility strip */}
      <section aria-label={`What we did in ${YEAR_STATS.year}`} className="relative z-10">
        <div className={WRAP}>
          <div className="grid items-center gap-6 rounded-[28px] border border-[var(--line)] bg-[var(--card)] px-6 py-7 sm:grid-cols-2 sm:px-10 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] lg:gap-0 lg:divide-x lg:divide-[var(--line)] lg:py-8">
            <div className="sm:col-span-2 lg:col-span-1 lg:pr-8"><p className="ag-serif text-[1.875rem] font-semibold leading-[1.02] text-[var(--ink)]">Local. Reliable.<br />Proven.</p><p className="mt-2 text-[0.875rem] text-[var(--muted)]">Our {YEAR_STATS.year} in numbers</p></div>
            {YEAR_STATS.items.map((s, i) => (
              <div key={s.label} className="flex items-center gap-4 lg:px-8">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-[rgba(20,45,35,.8)] text-[var(--ink)]"><Icon k={(["design", "seo", "globe"] as const)[i]} className="h-5 w-5" /></span>
                <span><span className="block text-[1.875rem] font-extrabold leading-none tracking-[-0.03em] text-[var(--ink)]">{s.value}</span><span className="mt-1 block text-[0.9375rem] leading-snug text-[var(--muted)]">{s.label[0].toUpperCase() + s.label.slice(1)}</span></span>
              </div>
            ))}
            <div className="flex items-center gap-4 lg:px-8">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-[rgba(20,45,35,.8)] text-[var(--ink)]"><Icon k="map" className="h-5 w-5" /></span>
              <span><span className="block text-[1.125rem] font-extrabold leading-tight text-[var(--ink)]">Local support</span><span className="mt-1 block text-[0.875rem] leading-snug text-[var(--muted)]">From our office in Mitchell, ACT</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* 02 — Selected work */}
      <section id="work" className="scroll-mt-24 py-20 sm:py-28" aria-labelledby="work-h">
        <div className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <H2 id="work-h" className="max-w-[13ch] text-[var(--ink)]">Good-looking websites that actually work.</H2>
            <p className="mt-6 flex items-start gap-2 text-[var(--ink)]"><span className="ag-hand text-[1.75rem] leading-none">Real projects. Real results.</span><HandArrow className="mt-2 h-10 w-14 rotate-[-8deg] text-[var(--ink)]" /></p>
            <p className={`mt-6 max-w-[40ch] ${lede}`}>A few of the Canberra businesses whose websites we&apos;ve designed, built or looked after.</p>
            <Link href={`${base}/quote`} className={`${BTN.ghostLight} mt-8`}>Start your project<Arrow /></Link>
          </div>
          <ul className="border-t border-[rgba(20,45,35,.15)]">
            {CLIENTS.map((c) => (
              <li key={c} className="group border-b border-[rgba(20,45,35,.15)]">
                <p className="ag-serif flex items-baseline justify-between gap-6 py-6 text-[1.75rem] font-medium leading-tight text-[var(--ink)] sm:py-7 sm:text-[2.5rem] xl:text-[2.875rem]">
                  <span className="bg-[linear-gradient(var(--lime),var(--lime))] bg-[length:0%_0.22em] bg-[position:0_88%] bg-no-repeat transition-[background-size] duration-500 group-hover:bg-[length:100%_0.22em]">{c}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 03 — All things digital */}
      <section className="pb-20 sm:pb-28" aria-labelledby="all-h">
        <div className={WRAP}>
          <div className="ag-dark relative overflow-hidden rounded-[36px] bg-[var(--ink)] px-6 py-12 text-[var(--card)] sm:px-12 sm:py-16 xl:px-16 xl:py-20">
            <div className="grid gap-12 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,2fr)] xl:gap-14">
              <div>
                <H2 id="all-h" className="relative inline-block text-[2.5rem] text-[var(--card)] sm:text-[3.5rem] xl:text-[3rem] 2xl:text-[3.375rem]"><span className="sm:whitespace-nowrap">All things digital.</span><br /><span className="sm:whitespace-nowrap">Under one roof.</span><Underline className="absolute -bottom-4 left-0 h-4 w-[70%]" /></H2>
                <p className="mt-10 max-w-[32ch] text-[1.0625rem] leading-relaxed text-[rgba(252,250,245,.7)]">We build it, host it, keep it updated and help it grow. When something breaks, you talk to the people who built it.</p>
              </div>
              <ul className="grid gap-px overflow-hidden rounded-[20px] bg-[var(--line-dark)] sm:grid-cols-2 lg:grid-cols-3">
                {CATEGORIES.map((c) => (
                  <li key={c.key} className="bg-[var(--ink)]">
                    <Link href={`${base}/${c.href}`} className="group grid h-full grid-cols-[auto_1fr] gap-x-4 p-5 transition-colors hover:bg-[var(--forest)] sm:flex sm:flex-col sm:p-7">
                      <span className="row-span-2 text-[var(--lime)] transition-transform duration-300 group-hover:-translate-y-0.5"><Icon k={c.icon} className="h-7 w-7 sm:h-8 sm:w-8" /></span>
                      <span className="flex sm:mt-5 items-start justify-between gap-3 text-[1.1875rem] font-bold leading-snug">{c.name}<ArrowUpRight aria-hidden className="ag-arrow mt-1 h-5 w-5 shrink-0 text-[var(--lime)] opacity-60 group-hover:opacity-100" strokeWidth={2} /></span>
                      <span className="col-start-2 mt-1.5 text-[0.9688rem] leading-relaxed text-[rgba(252,250,245,.7)] sm:mt-2">{c.line}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 04 — The people behind the pixels */}
      <section id="about" className="scroll-mt-24 border-t border-[var(--line)] py-20 sm:py-28" aria-labelledby="about-h">
        <div className={`${WRAP} grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20`}>
          <div className="order-2 lg:order-1">
            {images.about ? (
              <img src={images.about} alt="The Web Culture team" loading="lazy" className="aspect-[5/4] w-full rounded-[36px] object-cover" />
            ) : (
              <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[36px] bg-[var(--sage-pale)]">
                <Brackets className="absolute left-[10%] top-[14%] h-16 w-24 text-[rgba(20,45,35,.8)]" />
                <Cursor className="absolute right-[16%] top-[22%] h-12 w-10 rotate-[-8deg] text-[var(--ink)]" />
                <Sparks className="absolute right-[12%] top-[14%] h-8 w-8 text-[var(--lime-ink)]" />
                <div className="absolute inset-x-[10%] bottom-[14%]">
                  <p className="ag-hand text-[2.25rem] leading-[1.05] text-[var(--ink)] sm:text-[2.75rem]">Upstairs from a coffee roastery,<br />in Mitchell, Canberra.</p>
                  <Underline className="mt-1 h-4 w-[60%]" />
                  <p className="mt-6 flex items-center gap-3 text-[1rem] font-semibold text-[var(--ink)]"><Cup className="h-8 w-8" />{address}</p>
                </div>
              </div>
            )}
          </div>
          <div className="order-1 lg:order-2">
            <p className={eyebrow}>The people behind the pixels</p>
            <H2 id="about-h" className="mt-5 text-[var(--ink)]">A little nerdy.<br /><em className="font-medium text-[var(--forest)]">A lot human.</em></H2>
            <div className={`mt-7 max-w-[52ch] space-y-4 ${lede}`}>
              <p>We&apos;re a Canberra-based team of designers, developers and digital problem-solvers. We love technology, but we&apos;re even more passionate about the people we work with.</p>
              <p>When something goes wrong, you&apos;ll speak to someone who understands your business and knows how to fix it.</p>
              <p className="font-semibold text-[var(--ink)]">No complicated conversations. No being passed around. Just good people who know their stuff.</p>
            </div>
            <ul className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {POINTS.map((p) => <li key={p} className="flex items-start gap-3 text-[1rem] font-medium text-[var(--text)]"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)]"><Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} /></span>{p}</li>)}
            </ul>
            <Link href={meet} className={`${BTN.primary} mt-10`}>Get to know us<Arrow /></Link>
          </div>
        </div>
      </section>

      {/* 05 — Meet LeadPages */}
      <section className="bg-[var(--card)] py-20 sm:py-28" aria-labelledby="lp-h">
        <div className={`${WRAP} grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16`}>
          <div className="ag-zoom relative">
            <EditorLaptop className="ag-zoom-target relative w-full" />
            <p className="ag-hand absolute -bottom-2 right-2 rotate-[-4deg] text-[1.5rem] text-[var(--ink)] sm:right-10">Click. Edit. Done.</p>
          </div>
          <div>
            <p className={eyebrow}><span className="text-[var(--lime-ink)]">Meet</span> LeadPages</p>
            <H2 id="lp-h" className="mt-5 text-[var(--ink)]">The smarter way to website.<Sparks className="ml-1 inline-block h-7 w-7 -translate-y-6 text-[var(--lime-ink)]" /></H2>
            <p className={`mt-6 max-w-[48ch] ${lede}`}>Our Australian-built platform makes it easier to create, manage and grow your website — without the complexity of traditional systems.</p>
            {lp && (
              <ul className="mt-8 space-y-4">
                {lp.benefits.filter((b) => ["Live visual editing", "An app marketplace", "Nothing to patch"].includes(b.title)).map((b) => (
                  <li key={b.title} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-[var(--lime)]"><Icon k={b.icon} /></span>
                    <span><span className="block font-bold text-[var(--ink)]">{b.title}</span><span className="block text-[0.9688rem] leading-relaxed text-[var(--muted)]">{b.text}</span></span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={`${base}/leadpages`} className={BTN.primary}>Explore LeadPages<Arrow /></Link>
              <Link href={`${base}/leadpages#compare`} className={BTN.ghostLight}>Compare with WordPress</Link>
            </div>
          </div>
        </div>
      </section>

      {/* 06 — Beyond websites */}
      <section id="software" className="scroll-mt-24 py-20 sm:py-28" aria-labelledby="sw-h">
        <div className={WRAP}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
            <div>
              <p className={eyebrow}>Beyond websites</p>
              <H2 id="sw-h" className="mt-5 text-[var(--ink)]">We build software,<br />not just websites.</H2>
            </div>
            <p className={`max-w-[50ch] ${lede} lg:justify-self-end`}>From business management platforms and booking systems to customer portals, integrations and automation, we build software that solves real business problems. These are products our team has built:</p>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <article className="ag-dark relative flex flex-col overflow-hidden rounded-[32px] bg-[var(--ink)] p-8 text-[var(--card)] sm:p-11">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--lime)] text-[1.375rem] font-extrabold text-[var(--ink)]" aria-hidden>{featured.name.slice(0, 1)}</span>
              <p className="mt-auto pt-16 text-[0.9375rem] font-semibold text-[var(--lime)]">{featured.kind}</p>
              <h3 className="ag-serif mt-2 text-[2.5rem] font-semibold leading-none sm:text-[3.25rem]">{featured.name}</h3>
              <p className="mt-5 max-w-[46ch] text-[1.125rem] leading-relaxed text-[rgba(252,250,245,.75)]">{featured.text}</p>
              <ul className="mt-8 flex flex-wrap gap-2">{featured.tags.map((t) => <li key={t} className="ag-mono rounded-full border border-[var(--line-dark)] px-3 py-1 text-[0.75rem] text-[rgba(252,250,245,.8)]">{t}</li>)}</ul>
            </article>
            <ul className="grid gap-5 sm:grid-cols-2">
              {others.slice(0, 4).map((b) => (
                <li key={b.name} className="flex flex-col rounded-[28px] border border-[var(--line)] bg-[var(--card)] p-6 sm:p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--ink)] text-[1rem] font-extrabold text-[var(--lime)]" aria-hidden>{b.name.slice(0, 1)}</span>
                  <p className="mt-5 text-[0.875rem] font-semibold text-[var(--muted)]">{b.kind}</p>
                  <h3 className="mt-1 text-[1.375rem] font-extrabold tracking-[-0.02em] text-[var(--ink)]">{b.name}</h3>
                  <p className="mt-2 flex-1 text-[0.9375rem] leading-relaxed text-[var(--muted)]">{b.text}</p>
                </li>
              ))}
            </ul>
          </div>
          <Link href={`${base}/ai-and-custom-apps`} className={`${BTN.ghostLight} mt-10`}>Explore custom software<Arrow /></Link>
        </div>
      </section>

      {/* 07 — Process */}
      <section className="border-t border-[var(--line)] py-20 sm:py-28" aria-labelledby="how-h">
        <div className={`${WRAP} grid gap-12 xl:grid-cols-[minmax(0,0.6fr)_minmax(0,2fr)] xl:items-center xl:gap-16`}>
          <H2 id="how-h" className="relative inline-block self-start text-[var(--ink)]">From idea<br />to internet.<Underline className="absolute -bottom-3 left-0 h-3 w-[75%]" /></H2>
          <ol className="grid gap-8 md:grid-cols-4 md:gap-4">
            {PROCESS.map((s, i) => (
              <li key={s.title} className="relative flex gap-5 md:block md:pr-8">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--lime)] text-[1.0625rem] font-extrabold text-[var(--ink)]">{i + 1}</span>
                {i < PROCESS.length - 1 && <StepArrow className="absolute right-0 top-3 hidden h-5 w-12 text-[rgba(20,45,35,.45)] md:block" />}
                {i < PROCESS.length - 1 && <span aria-hidden className="absolute bottom-[-2rem] left-[21px] top-12 w-px bg-[rgba(20,45,35,.2)] md:hidden" />}
                <span className="block md:mt-5">
                  <span className="block text-[1.25rem] font-extrabold tracking-[-0.01em] text-[var(--ink)]">{s.title}</span>
                  <span className="mt-2 block text-[1rem] leading-relaxed text-[var(--muted)]">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 08 — Reviews */}
      <section className="bg-[var(--sage-pale)] py-20 sm:py-28" aria-labelledby="tst-h">
        <div className={WRAP}>
          <H2 id="tst-h" className="text-center text-[var(--ink)]">Nice things from nice people.</H2>
          <div className="mt-12"><Testimonials items={TESTIMONIALS} /></div>
        </div>
      </section>

      {/* 09 — FAQs */}
      <section className="py-20 sm:py-28" aria-labelledby="faq-h">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
          <div>
            <H2 id="faq-h" className="text-[var(--ink)]">Questions people ask us.</H2>
            <p className={`mt-6 max-w-[36ch] ${lede}`}>Something else on your mind? Call us on <a href={tel} className="font-semibold text-[var(--ink)] underline decoration-[var(--lime)] decoration-2 underline-offset-4">{phone}</a> — a real person answers.</p>
          </div>
          <FaqList faqs={HOME_FAQS} />
        </div>
      </section>

      {/* 10 — Contact */}
      <section id="contact" className="scroll-mt-24 pb-20 sm:pb-28" aria-labelledby="cta-h">
        <div className={WRAP}>
          <div className="grid gap-10 overflow-hidden rounded-[36px] bg-[var(--card)] p-6 ring-1 ring-[var(--line)] sm:p-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 xl:p-16">
            <div>
              <H2 id="cta-h" className="text-[var(--ink)]">Something brewing?<br /><em className="font-medium text-[var(--forest)]">Let&apos;s talk.</em></H2>
              <p className={`mt-6 max-w-[44ch] ${lede}`}>Good things start with a conversation. Tell us what you&apos;re working on and we&apos;ll help you figure out the best way forward.</p>
              <ul className="mt-9 space-y-4 text-[1.0625rem] font-semibold text-[var(--ink)]">
                <li><a href={tel} className="inline-flex items-center gap-3 hover:underline hover:decoration-[var(--lime)] hover:decoration-2 hover:underline-offset-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--ink)] text-[var(--lime)]"><Phone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>{phone}</a></li>
                <li><a href={`mailto:${email}`} className="inline-flex items-center gap-3 hover:underline hover:decoration-[var(--lime)] hover:decoration-2 hover:underline-offset-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--ink)] text-[var(--lime)]"><Mail aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>{email}</a></li>
                <li className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--lime)]"><MapPin aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>{address}</li>
              </ul>
              <p className="mt-9 text-[0.9375rem] text-[var(--muted)]">Already a client with a problem? <Link href={`${base}/support`} className="font-semibold text-[var(--ink)] underline underline-offset-4">Lodge a support ticket</Link>.</p>
            </div>
            <div className="rounded-[28px] bg-[var(--paper)] p-6 sm:p-9">
              <p className="mb-6 text-[1.375rem] font-extrabold tracking-[-0.02em] text-[var(--ink)]">Quick quote</p>
              <QuoteForm slug={org.slug} variant="quick" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
