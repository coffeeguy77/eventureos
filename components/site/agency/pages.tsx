import Link from "next/link";
import { KeyRound, Mail, Phone } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { AGENCY, type Faq } from "@/lib/site/agency/content";
import { PageHero } from "./landing";
import { QuoteForm, SupportForm } from "./forms";
import { BTN, FaqList, H2, WRAP } from "./ui";

export const SUPPORT_FAQS: Faq[] = [
  { q: "Do I need an account to lodge a ticket?", a: "No. Anyone can lodge a ticket here. If you're already a client, use the email address we know you by and we'll link it to your account automatically." },
  { q: "How do I follow my ticket?", a: "Sign in to the client portal with your email address. We'll email you a one-time code — no password needed — and you'll see every ticket and update under Support." },
  { q: "What does support cost?", a: "Website, email and server support is $120 + GST an hour. Work covered by a maintenance check or another agreement is billed as agreed. If something will take a while, we'll tell you before we start." },
  { q: "Something is down right now. What should I do?", a: "Lodge the ticket so we have the details, then call us so we know it's urgent." },
];

export function AgencySupport({ org }: { org: PublicOrg }) {
  const phone = org.contact_phone || AGENCY.phone, email = org.contact_email || AGENCY.email;
  const portal = `/p/${org.slug}/support`;
  return (
    <>
      <PageHero org={org} label="Support" title="Lodge a support request" lede="Tell us what's wrong with your website, email or server. You'll get a ticket number straight away, and you can follow progress in your client portal." />
      <section className="ag-light py-16 sm:py-20">
        <div className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-16`}>
          <div className="rounded-[28px] border border-[var(--line)] bg-white p-6 sm:p-10">
            <h2 className="mb-7 text-[1.5rem] font-semibold tracking-[-0.02em]">Your request</h2>
            <SupportForm slug={org.slug} portal={portal} phone={phone} />
          </div>
          <div className="space-y-6">
            <div className="rounded-[28px] bg-[var(--ink)] p-7 text-white sm:p-8">
              <KeyRound aria-hidden className="h-7 w-7 text-[var(--lime)]" strokeWidth={1.6} />
              <h2 className="mt-4 text-[1.25rem] font-semibold">Track it in your client portal</h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/70">See every ticket, every update and what&apos;s been done. Sign in with your email — we send you a one-time code, no password to remember.</p>
              <Link href={portal} className={`${BTN.lime} mt-6`}>Open the client portal</Link>
            </div>
            <div className="rounded-[28px] border border-[var(--line)] bg-white p-7 sm:p-8">
              <h2 className="text-[1.25rem] font-semibold">What happens next</h2>
              <ol className="mt-5 space-y-5">
                {[
                  ["You get a ticket number", "Straight away, on screen. Keep it handy if you call us."],
                  ["We triage it", "Someone from our team reads it, asks anything we need and lets you know the next step."],
                  ["We fix it", "Updates are added to your ticket as we work, and you'll hear from us by email."],
                  ["Marked done", "Once it's sorted we mark the ticket done and let you know."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--paper)] text-[0.9375rem] font-semibold text-[var(--ac-ink)]">{i + 1}</span>
                    <span><span className="block font-semibold">{t}</span><span className="mt-0.5 block text-[0.9375rem] leading-relaxed text-[var(--muted)]">{d}</span></span>
                  </li>
                ))}
              </ol>
              <div className="mt-7 space-y-2 border-t border-[var(--line)] pt-5 text-[0.9375rem]">
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2.5 hover:underline"><Phone aria-hidden className="h-4 w-4 text-[var(--ac-ink)]" strokeWidth={1.6} />{phone}</a>
                <a href={`mailto:${email}`} className="flex items-center gap-2.5 hover:underline"><Mail aria-hidden className="h-4 w-4 text-[var(--ac-ink)]" strokeWidth={1.6} />{email}</a>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="ag-light border-t border-[var(--line)] bg-white py-16 sm:py-20" aria-labelledby="sfaq-h">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
          <H2 id="sfaq-h">Support questions</H2>
          <FaqList faqs={SUPPORT_FAQS} />
        </div>
      </section>
    </>
  );
}

export const QUOTE_FAQS: Faq[] = [
  { q: "Is a quote free?", a: "Yes. Tell us what you need and we'll come back with a clear price. Bigger or less certain projects sometimes start with a paid consultation — we'll say so up front." },
  { q: "What should I include?", a: "What your business does, what you want the website or app to achieve, any sites you like, and your current website if you have one. Rough is fine." },
  { q: "Are prices GST-inclusive?", a: "No — prices on this site exclude GST." },
];

export function AgencyQuote({ org, preselect }: { org: PublicOrg; preselect?: string }) {
  const phone = org.contact_phone || AGENCY.phone;
  return (
    <>
      <PageHero org={org} label="Get a quote" title="Get a quote" lede="A few details is all we need. We'll look at what you're after and come back with a clear price — no jargon, no obligation." />
      <section className="ag-light py-16 sm:py-20">
        <div className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:gap-16`}>
          <div className="rounded-[28px] border border-[var(--line)] bg-white p-6 sm:p-10">
            <QuoteForm slug={org.slug} variant="full" preselect={preselect} />
          </div>
          <div className="space-y-8">
            <div>
              <h2 className="text-[1.25rem] font-semibold">Rather talk?</h2>
              <p className="mt-2 text-[1rem] leading-relaxed text-[var(--muted)]">Call us on <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--ink)] underline underline-offset-2">{phone}</a>, or drop in to our office in Mitchell.</p>
            </div>
            <div className="rounded-[24px] bg-[var(--ink)] p-7 text-white">
              <h2 className="text-[1.125rem] font-semibold">Existing client with a problem?</h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/70">Support requests are quicker as a ticket — you&apos;ll get a number and can follow it in your portal.</p>
              <Link href={`/site/${org.slug}/support`} className={`${BTN.lime} mt-5`}>Lodge a support ticket</Link>
            </div>
            <FaqList faqs={QUOTE_FAQS} />
          </div>
        </div>
      </section>
    </>
  );
}
