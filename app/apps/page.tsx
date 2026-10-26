import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { mkSerif } from "@/components/marketing/fonts";
import { Reveal } from "@/components/marketing/reveal";
import { Wordmark, DEFAULT_LOOK } from "@/components/marketing/sales-page";
import { AppsShowcase } from "@/components/marketing/apps-showcase";
import { APPS } from "@/lib/apps";
import "@/components/marketing/marketing.css";

const TITLE = "Apps — EventureOS";
const DESCRIPTION = `Hire, classes, an academy, an online shop, wholesale, kitchen, wages, your website and more: ${APPS.length} apps that plug into EventureOS's enquiries, quotes, events and invoices.`;

export const metadata: Metadata = {
  title: { absolute: TITLE }, description: DESCRIPTION, alternates: { canonical: "/apps" },
  openGraph: { type: "website", url: "https://www.eventureos.com.au/apps", siteName: "EventureOS", title: TITLE, description: DESCRIPTION, locale: "en_AU", images: [{ url: "/brand/og.png", width: 1200, height: 630 }] },
};

export default function AppsPage() {
  return (
    <div className={`mk ${mkSerif.variable} relative`} data-look={DEFAULT_LOOK}>
      <Reveal />
      <header data-band="a" className="sticky top-0 z-50 border-b border-[rgb(var(--line)/var(--line-a))] bg-[rgb(var(--bg)/.72)] backdrop-blur-xl">
        <div className="mk-wrap flex h-[64px] items-center gap-4 sm:h-[72px] sm:gap-8">
          <Link href="/" aria-label="EventureOS home" className="shrink-0"><Wordmark className="h-[18px] w-auto sm:h-[22px]" /></Link>
          <nav aria-label="Main" className="hidden items-center gap-7 text-[0.875rem] text-[rgb(var(--muted))] lg:flex">
            <Link href="/#how" className="hover:text-[rgb(var(--ink))]">How it works</Link>
            <Link href="/apps" className="text-[rgb(var(--ink))]">Apps</Link>
            <Link href="/#pricing" className="hover:text-[rgb(var(--ink))]">Pricing</Link>
            <Link href="/#faq" className="hover:text-[rgb(var(--ink))]">FAQ</Link>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <Link href="/login" className="whitespace-nowrap px-2 py-2 text-[0.875rem] font-medium text-[rgb(var(--ink))] hover:text-[rgb(var(--accent))] sm:px-3">Sign in</Link>
            <Link href="/#demo" className="mk-btn mk-btn-primary !h-10 !px-4 text-[0.875rem]"><span className="sm:hidden">Demo</span><span className="hidden sm:inline">Book a demo</span></Link>
          </div>
        </div>
      </header>
      <main>
        <section data-band="a" className="mk-grain relative overflow-hidden pb-16 pt-16 sm:pt-24">
          <div aria-hidden className="mk-gridlines absolute inset-0" />
          <div aria-hidden className="mk-glow left-1/2 top-[-240px] h-[620px] w-[980px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(var(--mk-pink)/.5),transparent)]" />
          <div className="mk-wrap relative mx-auto max-w-[1000px] text-center">
            <p className="mk-eyebrow">Apps</p>
            <h1 className="mk-h1 mt-6">One system. <em className="mk-grad-text [font-style:italic]">Every part of the business.</em></h1>
            <p className="mk-muted mx-auto mt-7 max-w-[44rem] text-[clamp(1.0625rem,.95rem+.4vw,1.3rem)] leading-relaxed">
              Start with enquiries, quotes, events and invoices. Then switch on the apps your business runs on: hire, classes, a shop, wholesale, a kitchen, wages and your website. They share one set of clients, one calendar and one set of books.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href="#hire" className="mk-btn mk-btn-ghost w-full sm:w-auto">Browse the apps</a>
              <Link href="/#demo" className="mk-btn mk-btn-primary w-full sm:w-auto">Book a demo <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>
        <AppsShowcase />
      </main>
      <footer data-band="b" className="border-t border-[rgb(var(--line)/var(--line-a))] py-12">
        <div className="mk-wrap mk-faint flex flex-wrap items-center justify-between gap-3 text-[0.8125rem]">
          <p>© {new Date().getFullYear()} EventureOS</p>
          <p className="flex gap-5"><Link href="/" className="hover:text-[rgb(var(--ink))]">Home</Link><Link href="/#demo" className="hover:text-[rgb(var(--ink))]">Book a demo</Link><Link href="/login" className="hover:text-[rgb(var(--ink))]">Sign in</Link></p>
        </div>
      </footer>
    </div>
  );
}
