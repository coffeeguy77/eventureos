"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { MenuTone } from "@/lib/site/page-menu";

export interface SectionLink { key: string; href: string; label: string; badge?: number }

/**
 * The section menu under the site menu — the same size, font and spacing in every section (Shop, Café, Events,
 * Barista lessons, Academy, Job board), so flicking between pages feels like one website. Each section only supplies
 * its links, its right-hand buttons and its colour (light/dark, set per page).
 *  bar   — a full-width bar that sticks to the top as you scroll
 *  float — a rounded card floating over the page's photo (pages with a photo header)
 */
export function SectionBar({ title, titleHref, links, active, actions, cta, tone, style, label, floatable = false }: {
  title: string; titleHref: string; links: SectionLink[]; active?: string; actions?: React.ReactNode;
  cta?: { href: string; label: string; track?: string }; tone: MenuTone; style: "bar" | "float"; label: string; floatable?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (style !== "float") return;
    const on = () => setScrolled(window.scrollY > 24);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [style]);
  const dark = tone === "dark" && style === "bar";
  const ink = dark ? "text-white" : "text-[#151312]";
  const link = (on: boolean) => `relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] font-medium leading-none transition ${on
    ? dark ? "bg-white text-[#151312]" : "bg-[#151312] text-white"
    : dark ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-[#3A3431] hover:bg-[#F2EAE4] hover:text-[#151312]"}`;
  const A = ({ l }: { l: SectionLink }) => {
    const cls = link(active === l.key);
    const inner = <>{l.label}{!!l.badge && <span className="rounded-full bg-[var(--b)] px-1.5 text-[11px] font-bold leading-5 text-[var(--on-b)]">{l.badge}</span>}</>;
    return l.href.startsWith("#") ? <a href={l.href} className={cls}>{inner}</a>
      : <Link href={l.href} className={cls} aria-current={active === l.key ? "page" : undefined}>{inner}</Link>;
  };
  const ctaBtn = cta && (
    <Link href={cta.href} data-track={cta.track ?? `${cta.label} (section menu)`}
      className="shop-btn inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--b)_40%,#ff0a6c)] px-5 text-[15px] font-semibold leading-none text-white shadow-[0_10px_22px_-12px_color-mix(in_srgb,var(--b)_40%,#ff0a6c)] hover:brightness-105">
      {cta.label}<ArrowRight className="h-4 w-4" />
    </Link>
  );

  const content = (
    <>
      <div className="flex h-14 items-center gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link href={titleHref} className={`min-w-0 truncate text-[16px] font-semibold leading-none ${ink}`}>{title}</Link>
        <nav aria-label={label} className="no-scrollbar hidden items-center gap-1 overflow-x-auto md:flex">
          {links.map((l) => <A key={l.key} l={l} />)}
        </nav>
        <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">{actions}{ctaBtn}</div>
      </div>
      {links.length > 0 && (
        <nav aria-label={`${label} (phone)`} className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto pb-2 md:hidden">
          {links.map((l) => <A key={l.key} l={l} />)}
        </nav>
      )}
    </>
  );

  if (style === "float") return (
    <div className="sticky top-0 z-40 h-0 font-sans" data-section-nav data-section-style="float" data-section-tone={tone} data-floatable="1">
      <div className="mx-auto w-full max-w-[1440px] px-3 pt-3 sm:px-6 lg:px-10">
        <div className={`rounded-2xl bg-[#FFFDFC]/95 px-4 text-[#151312] backdrop-blur transition-shadow duration-300 sm:px-5 ${scrolled ? "shadow-[0_8px_30px_-12px_rgba(23,23,20,0.35)]" : "shadow-[0_2px_10px_-6px_rgba(23,23,20,0.25)]"}`}>{content}</div>
      </div>
    </div>
  );
  return (
    <div className={`sticky top-0 z-40 border-b font-sans backdrop-blur-md ${dark ? "border-white/10 bg-[#141011]/92 text-white" : "border-[#EEE6DF] bg-[#FCFAF7]/92 text-[#151312]"}`} data-section-nav data-section-style="bar" data-section-tone={tone} data-floatable={floatable ? "1" : undefined}>
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">{content}</div>
    </div>
  );
}
