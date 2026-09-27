import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, BarChart3, CalendarCheck2, Check, Clock3, CreditCard, Eye, FileText, Globe, Inbox, LayoutGrid, Lock, Mail,
  MessageSquareText, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import { mkSerif } from "./fonts";
import { Reveal } from "./reveal";
import { LookSwitcher, type Look } from "./look-switcher";
import { HeroActivity, Showcase, WorkflowStory, type Stage } from "./interactive";
import { CalendarMock, DashboardMock, EnquiriesMock, EventMock, PortalMock, QuoteMock, ReportsMock } from "./app-mock";
import { DemoForm } from "./demo-form";
import { Pricing, type Plan } from "./pricing";
import "./marketing.css";

export const DEFAULT_LOOK: Look = "midnight";

/** Real plans go here when they're final — the Pricing section renders them instead of the "being finalised" panel. */
const PLANS: Plan[] = [];

const FAQ: [string, string][] = [
  ["Who is EventureOS for?", "Event businesses that quote, book and deliver jobs — caterers, mobile bars and coffee carts, event hire, venues, planners and entertainment. If your week is enquiries, quotes, rosters and invoices, it’s built for you."],
  ["Do I have to change my email or my accounting software?", "No. EventureOS connects to the Gmail and Xero you already use. Gmail stays your mailbox and Xero stays your books — EventureOS keeps the event side of the business in one place and keeps both in step."],
  ["Will EventureOS bring me new leads?", "No — it isn’t a marketing tool. It makes sure every enquiry that reaches you, from your website form or your inbox, is captured, sorted and answered quickly, so fewer good jobs slip away."],
  ["How do my customers pay?", "Every invoice can have a secure card-payment link, and customers with a portal login can pay from there. Payments go straight into your own Stripe account and are recorded against the invoice — and in Xero if the invoice lives there. Bank transfer still works as usual."],
  ["Can my staff use it without seeing our prices?", "Yes. Give people the role that fits — owner, admin, manager, sales or staff. Staff see only the jobs they’re rostered on, and never your figures unless you choose to show them what’s included."],
  ["What does the AI actually do?", "It sorts incoming email into enquiries, replies and junk, pulls out event details, and drafts replies in your voice for you to check and send. Prices always come from your own price list — never from the AI."],
  ["Does it work on a phone?", "Yes. EventureOS runs in the browser on phone, tablet and desktop, and you can add it to your home screen — handy for checking a job or approving a booking when you’re not at your desk."],
  ["Which tools does it connect to?", "Today: Gmail, Google Calendar, Xero and Stripe. Outlook / Microsoft 365, MYOB and QuickBooks aren’t supported yet."],
  ["How much does it cost?", "Plans are being finalised. Book a demo and we’ll talk you through access for your business."],
];

function Wordmark({ className }: { className?: string }) {
  return (
    <>
      <Image src="/brand/eventureos-wordmark-white.png" alt="EventureOS" width={152} height={23} priority className={`mk-wm-light ${className ?? ""}`} />
      <Image src="/brand/eventureos-wordmark.png" alt="EventureOS" width={152} height={23} priority className={`mk-wm-dark ${className ?? ""}`} />
    </>
  );
}

