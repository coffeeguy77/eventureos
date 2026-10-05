"use client";

import { useEffect, useRef, useState } from "react";
import { BookingFlow } from "./booking-flow";

type FlowProps = Parameters<typeof BookingFlow>[0];

/** Ask the booking section to show a course and scroll to it (used by "Book this course" buttons). */
export function BookCourseButton({ slug, className, children }: { slug: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={`?course=${slug}#book`} className={className} onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("eos:course", { detail: slug })); }}>
      {children}
    </a>
  );
}

/** The booking form for every course on one page, with a switcher between courses. */
export function LandingBooking({ courses, initial, base }: {
  courses: { slug: string; label: string; course: FlowProps["course"]; sessions: FlowProps["sessions"] }[];
  initial: string | null;
  base: Omit<FlowProps, "course" | "sessions" | "preselect">;
}) {
  const [slug, setSlug] = useState(initial && courses.some((c) => c.slug === initial) ? initial : courses[0]?.slug);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const go = (e: Event) => {
      const s = (e as CustomEvent<string>).detail;
      if (courses.some((c) => c.slug === s)) setSlug(s);
      ref.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", `?course=${s}#book`);
    };
    window.addEventListener("eos:course", go);
    return () => window.removeEventListener("eos:course", go);
  }, [courses]);
  const c = courses.find((x) => x.slug === slug) ?? courses[0];
  if (!c) return null;
  return (
    <div ref={ref} className="scroll-mt-6">
      {courses.length > 1 && (
        <div className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl bg-zinc-100 p-1" role="tablist" aria-label="Choose a course">
          {courses.map((x) => (
            <button key={x.slug} type="button" role="tab" aria-selected={x.slug === c.slug} onClick={() => setSlug(x.slug)}
              className={`h-11 rounded-xl px-4 text-[0.9375rem] font-semibold transition-colors ${x.slug === c.slug ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}>
              {x.label}
            </button>
          ))}
        </div>
      )}
      {/* key: a fresh form for each course */}
      <BookingFlow key={c.slug} {...base} course={c.course} sessions={c.sessions} preselect={null} />
    </div>
  );
}
