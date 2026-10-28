"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LifeBuoy, Menu, Phone, X } from "lucide-react";
import type { IconKey } from "@/lib/site/agency/content";
import { Icon, WRAP, BTN } from "./ui";
import { Wordmark } from "./brand";

export interface NavGroup { label: string; text: string; items: { href: string; label: string; note: string; icon: IconKey }[] }

export function AgencyNav({ name, logo, home, groups, links, login, quote, support, phone }: {
  name: string; logo: string | null; home: string; groups: NavGroup[]; links: { href: string; label: string }[];
  login: string; quote: string; support: string; phone: string | null;
}) {
  const path = usePathname();
  const [mega, setMega] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const megaId = useId(), drawerId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const megaBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMega(false); setDrawer(false); }, [path]);
  useEffect(() => {
    if (!mega && !drawer) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { if (mega) megaBtn.current?.focus(); setMega(false); setDrawer(false); } };
    const click = (e: MouseEvent) => { if (mega && wrap.current && !wrap.current.contains(e.target as Node)) setMega(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    if (drawer) document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); document.documentElement.style.overflow = ""; };
  }, [mega, drawer]);

  const isServices = groups.some((g) => g.items.some((i) => i.href === path));
  const linkCls = (href: string) => `rounded-full px-3.5 py-2 text-[0.9375rem] font-medium transition hover:bg-white/10 ${path === href ? "text-white" : "text-white/75 hover:text-white"}`;
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <div ref={wrap} className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(15,11,30,.97)] text-white backdrop-blur supports-[backdrop-filter]:bg-[rgba(15,11,30,.86)]">
      <div className={`${WRAP} flex h-[68px] items-center gap-6`}>
        <Link href={home} aria-label={`${name} home`} className="shrink-0 rounded-lg">
          <Wordmark name={name} logo={logo} />
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
          <button ref={megaBtn} type="button" aria-expanded={mega} aria-controls={megaId} onClick={() => setMega((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[0.9375rem] font-medium transition hover:bg-white/10 ${mega || isServices ? "text-white" : "text-white/75 hover:text-white"}`}>
            Services<ChevronDown aria-hidden className={`h-4 w-4 transition ${mega ? "rotate-180" : ""}`} strokeWidth={1.8} />
          </button>
          {links.map((l) => <Link key={l.href} href={l.href} className={linkCls(l.href)} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>)}
          <Link href={login} className={linkCls(login)}>Client login</Link>
          <Link href={quote} className={`${BTN.primary} ml-2 min-h-[42px] px-5`}>Get a quote</Link>
        </nav>

        <button type="button" className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 lg:hidden" aria-expanded={drawer} aria-controls={drawerId} onClick={() => setDrawer(true)}>
          <Menu aria-hidden className="h-5 w-5" strokeWidth={1.8} /><span className="sr-only">Open menu</span>
        </button>
      </div>

      {/* Desktop mega menu */}
      <div id={megaId} hidden={!mega} className="absolute inset-x-0 top-full border-b border-white/10 bg-[var(--ink)] shadow-[0_40px_80px_-30px_rgba(0,0,0,.6)]">
        <div className={`${WRAP} grid grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,0.9fr)] gap-8 py-9`}>
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[0.8125rem] font-medium text-white/50">{g.text}</p>
              <ul className="mt-3 space-y-1">
                {g.items.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className="group flex gap-3 rounded-xl p-2.5 -mx-2.5 transition hover:bg-white/[.06]" aria-current={path === i.href ? "page" : undefined}>
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 text-[var(--lime)] group-hover:border-[rgba(200,245,96,.6)]"><Icon k={i.icon} className="h-[18px] w-[18px]" /></span>
                      <span><span className="block text-[0.9375rem] font-semibold">{i.label}</span><span className="block text-[0.8125rem] leading-snug text-white/60">{i.note}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
            <LifeBuoy aria-hidden className="h-6 w-6 text-[var(--lime)]" strokeWidth={1.6} />
            <p className="mt-3 text-[1rem] font-semibold">Need help now?</p>
            <p className="mt-1 text-[0.875rem] leading-snug text-white/65">Lodge a ticket and follow it in your client portal.</p>
            <Link href={support} className="mt-4 inline-flex text-[0.875rem] font-semibold text-[var(--lime)] underline-offset-4 hover:underline">Lodge a support ticket</Link>
            {tel && <a href={tel} className="mt-2 flex items-center gap-2 text-[0.875rem] text-white/75 hover:text-white"><Phone aria-hidden className="h-4 w-4" strokeWidth={1.6} />{phone}</a>}
          </div>
        </div>
      </div>

      {/* Phone drawer */}
      {drawer && (
        <div id={drawerId} role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-[60] flex flex-col bg-[var(--ink)] text-white lg:hidden">
          <div className={`${WRAP} flex h-[68px] shrink-0 items-center justify-between border-b border-white/10`}>
            <Link href={home} aria-label={`${name} home`}><Wordmark name={name} logo={logo} /></Link>
            <button type="button" autoFocus onClick={() => setDrawer(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20">
              <X aria-hidden className="h-5 w-5" strokeWidth={1.8} /><span className="sr-only">Close menu</span>
            </button>
          </div>
          <nav aria-label="Main" className={`${WRAP} flex-1 overflow-y-auto py-6`}>
            {groups.map((g) => (
              <div key={g.label} className="mb-6">
                <p className="text-[0.8125rem] font-medium text-white/50">{g.text}</p>
                <ul className="mt-2">
                  {g.items.map((i) => (
                    <li key={i.href}>
                      <Link href={i.href} className="flex items-center gap-3 border-b border-white/[.07] py-3.5 text-[1.0625rem] font-medium">
                        <Icon k={i.icon} className="h-5 w-5 text-[var(--lime)]" />{i.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <ul className="mb-6">
              {[...links, { href: login, label: "Client login" }].map((l) => (
                <li key={l.href}><Link href={l.href} className="block border-b border-white/[.07] py-3.5 text-[1.0625rem] font-medium">{l.label}</Link></li>
              ))}
            </ul>
          </nav>
          <div className={`${WRAP} grid shrink-0 grid-cols-2 gap-3 border-t border-white/10 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]`}>
            <Link href={support} className={BTN.ghostDark}>Support ticket</Link>
            <Link href={quote} className={BTN.primary}>Get a quote</Link>
          </div>
        </div>
      )}
    </div>
  );
}
