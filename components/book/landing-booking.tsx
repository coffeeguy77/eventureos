"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { BookingFlow } from "./booking-flow";

type FlowProps = Parameters<typeof BookingFlow>[0];
type Pick = { slug: string; session?: string | null };

/** Ask the booking section to show a course (and optionally a date) and scroll to it. */
export function BookCourseButton({ slug, session, className, children }: { slug: string; session?: string | null; className?: string; children: React.ReactNode }) {
  return (
    <a href={`?course=${slug}#book`} className={className}
      onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent<Pick>("eos:course", { detail: { slug, session: session ?? null } })); }}>
      {children}
    </a>
  );
}

/** The booking form for every course on one page: step 1 picks the course, then the normal booking steps. */
export function LandingBooking({ courses, initial, base, dateStyle = "list" }: {
  courses: { slug: string; label: string; meta?: string; course: FlowProps["course"]; sessions: FlowProps["sessions"] }[];
  initial: string | null;
  base: Omit<FlowProps, "course" | "sessions" | "preselect">;
  dateStyle?: "list" | "cards";
}) {
  const [slug, setSlug] = useState(initial && courses.some((c) => c.slug === initial) ? initial : courses[0]?.slug);
  const [pre, setPre] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const go = (e: Event) => {
      const d = (e as CustomEvent<Pick | string>).detail;
      const p: Pick = typeof d === "string" ? { slug: d } : d;
      if (courses.some((c) => c.slug === p.slug)) { setSlug(p.slug); setPre(p.session ?? null); }
      ref.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", `?course=${p.slug}#book`);
    };
    window.addEventListener("eos:course", go);
    return () => window.removeEventListener("eos:course", go);
  }, [courses]);
  const c = courses.find((x) => x.slug === slug) ?? courses[0];
  if (!c) return null;
  const many = courses.length > 1;
  return (
    <div ref={ref} className="scroll-mt-24">
      {many && (dateStyle === "cards" ? (
        <section className="mb-4 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <h2 className="mb-3 flex items-center gap-2.5 text-[1.0625rem] font-semibold text-ink">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--b)] text-[0.8125rem] font-bold text-[var(--on-b)]"><Check className="h-4 w-4" /></span>Choose your course
          </h2>
          <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Choose a course">
            {courses.map((x) => {
              const on = x.slug === c.slug;
              return (
                <button key={x.slug} type="button" role="tab" aria-selected={on} onClick={() => { setSlug(x.slug); setPre(null); }}
                  className={`flex min-h-[64px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${on ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_8%,transparent)] ring-2 ring-[var(--b)]" : "border-line hover:border-line-strong hover:bg-zinc-50"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1rem] font-semibold text-ink">{x.label}</span>
                    {x.meta && <span className="block text-[0.8438rem] text-ink-muted">{x.meta}</span>}
                  </span>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${on ? "border-[var(--b)] bg-[var(--b)] text-[var(--on-b)]" : "border-line-strong"}`}>{on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl bg-zinc-100 p-1" role="tablist" aria-label="Choose a course">
          {courses.map((x) => (
            <button key={x.slug} type="button" role="tab" aria-selected={x.slug === c.slug} onClick={() => { setSlug(x.slug); setPre(null); }}
              className={`h-11 rounded-xl px-4 text-[0.9375rem] font-semibold transition-colors ${x.slug === c.slug ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}>
              {x.label}
            </button>
          ))}
        </div>
      ))}
      {/* key: a fresh form for each course (and for a date picked from elsewhere on the page) */}
      <BookingFlow key={`${c.slug}:${pre ?? ""}`} {...base} course={c.course} sessions={c.sessions} preselect={pre}
        dateStyle={dateStyle} stepOffset={many && dateStyle === "cards" ? 1 : 0} />
    </div>
  );
}
