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

/** Page width: generous on wide screens, comfortable padding on phones. */
export const WRAP = "mx-auto w-full max-w-[1320px] px-5 sm:px-8 lg:px-12";

const btn = "ag-btn inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold transition";
export const BTN = {
  primary: `${btn} bg-[var(--ac)] text-[var(--on-ac)] shadow-[0_10px_30px_-12px_var(--ac)] hover:brightness-110`,
  lime: `${btn} bg-[var(--lime)] text-[var(--ink)] hover:bg-white`,
  ghostDark: `${btn} border border-white/25 text-white hover:border-white/60 hover:bg-white/5`,
  ghostLight: `${btn} border border-[rgba(15,11,30,.2)] text-[var(--ink)] hover:border-[rgba(15,11,30,.6)] hover:bg-white`,
};

export function H2({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <h2 id={id} className={cn("text-[2rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[2.75rem] lg:text-[3.25rem]", className)}>{children}</h2>;
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
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-[1.0625rem] font-semibold leading-snug sm:text-[1.125rem]">
            <span>{f.q}</span>
            <span aria-hidden className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border transition group-open:rotate-45", dark ? "border-white/25" : "border-[rgba(15,11,30,.2)]")}>
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 1v10M1 6h10" /></svg>
            </span>
          </summary>
          <p className={cn("max-w-[68ch] pb-6 pr-10 text-[1rem] leading-relaxed", dark ? "text-white/70" : "text-[var(--muted)]")}>{f.a}</p>
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
