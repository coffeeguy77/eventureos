"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Phone, Star } from "lucide-react";
import type { LandingReview } from "@/lib/bookings/core";

const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

/** Floating navigation: gains a shadow once the page scrolls. */
export function LandingNav({ logo, name, phone, links }: { logo: string | null; name: string; phone: string | null; links: { href: string; label: string }[] }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className="sticky top-0 z-40 h-0">
      <div className="mx-auto w-full max-w-[1440px] px-3 pt-3 sm:px-6 lg:px-10">
        <nav aria-label="Page" className={`flex h-16 items-center gap-3 rounded-2xl bg-[#FFFDFC]/95 px-3 backdrop-blur transition-shadow duration-300 sm:px-5 ${scrolled ? "shadow-[0_8px_30px_-12px_rgba(23,23,20,0.35)]" : "shadow-[0_2px_10px_-6px_rgba(23,23,20,0.25)]"}`}>
          <a href="#top" className="flex min-w-0 shrink-0 items-center gap-2.5">
            {logo ? <img src={logo} alt={name} className="h-9 max-w-[150px] object-contain sm:h-10" /> : <span className="lp-serif truncate text-[1.125rem] font-semibold text-[#171714]">{name}</span>}
          </a>
          <ul className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {links.map((l) => <li key={l.href}><a href={l.href} className="rounded-lg px-3 py-2 text-[0.9375rem] font-medium text-[#3d3a36] transition-colors hover:bg-[#F3ECE5] hover:text-[#171714]">{l.label}</a></li>)}
          </ul>
          <span className="flex-1 lg:hidden" />
          {phone && (
            <a href={telHref(phone)} className="hidden items-center gap-2 rounded-lg px-2 py-2 text-[0.9375rem] font-semibold text-[#171714] hover:bg-[#F3ECE5] md:inline-flex">
              <Phone className="h-4 w-4 text-[var(--b)]" />{phone}
            </a>
          )}
          {phone && <a href={telHref(phone)} aria-label={`Call ${phone}`} className="grid h-11 w-11 place-items-center rounded-xl text-[#171714] ring-1 ring-[#E4D9CE] md:hidden"><Phone className="h-[18px] w-[18px]" /></a>}
          <a href="#book" className="lp-btn inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--b)] px-4 text-[0.9375rem] font-semibold text-[var(--on-b)] sm:px-5">
            Book now<ArrowRight className="lp-arrow h-4 w-4" />
          </a>
        </nav>
      </div>
    </div>
  );
}

/** Mobile: a booking bar fixed to the bottom, hidden while the booking form is on screen. */
export function StickyBook({ phone }: { phone: string | null }) {
  const [hide, setHide] = useState(false);
  const [past, setPast] = useState(false);
  useEffect(() => {
    const on = () => setPast(window.scrollY > 520);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    const el = document.getElementById("book");
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setHide(e.isIntersecting), { rootMargin: "0px 0px -30% 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-[#E9DFD5] bg-[#FFFDFC]/95 p-3 backdrop-blur transition-transform duration-300 md:hidden ${hide || !past ? "translate-y-full" : ""}`} style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="flex gap-2">
        <a href="#book" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--b)] text-[1rem] font-semibold text-[var(--on-b)]">See dates &amp; book<ArrowRight className="h-4 w-4" /></a>
        {phone && <a href={telHref(phone)} aria-label={`Call ${phone}`} className="grid h-12 w-12 place-items-center rounded-xl ring-1 ring-[#E4D9CE]"><Phone className="h-5 w-5 text-[#171714]" /></a>}
      </div>
    </div>
  );
}

/** Reveals [data-reveal] elements as they scroll into view. Without JavaScript everything is simply shown. */
export function RevealOnScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("lp-js");
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.setAttribute("data-shown", ""); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => { if (el.getBoundingClientRect().top < window.innerHeight) el.setAttribute("data-shown", ""); else io.observe(el); });
    return () => { io.disconnect(); document.documentElement.classList.remove("lp-js"); };
  }, []);
  return null;
}

export function Stars({ n, className = "h-4 w-4" }: { n: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`${className} ${i <= n ? "fill-[#F2A93B] text-[#F2A93B]" : "fill-[#E9DFD5] text-[#E9DFD5]"}`} />)}
    </span>
  );
}

/** Real reviews in a varied wall, with "show more". */
export function ReviewWall({ reviews, first = 9, step = 12 }: { reviews: LandingReview[]; first?: number; step?: number }) {
  const [n, setN] = useState(first);
  const more = useRef<HTMLDivElement>(null);
  const shown = reviews.slice(0, n);
  return (
    <>
      <div className="columns-1 gap-5 md:columns-2 xl:columns-3 [&>*]:mb-5">
        {shown.map((r, i) => {
          const dark = i % 5 === 3, feature = i === 0;
          return (
            <figure key={i} className={`break-inside-avoid rounded-[24px] p-6 sm:p-7 ${dark ? "bg-[#15251F] text-[#F4EDE4]" : feature ? "bg-[color-mix(in_srgb,var(--b)_12%,#FFFDFC)] text-[#171714]" : "border border-[#E9DFD5] bg-[#FFFDFC] text-[#171714]"}`}>
              <div className="flex items-center justify-between gap-3">
                <Stars n={r.rating} />
                <span className={`lp-serif text-[2.5rem] leading-[0.5] ${dark ? "text-[var(--b)]" : "text-[color-mix(in_srgb,var(--b)_55%,#FFFDFC)]"}`} aria-hidden>&ldquo;</span>
              </div>
              <blockquote className={`mt-4 whitespace-pre-line ${feature ? "lp-serif text-[1.3125rem] leading-[1.45]" : "text-[1rem] leading-[1.65]"} ${dark ? "text-[#F4EDE4]" : "text-[#2b2925]"}`}>{r.text}</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[0.9375rem] font-bold ${dark ? "bg-[#243a31] text-[#F4EDE4]" : "bg-[var(--b)] text-[var(--on-b)]"}`} aria-hidden>{r.name.trim()[0]?.toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-semibold">{r.name}</span>
                  <span className={`block text-[0.8125rem] ${dark ? "text-[#b9c2bc]" : "text-[#696866]"}`}>{[r.course, r.date].filter(Boolean).join(" · ")}</span>
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <div ref={more} className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {n < reviews.length && (
          <button type="button" onClick={() => setN(n + step)} className="lp-btn inline-flex h-12 items-center gap-2 rounded-xl bg-[#171714] px-6 text-[0.9375rem] font-semibold text-[#FFFDFC]">
            Show more reviews <span className="text-[#b9b4ad]">({reviews.length - n} more)</span>
          </button>
        )}
        {n > first && <button type="button" onClick={() => { setN(first); more.current?.closest("section")?.scrollIntoView({ block: "start" }); }} className="inline-flex h-12 items-center rounded-xl px-5 text-[0.9375rem] font-semibold text-[#171714] ring-1 ring-[#D9CCBF]">Show fewer</button>}
      </div>
    </>
  );
}
