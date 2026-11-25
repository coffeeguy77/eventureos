"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Menu, Phone, X } from "lucide-react";
import type { IconKey } from "@/lib/site/agency/content";
import { Icon, WRAP, BTN } from "./ui";
import { AgencyWordmark, HandArrow } from "./deco";

export interface NavCategory { name: string; intro: string; icon: IconKey; href: string; links: { href: string; label: string }[] }

/**
 * Sticky linen bar: logo, Our Work, What We Do (mega menu: six categories), LeadPages, Software, About Us, Support,
 * Client login and Let's Talk. Mega menu: Escape closes and returns focus, outside click closes, arrow keys aren't
 * hijacked (it's a plain list of links). Phones get an accordion menu instead.
 */
export function AgencyNav({ name, home, categories, links, login, talk, phone }: {
  name: string; home: string; categories: NavCategory[]; links: { href: string; label: string }[];
  login: string; talk: string; phone: string | null;
}) {
  const path = usePathname();
  const [mega, setMega] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const megaId = useId(), drawerId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const megaBtn = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => { setMega(false); setDrawer(false); }, [path]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!mega && !drawer) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { if (mega) megaBtn.current?.focus(); setMega(false); setDrawer(false); } };
    const click = (e: MouseEvent) => { if (mega && wrap.current && !wrap.current.contains(e.target as Node)) setMega(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    if (drawer) document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); document.documentElement.style.overflow = ""; };
  }, [mega, drawer]);
  useEffect(() => { if (mega) firstLink.current?.focus({ preventScroll: true }); }, [mega]);

  const inServices = categories.some((c) => c.links.some((l) => l.href === path));
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <div ref={wrap} className={`wcn sticky top-0 z-50 border-b transition-[border-color,box-shadow] ${scrolled || mega ? "border-[var(--line)] shadow-[0_8px_24px_-20px_rgba(20,45,35,.5)]" : "border-transparent"}`}>
      <div className="wcn-bar">
        <Link href={home} aria-label={`${name} home`} className="wcn-logo"><AgencyWordmark name={name} /></Link>

        <nav aria-label="Main" className="wcn-links">
          <Link href={`${home}#work`}>Our Work</Link>
          <button ref={megaBtn} type="button" aria-expanded={mega} aria-controls={megaId} onClick={() => setMega((v) => !v)} className={mega || inServices ? "on" : undefined}>
            What We Do<ChevronDown aria-hidden className={`wcn-chev transition-transform duration-300 ${mega ? "rotate-180" : ""}`} strokeWidth={2.2} />
          </button>
          {links.map((l) => <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>)}
          <Link href={talk} className="wcn-talk">Let&apos;s Talk<ArrowUpRight aria-hidden className="ag-arrow" strokeWidth={2.4} /></Link>
        </nav>

        <button type="button" className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(20,45,35,.25)] text-[var(--ink)] lg:hidden" aria-expanded={drawer} aria-controls={drawerId} onClick={() => setDrawer(true)}>
          <Menu aria-hidden className="h-5 w-5" strokeWidth={2} /><span className="sr-only">Open menu</span>
        </button>
      </div>

      {/* Desktop mega menu */}
      <div id={megaId} hidden={!mega} className="absolute inset-x-0 top-full border-y border-[var(--line)] bg-[var(--card)] shadow-[0_40px_60px_-40px_rgba(20,45,35,.35)]">
        <div className={`${WRAP} grid grid-cols-[minmax(0,3fr)_minmax(260px,1fr)] gap-10 py-10`}>
          <ul className="grid grid-cols-3 gap-x-8 gap-y-9">
            {categories.map((c, i) => (
              <li key={c.name}>
                <Link ref={i === 0 ? firstLink : undefined} href={c.href} className="group flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-[var(--lime)]"><Icon k={c.icon} className="h-5 w-5" /></span>
                  <span>
                    <span className="flex items-center gap-1 text-[1rem] font-bold text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--lime)] group-hover:decoration-2 group-hover:underline-offset-4">{c.name}</span>
                    <span className="mt-0.5 block text-[0.875rem] leading-snug text-[var(--muted)]">{c.intro}</span>
                  </span>
                </Link>
                <ul className="mt-3 space-y-0.5 pl-[52px]">
                  {c.links.map((l) => (
                    <li key={l.href + l.label}>
                      <Link href={l.href} aria-current={path === l.href ? "page" : undefined} className="-mx-2 block rounded-lg px-2 py-1.5 text-[0.9375rem] text-[rgba(21,25,20,.85)] transition-colors hover:bg-[var(--sage-pale)] hover:text-[var(--ink)]">{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="ag-dark relative overflow-hidden rounded-[24px] bg-[var(--ink)] p-7 text-[var(--card)]">
            <HandArrow className="absolute right-5 top-5 h-10 w-14 text-[var(--lime)]" />
            <p className="ag-serif max-w-[12ch] text-[1.75rem] font-semibold leading-[1.05]">Not sure where to start?</p>
            <p className="mt-3 text-[0.9375rem] text-[rgba(252,250,245,.75)]">That&apos;s what we&apos;re here for.</p>
            <Link href={talk} className={`${BTN.lime} mt-6 min-h-[44px] px-5`}>Let&apos;s talk<ArrowUpRight aria-hidden className="ag-arrow h-4 w-4" strokeWidth={2.2} /></Link>
            {tel && <a href={tel} className="mt-5 flex items-center gap-2 text-[0.875rem] text-[rgba(252,250,245,.75)] hover:text-[var(--card)]"><Phone aria-hidden className="h-4 w-4 text-[var(--lime)]" strokeWidth={1.8} />{phone}</a>}
          </div>
        </div>
      </div>

      {/* Phone menu: accordion */}
      {drawer && (
        <div id={drawerId} role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-[60] flex flex-col bg-[var(--paper)] text-[var(--ink)] lg:hidden">
          <div className={`${WRAP} flex h-[76px] shrink-0 items-center justify-between border-b border-[var(--line)]`}>
            <Link href={home} aria-label={`${name} home`}><AgencyWordmark name={name} /></Link>
            <button type="button" autoFocus onClick={() => setDrawer(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(20,45,35,.25)]">
              <X aria-hidden className="h-5 w-5" strokeWidth={2} /><span className="sr-only">Close menu</span>
            </button>
          </div>
          <nav aria-label="Main" className={`${WRAP} flex-1 overflow-y-auto py-4`}>
            <Link href={`${home}#work`} onClick={() => setDrawer(false)} className="block border-b border-[var(--line)] py-4 text-[1.125rem] font-bold">Our Work</Link>
            <p className="pb-1 pt-5 text-[0.875rem] font-semibold text-[var(--muted)]">What We Do</p>
            <ul>
              {categories.map((c, i) => (
                <li key={c.name} className="border-b border-[var(--line)]">
                  <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 py-4 text-left text-[1.0625rem] font-bold">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--ink)] text-[var(--lime)]"><Icon k={c.icon} className="h-[18px] w-[18px]" /></span>
                    <span className="flex-1">{c.name}</span>
                    <ChevronDown aria-hidden className={`h-5 w-5 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} strokeWidth={2} />
                  </button>
                  {open === i && (
                    <ul className="pb-4 pl-12">
                      {c.links.map((l) => <li key={l.href + l.label}><Link href={l.href} onClick={() => setDrawer(false)} className="block py-2.5 text-[1rem] text-[var(--text)]">{l.label}</Link></li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <ul className="mt-2">
              {[...links, { href: login, label: "Client login" }].map((l) => (
                <li key={l.href}><Link href={l.href} onClick={() => setDrawer(false)} className="block border-b border-[var(--line)] py-4 text-[1.125rem] font-bold">{l.label}</Link></li>
              ))}
            </ul>
          </nav>
          <div className={`${WRAP} grid shrink-0 grid-cols-2 gap-3 border-t border-[var(--line)] py-4 pb-[max(1rem,env(safe-area-inset-bottom))]`}>
            {tel ? <a href={tel} className={BTN.ghostLight}><Phone aria-hidden className="h-4 w-4" strokeWidth={2} />Call us</a> : <span />}
            <Link href={talk} className={BTN.primary}>Let&apos;s Talk<ArrowUpRight aria-hidden className="h-4 w-4" strokeWidth={2.2} /></Link>
          </div>
        </div>
      )}
    </div>
  );
}
