import Link from "next/link";
import {
  AppWindow, BadgeCheck, BarChart3, Bot, Check, Clock, Code2, Database, Globe, Gauge, Layers, LifeBuoy, Lock, Mail, MapPin, Megaphone,
  MousePointerClick, PenLine, Phone, Plug, RefreshCw, Search, Server, ShieldCheck, ShoppingCart, Sparkles, Ticket, TrendingUp, Users, Wallet, Wrench, Blocks,
  type LucideIcon,
} from "lucide-react";
import type { Faq, IconKey } from "@/lib/site/agency/content";
import { cn } from "@/lib/cn";

export const ICONS: Record<IconKey, LucideIcon> = {
  design: AppWindow, wordpress: Blocks, leadpages: MousePointerClick, hosting: Server, maintenance: Wrench, support: LifeBuoy, ads: Megaphone, seo: TrendingUp,
  mail: Mail, ai: Bot, shield: ShieldCheck, gauge: Gauge, map: MapPin, phone: Phone, refresh: RefreshCw, lock: Lock, chart: BarChart3, code: Code2,
  layers: Layers, sparkles: Sparkles, clock: Clock, check: Check, users: Users, plug: Plug, database: Database, cart: ShoppingCart, edit: PenLine,
  server: Server, globe: Globe, ticket: Ticket, wallet: Wallet, search: Search,
};
export function Icon({ k, className }: { k: IconKey; className?: string }) {
  const I = ICONS[k] ?? BadgeCheck;
  return <I aria-hidden strokeWidth={1.6} className={cn("h-5 w-5", className)} />;
}

/** Page width: 1,520px of content on wide screens (sections themselves run the full width), comfortable padding on phones. */
export const WRAP = "mx-auto w-full max-w-[1520px] px-5 sm:px-8 lg:px-12 2xl:px-16";

const btn = "ag-btn inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-bold tracking-[-0.005em] transition-colors";
export const BTN = {
  primary: `${btn} bg-[var(--ink)] text-[var(--card)] hover:bg-[var(--forest)]`,
  lime: `${btn} bg-[var(--lime)] text-[var(--ink)] hover:bg-[#D3E85A]`,
  ghostDark: `${btn} border border-[rgba(252,250,245,.35)] text-[var(--card)] hover:border-[var(--card)] hover:bg-[rgba(252,250,245,.06)]`,
  ghostLight: `${btn} border-[1.5px] border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--card)]`,
};

/** Editorial section heading: Fraunces, confident and substantial. */
export function H2({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <h2 id={id} className={cn("ag-serif text-[2.25rem] font-semibold leading-[1.02] tracking-[-0.025em] sm:text-[3rem] lg:text-[3.5rem]", className)}>{children}</h2>;
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** FAQs as native disclosure widgets (keyboard-friendly, no JavaScript). */
export function FaqList({ faqs, dark = false }: { faqs: Faq[]; dark?: boolean }) {
  return (
    <div className={cn("divide-y border-y", dark ? "divide-white/10 border-white/10" : "divide-[var(--line)] border-[var(--line)]")}>
      {faqs.map((f) => (
        <details key={f.q} className="ag-faq group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 text-[1.0625rem] font-bold leading-snug sm:text-[1.1875rem]">
            <span>{f.q}</span>
            <span aria-hidden className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-transform duration-300 group-open:rotate-45 group-open:border-transparent group-open:bg-[var(--lime)] group-open:text-[var(--ink)]", dark ? "border-white/25" : "border-[rgba(20,45,35,.3)]")}>
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 1v10M1 6h10" /></svg>
            </span>
          </summary>
          <p className={cn("ag-faq-body max-w-[68ch] pb-7 pr-10 text-[1.0625rem] leading-relaxed", dark ? "text-white/70" : "text-[var(--muted)]")}>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function faqLd(faqs: Faq[]) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}

/** Internal link that works on EventureOS and on the agency's own domain. */
export function A({ href, className, children, ...rest }: { href: string; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <Link href={href} className={className} {...rest}>{children}</Link>;
}
