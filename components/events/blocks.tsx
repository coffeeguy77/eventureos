import Link from "next/link";
import { ArrowRight, CalendarCheck, ClipboardList, MailCheck, ReceiptText } from "lucide-react";
import { HIRE_KINDS, offered, type EventsSettings, type HireKind } from "@/lib/events/core";
import { KIND_ART } from "./art";
import { serif, WRAP } from "./frame";

export function fleetLine(kind: HireKind, s: EventsSettings) {
  const n = s.fleet[kind];
  const word = kind === "diy" ? "kit" : kind === "van" ? "van" : "cart";
  if (n === 1) return `Only 1 ${word} — book early`;
  return `${n} ${word}s · book up to ${n}`;
}

/** Photo when the business has one, otherwise a soft illustrated panel. */
export function KindVisual({ kind, s, className = "" }: { kind: HireKind; s: EventsSettings; className?: string }) {
  const img = s.images[kind];
  const Art = KIND_ART[kind];
  return img
    ? <img src={img} alt={s.labels[kind]} className={`h-full w-full object-cover ${className}`} />
    : (
      <div className={`grid h-full w-full place-items-center bg-[radial-gradient(120%_90%_at_30%_20%,#FFF1F3_0%,#FBE4E7_55%,#F6D9DD_100%)] ${className}`}>
        <Art className="w-[62%] max-w-[220px] text-[var(--pk)]" />
      </div>
    );
}

/** The three ways to hire: icon + name + blurb + how many there are. */
export function KindCards({ slug, s }: { slug: string; s: EventsSettings }) {
  const kinds = HIRE_KINDS.filter((k) => offered(s).includes(k));
  return (
    <div className={`grid gap-6 ${kinds.length === 3 ? "md:grid-cols-3" : kinds.length === 2 ? "md:grid-cols-2" : ""}`}>
      {kinds.map((k) => (
        <Link key={k} href={`/hire/${slug}/quote?kind=${k}`} data-track={`Choose ${s.labels[k]}`}
          className="shop-card group flex flex-col overflow-hidden rounded-[26px] bg-white ring-1 ring-[#EDE3DB]">
          <div className="relative h-[230px] overflow-hidden">
            <div className="shop-zoom h-full w-full"><KindVisual kind={k} s={s} /></div>
            <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-[0.75rem] font-bold uppercase tracking-[0.08em] ${s.fleet[k] === 1 ? "bg-[#151312] text-white" : "bg-white/90 text-[#151312]"}`}>{fleetLine(k, s)}</span>
          </div>
          <div className="flex flex-1 flex-col p-6 sm:p-7">
            <p className={`${serif} text-[1.75rem] font-semibold`}>{s.labels[k]}</p>
            <p className="mt-2 flex-1 text-[0.9688rem] leading-relaxed text-[#5E5853]">{s.blurbs[k]}</p>
            <span className="mt-6 inline-flex items-center gap-2 font-semibold text-[var(--pk)]">Build my quote<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function HowItWorks({ s }: { s: EventsSettings }) {
  const steps = [
    { icon: ClipboardList, t: "Build your event", b: "Choose a cart, the van or equipment only. Add each day, the hours and how many baristas." },
    { icon: CalendarCheck, t: "We check the calendar", b: "You'll see straight away if your date is free." },
    { icon: MailCheck, t: "Your quote arrives by email", b: "Every price itemised — no surprises, and nothing to pay yet." },
    { icon: ReceiptText, t: "Accept & lock it in", b: s.leadDays ? `Accept online and we'll send the invoice. Bookings ${s.leadDays}+ days away are locked in; sooner than that is tentative until our baristas are confirmed.` : "Accept online and we'll send the invoice." },
  ];
  return (
    <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((x, i) => (
        <li key={x.t} className="rounded-[22px] bg-white p-6 ring-1 ring-[#EDE3DB]">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><x.icon className="h-5 w-5" /></span>
            <span className="text-[0.8125rem] font-bold text-[#8C847D]">STEP {i + 1}</span>
          </div>
          <p className="mt-4 text-[1.125rem] font-semibold">{x.t}</p>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[#5E5853]">{x.b}</p>
        </li>
      ))}
    </ol>
  );
}

/** A full-width band with a big call to action. */
export function QuoteBand({ slug, title, body, kind }: { slug: string; title: string; body: string; kind?: HireKind }) {
  return (
    <section className="py-16 sm:py-20" data-section="quote-band">
      <div className={WRAP}>
        <div className="relative overflow-hidden rounded-[30px] bg-[#151312] px-7 py-12 text-white sm:px-14 sm:py-16">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[340px] w-[340px] rounded-full bg-[var(--pk)] opacity-25 blur-3xl" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-[640px]">
              <p className={`${serif} text-[2.25rem] font-semibold leading-tight sm:text-[2.75rem]`}>{title}</p>
              <p className="mt-3 text-[1.0625rem] text-white/75">{body}</p>
            </div>
            <Link href={`/hire/${slug}/quote${kind ? `?kind=${kind}` : ""}`} data-track={`Quote band: ${title}`} className="shop-btn inline-flex h-[60px] shrink-0 items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] px-9 text-[1.0625rem] font-semibold text-white">Build my quote<ArrowRight className="h-5 w-5" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
