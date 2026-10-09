"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CalendarDays, ChevronDown, ChevronRight, Coffee, Flame, Gift, GraduationCap, Mail, Menu, PartyPopper, Phone, ShoppingBag, Store, Truck, X } from "lucide-react";
import type { MenuKind } from "./gift-menu";

type Section = "events" | "lessons" | "jobs" | "shop" | "cafe" | "gifts";
export interface MobileItem { key: Section; label: string; href: string; note: string; children?: { kind: MenuKind; href: string; label: string; note: string }[] }

const SECTION_ICON = { events: PartyPopper, lessons: GraduationCap, jobs: Briefcase, shop: Coffee, cafe: Store, gifts: Gift };
const CHILD_ICON = { lessons: GraduationCap, coffee: Coffee, cafe: Store, order: ShoppingBag, table: CalendarDays, club: Flame, wholesale: Truck };

/** Phones: a "Menu" button that opens a full-screen menu with every section, its sub-pages, and call / email buttons. */
export function MobileMenu({ items, active, light, logo, name, home, phone, email }: {
  items: MobileItem[]; active?: string; light: boolean; logo: string | null; name: string; home: string; phone: string | null; email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(active && items.find((i) => i.key === active)?.children?.length ? active : null);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", esc); };
  }, [open]);

  const ink = light ? "text-[#151312]" : "text-white";
  const muted = light ? "text-[#6B635D]" : "text-white/60";
  const pk = "text-[color-mix(in_srgb,var(--b)_55%,#ff0a6c)]";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="eos-mobile-menu" data-track="Mobile menu: open"
        className={`ml-auto inline-flex h-11 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-semibold ring-1 transition active:scale-[0.97] lg:hidden ${light ? "bg-white text-[#151312] ring-[#E6DCD4] shadow-[0_6px_16px_-10px_rgba(60,30,20,.35)]" : "bg-white/10 text-white ring-white/15"}`}>
        <Menu className="h-[18px] w-[18px]" />Menu
      </button>

      <div id="eos-mobile-menu" role="dialog" aria-modal="true" aria-label={`${name} menu`} aria-hidden={!open}
        className={`fixed inset-0 z-[80] lg:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
        <div className={`absolute inset-0 transition-opacity duration-300 ${light ? "bg-[#FCFAF7]" : "bg-[#141011]"} ${open ? "opacity-100" : "opacity-0"}`} />
        <div className={`relative flex h-full flex-col transition duration-300 ease-out ${open ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`}>
          {/* Header */}
          <div className={`flex h-[64px] shrink-0 items-center justify-between border-b px-4 ${light ? "border-[#EEE6DF]" : "border-white/10"}`}>
            <Link href={home} onClick={() => setOpen(false)} className="flex items-center" aria-label={`${name} home`}>
              {logo ? <img src={logo} alt={name} className="h-9 max-w-[170px] object-contain" /> : <span className={`text-[1.0625rem] font-semibold ${ink}`}>{name}</span>}
            </Link>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu"
              className={`grid h-11 w-11 place-items-center rounded-full ring-1 transition active:scale-95 ${light ? "bg-white text-[#151312] ring-[#E6DCD4]" : "bg-white/10 text-white ring-white/15"}`}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Sections */}
          <nav className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4" aria-label={name}>
            <ul className="space-y-2.5">
              {items.map((it, n) => {
                const I = SECTION_ICON[it.key];
                const on = active === it.key;
                const kids = it.children && it.children.length > 1 ? it.children : null;
                const isOpen = expanded === it.key;
                const card = `flex w-full items-center gap-3.5 rounded-[20px] p-3.5 text-left transition active:scale-[0.99] ${on
                  ? light ? "bg-white ring-2 ring-[color-mix(in_srgb,var(--b)_70%,#ff0a6c)] shadow-[0_14px_30px_-22px_rgba(60,30,20,.5)]" : "bg-white/[0.08] ring-2 ring-[var(--b)]"
                  : light ? "bg-white ring-1 ring-[#EDE3DB]" : "bg-white/[0.05] ring-1 ring-white/10"}`;
                const inner = (
                  <>
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${light ? "bg-[color-mix(in_srgb,var(--b)_14%,white)]" : "bg-white/10"} ${pk}`}><I className="h-[22px] w-[22px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[1.125rem] font-semibold leading-tight ${ink}`}>{it.label}</span>
                      <span className={`mt-0.5 block truncate text-[0.875rem] ${muted}`}>{it.note}</span>
                    </span>
                    {kids ? <ChevronDown className={`h-5 w-5 shrink-0 transition ${muted} ${isOpen ? "rotate-180" : ""}`} /> : <ChevronRight className={`h-5 w-5 shrink-0 ${muted}`} />}
                  </>
                );
                return (
                  <li key={it.key} style={{ transitionDelay: open ? `${60 + n * 35}ms` : "0ms" }} className={`transition duration-300 ${open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
                    {kids ? (
                      <button type="button" className={card} aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : it.key)} data-track={`Mobile menu: ${it.label}`}>{inner}</button>
                    ) : (
                      <Link href={it.href} className={card} aria-current={on ? "page" : undefined} onClick={() => setOpen(false)} data-track={`Mobile menu: ${it.label}`}>{inner}</Link>
                    )}
                    {kids && (
                      <div className={`grid transition-all duration-300 ${isOpen ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                        <div className="overflow-hidden">
                          <div className="grid grid-cols-2 gap-2 p-0.5 pb-1">
                            {kids.map((k) => {
                              const K = CHILD_ICON[k.kind];
                              return (
                                <Link key={k.href} href={k.href} onClick={() => setOpen(false)} data-track={`Mobile menu: ${it.label} · ${k.label}`}
                                  className={`flex min-h-[92px] flex-col justify-between rounded-2xl p-3 transition active:scale-[0.98] ${light ? "bg-[color-mix(in_srgb,var(--b)_7%,white)] ring-1 ring-[color-mix(in_srgb,var(--b)_18%,#EDE3DB)]" : "bg-white/[0.06] ring-1 ring-white/10"}`}>
                                  <K className={`h-5 w-5 ${pk}`} />
                                  <span>
                                    <span className={`block text-[0.9688rem] font-semibold leading-tight ${ink}`}>{k.label}</span>
                                    <span className={`mt-0.5 block text-[0.75rem] leading-snug ${muted}`}>{k.note}</span>
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Contact */}
          {(phone || email) && (
            <div className={`shrink-0 border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 ${light ? "border-[#EEE6DF] bg-[#FCFAF7]" : "border-white/10 bg-[#141011]"}`}>
              <div className="grid grid-cols-2 gap-2">
                {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--b)_45%,#ff0a6c)] text-[0.9375rem] font-semibold text-white" data-track="Mobile menu: call"><Phone className="h-4 w-4" />Call us</a>}
                {email && <a href={`mailto:${email}`} className={`inline-flex h-12 items-center justify-center gap-2 rounded-full text-[0.9375rem] font-semibold ring-1 ${light ? "bg-white text-[#151312] ring-[#E6DCD4]" : "bg-white/10 text-white ring-white/15"} ${phone ? "" : "col-span-2"}`} data-track="Mobile menu: email"><Mail className="h-4 w-4" />Email us</a>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