function Mini({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div aria-hidden className={`mk-app rounded-2xl p-4 text-[11px] ${className ?? ""}`}>{children}</div>;
}

export function SalesPage() {
  const stages: Stage[] = [
    { id: "enquiry", step: "01 · Enquiry", title: "Every enquiry lands in one place.",
      body: "Your website form and your Gmail inbox feed straight into EventureOS. New enquiries are sorted from replies and junk as they arrive, so the good ones are at the top.",
      points: ["Website form and Gmail, together", "AI pulls out date, guests and what they want", "Spam folder and blocked senders keep the inbox clean", "Your own team’s emails never clutter it"],
      visual: <EnquiriesMock compact /> },
    { id: "client", step: "02 · Client", title: "The whole history, before you reply.",
      body: "Every enquiry is matched to the client and their past jobs — invoices and quotes from Xero, calendar bookings and every email — so you know who you’re talking to.",
      points: ["Client record with lifetime value", "Past invoices and quotes brought in from Xero", "Emails and calendar bookings linked automatically"],
      visual: <EventMock compact /> },
    { id: "quote", step: "03 · Quote", title: "Price the job in minutes, not an evening.",
      body: "Set your price list and rules once — minimum hours, staffing, delivery, menus — then price a job by entering times and guests. The totals, GST and suggestions do themselves.",
      points: ["Your price list, your rules", "Menus with per-person pricing", "Draft replies in your voice, with the right prices"],
      visual: <QuoteMock compact /> },
    { id: "accept", step: "04 · Accepted", title: "Customers accept online. You stay in control.",
      body: "Clients review and accept in their own portal, with their name and the time recorded. Last-minute bookings wait for your approval instead of confirming themselves.",
      points: ["Accept or decline from the portal", "Short-notice bookings held for approval", "Quotes that go quiet are flagged for follow-up"],
      visual: <PortalMock /> },
    { id: "booked", step: "05 · Booked", title: "Confirmed, calendared and rostered.",
      body: "Once a booking is confirmed it goes onto your Google Calendar with your rostered staff and the client invited. Your roster person is added to every job automatically.",
      points: ["Google Calendar, without double entry", "Staff see only their jobs — never your prices", "Everyone on the client’s side kept in the loop"],
      visual: <CalendarMock compact /> },
    { id: "paid", step: "06 · Paid", title: "Invoiced on acceptance. Paid by card.",
      body: "A deposit or full invoice is raised the moment a quote is accepted — due immediately if the event is sooner than your terms. Customers pay by card and it’s recorded for you.",
      points: ["Deposit or full invoice, automatically", "Card payments into your own Stripe account", "Payments recorded in Xero"],
      visual: (
        <Mini className="mx-auto max-w-md p-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider a-faint">Deposit invoice INV-2302</p>
          <p className="mt-1 text-[26px] font-semibold tracking-tight">$1,079.10</p>
          <p className="a-muted">Harbour & Vine — wedding · due today</p>
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl a-pink-bg py-3 text-[13px] font-semibold"><CreditCard className="h-4 w-4" />Pay by card</div>
          <div className="mt-4 space-y-2 border-t a-line pt-4">
            {["Paid by card — recorded on the invoice", "Added to Xero against your Stripe account", "You’re notified straight away"].map((x) => (
              <p key={x} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#6ee7b7]" />{x}</p>
            ))}
          </div>
        </Mini>
      ) },
    { id: "report", step: "07 · Reported", title: "See how the business is really going.",
      body: "Revenue received and value booked by month, where enquiries come from and how many you win, how fast you reply, and who owes you — without building a spreadsheet.",
      points: ["Revenue and booked value by month", "Enquiries by source and quote win rate", "Response time and outstanding invoices"],
      visual: <ReportsMock compact /> },
  ];

  return (
    <div className={`mk ${mkSerif.variable} relative`} data-look={DEFAULT_LOOK}>
      <Reveal />
      <LookSwitcher defaultLook={DEFAULT_LOOK} />

      {/* ------------------------------------------------ Nav */}
      <header data-band="a" className="sticky top-0 z-50 border-b border-[rgb(var(--line)/var(--line-a))] bg-[rgb(var(--bg)/.72)] backdrop-blur-xl">
        <div className="mk-wrap flex h-[64px] items-center gap-4 sm:h-[72px] sm:gap-8">
          <Link href="/" aria-label="EventureOS home" className="shrink-0"><Wordmark className="h-[18px] w-auto sm:h-[22px]" /></Link>
          <nav aria-label="Main" className="hidden items-center gap-7 text-[0.875rem] text-[rgb(var(--muted))] lg:flex">
            <a href="#how" className="hover:text-[rgb(var(--ink))]">How it works</a>
            <a href="#product" className="hover:text-[rgb(var(--ink))]">Product</a>
            <a href="#integrations" className="hover:text-[rgb(var(--ink))]">Integrations</a>
            <a href="#pricing" className="hover:text-[rgb(var(--ink))]">Pricing</a>
            <a href="#faq" className="hover:text-[rgb(var(--ink))]">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <Link href="/login" className="whitespace-nowrap px-2 py-2 text-[0.875rem] font-medium sm:px-3 text-[rgb(var(--ink))] hover:text-[rgb(var(--accent))]">Sign in</Link>
            <a href="#demo" className="mk-btn mk-btn-primary !h-10 !px-4 text-[0.875rem]"><span className="sm:hidden">Demo</span><span className="hidden sm:inline">Book a demo</span></a>
          </div>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------ Hero */}
        <section data-band="a" className="mk-grain relative overflow-hidden pb-20 pt-16 sm:pt-24 lg:pb-28">
          <div aria-hidden className="mk-gridlines absolute inset-0" />
          <div aria-hidden className="mk-glow left-1/2 top-[-240px] h-[620px] w-[980px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(var(--mk-pink)/.55),transparent)]" />
          <div aria-hidden className="mk-glow right-[-160px] top-[260px] h-[520px] w-[520px] bg-[radial-gradient(closest-side,rgb(var(--mk-violet)/.5),transparent)]" />
          <div className="mk-wrap relative">
            <div className="mk-hero-copy mx-auto max-w-[1100px] text-center">
              <p data-reveal className="mk-eyebrow">Event management software</p>
              <h1 data-reveal style={{ "--d": "80ms" } as React.CSSProperties} className="mk-h1 mt-6">
                The operating system for <em className="mk-grad-text not-italic [font-style:italic]">event businesses.</em>
              </h1>
              <p data-reveal style={{ "--d": "160ms" } as React.CSSProperties} className="mk-hero-sub mk-muted mx-auto mt-7 max-w-[46rem] text-[clamp(1.0625rem,.95rem+.4vw,1.3rem)] leading-relaxed">
                Enquiries, clients, quotes, bookings, calendars, a customer portal and payments — connected, so every job moves from the first email to a paid invoice without slipping through the cracks.
              </p>
              <div data-reveal style={{ "--d": "240ms" } as React.CSSProperties} className="mk-hero-cta mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a href="#demo" className="mk-btn mk-btn-primary w-full sm:w-auto">Book a demo <ArrowRight className="h-4 w-4" /></a>
                <a href="#product" className="mk-btn mk-btn-ghost w-full sm:w-auto">Explore the product</a>
              </div>
              <p data-reveal style={{ "--d": "320ms" } as React.CSSProperties} className="mk-faint mt-8 text-[0.8125rem]">
                Connects with <span className="text-[rgb(var(--muted))]">Gmail</span> · <span className="text-[rgb(var(--muted))]">Google Calendar</span> · <span className="text-[rgb(var(--muted))]">Xero</span> · <span className="text-[rgb(var(--muted))]">Stripe</span>
              </p>
            </div>
            <div className="relative mx-auto mt-16 max-w-[1240px] lg:mt-20">
              <div className="mk-tilt"><DashboardMock /></div>
              <HeroActivity />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Marquee */}
        <div data-band="b" aria-hidden className="relative overflow-hidden border-y border-[rgb(var(--line)/var(--line-a))] py-6">
          <div className="mk-marquee flex w-max gap-10 whitespace-nowrap">
            {[0, 1].map((k) => (
              <div key={k} className="flex gap-10">
                {["Enquiry", "Client", "Quote", "Accepted", "Booked", "Rostered", "Invoiced", "Paid", "Reported"].map((w, i) => (
                  <span key={w + k} className="mk-serif flex items-center gap-10 text-[2.25rem] text-[rgb(var(--muted))]">
                    <span className={i % 3 === 1 ? "mk-grad-text [font-style:italic]" : ""}>{w}</span><span className="text-[rgb(var(--accent))]">→</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------ Workflow story */}
        <section id="how" data-band="a" className="relative py-24 sm:py-32">
          <div className="mk-wrap">
            <div className="max-w-[52rem]">
              <p data-reveal className="mk-eyebrow">How it works</p>
              <h2 data-reveal className="mk-h2 mt-5">From first enquiry to final payment — <span className="mk-grad-text [font-style:italic]">one connected thread.</span></h2>
              <p data-reveal className="mk-muted mt-6 text-[1.125rem] leading-relaxed">Most event businesses run on an inbox, a spreadsheet, a calendar and an accounting app that don’t talk to each other. EventureOS follows each job all the way through, and passes what it knows to the next step.</p>
            </div>
            <div className="mt-16 lg:mt-8"><WorkflowStory stages={stages} /></div>
          </div>
        </section>

        {/* ------------------------------------------------ Outcomes */}
        <section data-band="b" className="relative py-24 sm:py-32">
          <div className="mk-wrap">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
              <div>
                <p data-reveal className="mk-eyebrow">Why it matters</p>
                <h2 data-reveal className="mk-h2 mt-5">Less chasing. <br />More events.</h2>
                <p data-reveal className="mk-muted mt-6 text-[1.125rem] leading-relaxed">When every detail lives in one place, you answer faster, forget less, and walk into every event knowing it’s all been handled.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { i: Clock3, t: "Respond faster", d: "Enquiries are sorted as they arrive and a reply is drafted with the right prices, so you’re answering in minutes — even on a busy weekend." },
                  { i: LayoutGrid, t: "Stay organised", d: "Every job has one home: the client, quote, emails, staff, calendar, invoices and payments. No more piecing it together from five apps." },
                  { i: ShieldCheck, t: "Avoid missed details", d: "Short-notice bookings wait for your approval, quiet quotes are flagged, and staff see exactly what’s included for the jobs they’re on." },
                  { i: Eye, t: "See what’s happening", d: "A dashboard for today and reports for the year: what’s booked, what’s owing, where enquiries come from and how many you win." },
                ].map(({ i: I, t, d }, k) => (
                  <div key={t} data-reveal style={{ "--d": `${k * 80}ms` } as React.CSSProperties} className="mk-card group p-7 transition-transform duration-300 hover:-translate-y-1">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgb(var(--accent)/.12)] text-[rgb(var(--accent))]"><I className="h-5 w-5" /></span>
                    <h3 className="mt-6 text-[1.25rem] font-semibold tracking-tight">{t}</h3>
                    <p className="mk-muted mt-2 leading-relaxed">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Feature bento */}
        <section data-band="a" className="relative py-24 sm:py-32" aria-labelledby="features-h">
          <div className="mk-wrap">
            <div className="mx-auto max-w-[50rem] text-center">
              <p data-reveal className="mk-eyebrow">Everything in one place</p>
              <h2 id="features-h" data-reveal className="mk-h2 mt-5">Built for the way event businesses actually work.</h2>
            </div>
            <div className="mt-16 grid gap-4 lg:grid-cols-6">
              {/* Bookings & calendars */}
              <article data-reveal className="mk-card overflow-hidden p-7 lg:col-span-4 lg:p-9">
                <div className="flex items-center gap-2 text-[rgb(var(--accent))]"><CalendarCheck2 className="h-5 w-5" /><span className="mk-eyebrow">Bookings & calendars</span></div>
                <h3 className="mk-serif mt-4 text-[2rem] leading-tight">Every job, every date, every person — on one calendar.</h3>
                <p className="mk-muted mt-3 max-w-xl">Confirmed events appear on your Google Calendar with the right staff and client invited. Your past bookings come in too, so you can see a client’s history at a glance. A pipeline board shows every job from enquiry to completed.</p>
                <div className="mt-7"><CalendarMock compact /></div>
              </article>
              {/* CRM & communication */}
              <article data-reveal style={{ "--d": "80ms" } as React.CSSProperties} className="mk-card flex flex-col p-7 lg:col-span-2 lg:p-9">
                <div className="flex items-center gap-2 text-[rgb(var(--accent))]"><Users className="h-5 w-5" /><span className="mk-eyebrow">CRM & communication</span></div>
                <h3 className="mk-serif mt-4 text-[2rem] leading-tight">Know every client before you pick up the phone.</h3>
                <p className="mk-muted mt-3">One record per client with their events, quotes, invoices, emails and lifetime value. Reply from EventureOS and it sends from your own Gmail.</p>
                <Mini className="mt-auto translate-y-2 pt-4">
                  <p className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full a-raise text-[10px] font-semibold">HV</span><span><span className="block text-[12px] font-semibold">Harbour & Vine Estate</span><span className="block a-faint">Client since 2022 · 14 events</span></span></p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[["Lifetime", "$48.2k"], ["Upcoming", "2"], ["Owing", "$0"]].map(([k, v]) => <div key={k} className="rounded-lg a-raise py-2"><p className="a-faint text-[9.5px]">{k}</p><p className="text-[13px] font-semibold">{v}</p></div>)}
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 a-muted"><Mail className="h-3 w-3 a-pink" />Re: Final numbers for Saturday — 2h ago</p>
                </Mini>
              </article>
              {/* Quotes & payments */}
              <article data-reveal className="mk-card flex flex-col p-7 lg:col-span-2 lg:p-9">
                <div className="flex items-center gap-2 text-[rgb(var(--accent))]"><FileText className="h-5 w-5" /><span className="mk-eyebrow">Quotes & payments</span></div>
                <h3 className="mk-serif mt-4 text-[2rem] leading-tight">Quote it, win it, get paid for it.</h3>
                <p className="mk-muted mt-3">Price from your own list and rules, send a quote customers accept online, then invoice automatically — with card payment links and payment terms that make sure you’re paid before the big day.</p>
                <Mini className="mt-auto translate-y-2 pt-4">
                  {[["Quote Q-1042", "Accepted", "#6ee7b7"], ["Deposit INV-2302", "Paid by card", "#6ee7b7"], ["Final INV-2317", "Due 7 Dec", "#fcd34d"]].map(([a, b, c]) => (
                    <p key={a} className="flex items-center justify-between border-b a-line py-2 last:border-0"><span>{a}</span><span style={{ color: c }}>{b}</span></p>
                  ))}
                </Mini>
              </article>
              {/* Customer portal */}
              <article data-reveal style={{ "--d": "80ms" } as React.CSSProperties} className="mk-card overflow-hidden p-7 lg:col-span-4 lg:p-9">
                <div className="grid items-center gap-8 md:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-2 text-[rgb(var(--accent))]"><Globe className="h-5 w-5" /><span className="mk-eyebrow">Customer portal</span></div>
                    <h3 className="mk-serif mt-4 text-[2rem] leading-tight">Give clients a proper home for their booking.</h3>
                    <p className="mk-muted mt-3">In your branding, clients see their quote, accept it, pay invoices, upload documents and message you. They can add colleagues — or hand the booking over when someone new takes it on.</p>
                    <ul className="mt-5 space-y-2 text-[0.9375rem]">
                      {["Sign in with a one-time code — no passwords", "Accept quotes and pay by card", "Messages and documents in one thread"].map((x) => <li key={x} className="flex gap-2.5"><Check className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--accent))]" />{x}</li>)}
                    </ul>
                  </div>
                  <PortalMock />
                </div>
              </article>
              {/* Reporting */}
              <article data-reveal className="mk-card p-7 lg:col-span-3 lg:p-9">
                <div className="flex items-center gap-2 text-[rgb(var(--accent))]"><BarChart3 className="h-5 w-5" /><span className="mk-eyebrow">Reporting</span></div>
                <h3 className="mk-serif mt-4 text-[2rem] leading-tight">Numbers you’d otherwise need a bookkeeper for.</h3>
                <p className="mk-muted mt-3">Revenue and booked value by month, enquiries by source, pipeline conversion, quote win rate, events by type, top clients, response time, and what’s outstanding or overdue.</p>
              </article>
              {/* Team */}
              <article data-reveal style={{ "--d": "80ms" } as React.CSSProperties} className="mk-card p-7 lg:col-span-3 lg:p-9">
                <div className="flex items-center gap-2 text-[rgb(var(--accent))]"><Lock className="h-5 w-5" /><span className="mk-eyebrow">Team & roles</span></div>
                <h3 className="mk-serif mt-4 text-[2rem] leading-tight">Everyone sees what they need. Nothing more.</h3>
                <p className="mk-muted mt-3">Owners, admins, managers, sales and staff each get the right access. Staff get a simple “My jobs” view of what’s coming up and what’s included — without your prices.</p>
              </article>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Showcase */}
        <section id="product" data-band="b" className="relative overflow-hidden py-24 sm:py-32">
          <div aria-hidden className="mk-glow left-[-200px] top-[30%] h-[520px] w-[520px] bg-[radial-gradient(closest-side,rgb(var(--mk-pink)/.35),transparent)]" />
          <div className="mk-wrap relative">
            <div className="mx-auto max-w-[48rem] text-center">
              <p data-reveal className="mk-eyebrow">Take a look inside</p>
              <h2 data-reveal className="mk-h2 mt-5">The screens you’ll live in.</h2>
              <p data-reveal className="mk-muted mt-5 text-[1.125rem]">Designed to be quick to scan on a desktop and just as easy on your phone between events.</p>
            </div>
            <div data-reveal className="mt-12">
              <Showcase tabs={[
                { id: "dashboard", label: "Dashboard", title: "Your day, at a glance.", body: "New enquiries, quotes waiting on a reply, this week’s events and what’s owing — plus anything that needs you, like a booking waiting for approval.", node: <DashboardMock /> },
                { id: "enquiries", label: "Enquiries", title: "An inbox that sorts itself.", body: "Website-form and Gmail enquiries in one list, with replies linked to the right job and junk kept out of the way. Draft a reply with one click.", node: <EnquiriesMock /> },
                { id: "quotes", label: "Quotes", title: "Quotes that price themselves.", body: "Enter the service times and guest numbers; your rules add the right staff, minimums and delivery. Add menu items, send, and track every version.", node: <QuoteMock /> },
                { id: "events", label: "Events", title: "Everything about the job, on one page.", body: "Details, people, staff, quote, schedule, tasks, invoices, payments and the full conversation — so anyone can pick it up.", node: <EventMock /> },
                { id: "calendar", label: "Calendar", title: "The week ahead, without double entry.", body: "Events, deliveries and site visits in one view, kept in step with Google Calendar.", node: <CalendarMock /> },
                { id: "portal", label: "Customer portal", title: "What your client sees.", body: "Their booking, quote and invoices in your branding. They accept online and pay by card — and you’re notified straight away.", node: <div className="mx-auto max-w-lg"><PortalMock /></div> },
                { id: "reports", label: "Reports", title: "How the business is really going.", body: "Revenue, booked value, win rate, response time and outstanding invoices — updated as you work.", node: <ReportsMock /> },
              ]} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Integrations */}
        <section id="integrations" data-band="a" className="relative py-24 sm:py-32">
          <div className="mk-wrap">
            <div className="grid items-end gap-8 lg:grid-cols-2">
              <div>
                <p data-reveal className="mk-eyebrow">Integrations</p>
                <h2 data-reveal className="mk-h2 mt-5">Works with the tools you already trust.</h2>
              </div>
              <p data-reveal className="mk-muted text-[1.125rem] leading-relaxed lg:pb-2">EventureOS doesn’t replace your inbox, calendar or accounts — it connects them, so information you enter once is where it needs to be everywhere else.</p>
            </div>
            <div className="mt-14 grid gap-4 md:grid-cols-2">
              {[
                { n: "Gmail", i: Mail, c: "#EA4335", d: "Your inbox, working for you", p: ["New email checked every few minutes and sorted into enquiries, replies and junk", "Conversations linked to the right client and event", "Reply from EventureOS — it sends from your Gmail"] },
                { n: "Google Calendar", i: CalendarCheck2, c: "#4285F4", d: "One calendar, always current", p: ["Confirmed events added with times and venue", "Rostered staff and client contacts invited", "Your existing bookings brought in for history"] },
                { n: "Xero", i: FileText, c: "#13B5EA", d: "Your books stay your books", p: ["Clients matched to your Xero contacts", "Invoice, quote and payment history brought in", "Invoices sent to Xero, and card payments recorded there"] },
                { n: "Stripe", i: CreditCard, c: "#635BFF", d: "Get paid by card", p: ["A secure payment link on every invoice", "Money goes straight to your own Stripe account", "Invoices marked paid automatically"] },
              ].map(({ n, i: I, c, d, p }, k) => (
                <article key={n} data-reveal style={{ "--d": `${(k % 2) * 80}ms` } as React.CSSProperties} className="mk-card group relative overflow-hidden p-7 lg:p-9">
                  <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40" style={{ background: c }} />
                  <div className="relative flex items-center gap-4">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: c }}><I className="h-6 w-6" /></span>
                    <div><h3 className="text-[1.375rem] font-semibold tracking-tight">{n}</h3><p className="mk-muted text-[0.9375rem]">{d}</p></div>
                  </div>
                  <ul className="relative mt-6 space-y-2.5">
                    {p.map((x) => <li key={x} className="flex gap-3 text-[0.9375rem]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--accent))]" />{x}</li>)}
                  </ul>
                </article>
              ))}
            </div>
            <p data-reveal className="mk-faint mt-8 text-center text-[0.875rem]">Gmail, Google Calendar, Xero and Stripe are trademarks of their owners. Outlook / Microsoft 365, MYOB and QuickBooks aren’t supported yet.</p>
          </div>
        </section>

        {/* ------------------------------------------------ AI honesty strip */}
        <section data-band="b" className="relative py-20">
          <div className="mk-wrap grid items-center gap-10 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
            <span data-reveal className="grid h-16 w-16 place-items-center rounded-3xl bg-[rgb(var(--accent)/.12)] text-[rgb(var(--accent))]"><Sparkles className="h-7 w-7" /></span>
            <div data-reveal>
              <h2 className="mk-serif text-[clamp(1.8rem,1.2rem+1.6vw,2.6rem)] leading-tight">Smart where it helps. You’re always in charge.</h2>
              <p className="mk-muted mt-3 max-w-3xl text-[1.0625rem] leading-relaxed">AI sorts your email, picks out event details and drafts replies in your voice — you check and send. Prices come from your price list, bookings wait for your approval when you want them to, and every change is written to an activity log.</p>
            </div>
            <a data-reveal href="#demo" className="mk-btn mk-btn-ghost">See it in a demo <ArrowUpRight className="h-4 w-4" /></a>
          </div>
        </section>

        {/* ------------------------------------------------ Pricing */}
        <section id="pricing" data-band="a" className="relative py-24 sm:py-32">
          <div className="mk-wrap"><Pricing plans={PLANS} /></div>
        </section>

        {/* ------------------------------------------------ FAQ */}
        <section id="faq" data-band="b" className="relative py-24 sm:py-32">
          <div className="mk-wrap grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-20">
            <div>
              <p data-reveal className="mk-eyebrow">Questions</p>
              <h2 data-reveal className="mk-h2 mt-5">Straight answers.</h2>
              <p data-reveal className="mk-muted mt-5">Something else on your mind? <a href="#demo" className="text-[rgb(var(--accent))] underline underline-offset-4">Ask us in a demo.</a></p>
            </div>
            <div className="divide-y divide-[rgb(var(--line)/var(--line-a))] border-y border-[rgb(var(--line)/var(--line-a))]">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[1.125rem] font-medium [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[rgb(var(--line)/calc(var(--line-a)*2))] transition-transform duration-300 group-open:rotate-45">+</span>
                  </summary>
                  <p className="mk-muted max-w-3xl pb-5 leading-relaxed">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Final CTA + demo form */}
        <section id="demo" data-band="a" className="mk-grain relative overflow-hidden py-24 sm:py-32">
          <div aria-hidden className="mk-glow left-1/2 top-[10%] h-[640px] w-[1000px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(var(--mk-pink)/.4),transparent)]" />
          <div className="mk-wrap relative grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
            <div className="lg:sticky lg:top-28">
              <p data-reveal className="mk-eyebrow">Book a demo</p>
              <h2 data-reveal className="mk-h1 mt-5 !text-[clamp(2.6rem,1.4rem+3.6vw,5rem)]">Run your next season <em className="mk-grad-text [font-style:italic]">on EventureOS.</em></h2>
              <p data-reveal className="mk-muted mt-6 text-[1.125rem] leading-relaxed">We’ll walk you through it with your kind of events in mind — how enquiries come in, how you quote, and how you get paid — and answer anything you want to know.</p>
              <ul data-reveal className="mt-8 space-y-3">
                {[[MessageSquareText, "A conversation, not a sales script"], [Inbox, "See your enquiry-to-payment flow in the product"], [Users, "Bring whoever runs your bookings"]].map(([I, t]) => {
                  const Icon = I as typeof Inbox;
                  return <li key={t as string} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[rgb(var(--accent)/.12)] text-[rgb(var(--accent))]"><Icon className="h-4 w-4" /></span>{t as string}</li>;
                })}
              </ul>
            </div>
            <div data-reveal className="relative"><DemoForm /></div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------ Footer */}
      <footer data-band="b" className="border-t border-[rgb(var(--line)/var(--line-a))] py-14">
        <div className="mk-wrap grid gap-10 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <Wordmark className="h-[22px] w-auto" />
            <p className="mk-muted mt-4 max-w-sm text-[0.9375rem]">Event management software for caterers, mobile bars, coffee carts, hire companies, venues and planners.</p>
          </div>
          <nav aria-label="Product" className="text-[0.9375rem]"><p className="mb-3 font-semibold">Product</p><ul className="mk-muted space-y-2"><li><a href="#how" className="hover:text-[rgb(var(--ink))]">How it works</a></li><li><a href="#product" className="hover:text-[rgb(var(--ink))]">Tour</a></li><li><a href="#integrations" className="hover:text-[rgb(var(--ink))]">Integrations</a></li><li><a href="#pricing" className="hover:text-[rgb(var(--ink))]">Pricing</a></li></ul></nav>
          <nav aria-label="Company" className="text-[0.9375rem]"><p className="mb-3 font-semibold">Get started</p><ul className="mk-muted space-y-2"><li><a href="#demo" className="hover:text-[rgb(var(--ink))]">Book a demo</a></li><li><a href="#faq" className="hover:text-[rgb(var(--ink))]">FAQ</a></li></ul></nav>
          <nav aria-label="Account" className="text-[0.9375rem]"><p className="mb-3 font-semibold">Customers</p><ul className="mk-muted space-y-2"><li><Link href="/login" className="hover:text-[rgb(var(--ink))]">Sign in</Link></li></ul></nav>
        </div>
        <div className="mk-wrap mk-faint mt-12 flex flex-wrap items-center justify-between gap-3 text-[0.8125rem]">
          <p>© {new Date().getFullYear()} EventureOS</p>
          <p>The operating system for event businesses.</p>
        </div>
      </footer>
    </div>
  );
}
