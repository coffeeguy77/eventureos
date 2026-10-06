"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronDown, Coffee, Heart, MapPin, PartyPopper } from "lucide-react";
import type { PublicCard } from "@/lib/jobs/server";

const AVAIL = [
  { id: "", label: "Availability" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekends", label: "Weekends" },
  { id: "am", label: "Mornings" },
  { id: "pm", label: "Afternoons" },
  { id: "eve", label: "Evenings" },
] as const;

function Select({ icon: I, value, onChange, children, label }: { icon: React.ElementType; value: string; onChange: (v: string) => void; children: React.ReactNode; label: string }) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <I className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--b)]" strokeWidth={1.8} />
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full cursor-pointer appearance-none rounded-2xl border border-white/12 bg-white/[0.04] pl-11 pr-10 text-[0.9063rem] text-white/90 outline-none transition hover:border-white/25 focus:border-[var(--b)] [&>option]:bg-[#1b1615] [&>option]:text-white">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
    </label>
  );
}

const availLabel = (s: string) => (s === "Availability not set" ? s : ["Weekends", "Weekdays", "Any day"].includes(s) ? `Available ${s.toLowerCase()}` : `Available ${s}`);

/** "Baristas available now": real profiles, filtered in the browser. */
export function BaristaBoard({ cards, slug, business }: { cards: PublicCard[]; slug: string; business: string }) {
  const [suburb, setSuburb] = useState("");
  const [avail, setAvail] = useState("");
  const [skill, setSkill] = useState("");
  const [latte, setLatte] = useState("");
  const [events, setEvents] = useState("");
  const suburbs = useMemo(() => [...new Set(cards.map((c) => c.suburb).filter(Boolean) as string[])].sort(), [cards]);
  const skills = useMemo(() => [...new Set(cards.flatMap((c) => c.skills))].filter((s) => s !== "Latte art").sort(), [cards]);
  const list = cards.filter((c) => {
    if (suburb && c.suburb !== suburb) return false;
    if (skill && !c.skills.includes(skill)) return false;
    if (latte && !c.skills.includes("Latte art")) return false;
    if (events && !(c.work_types.includes("events") || c.skills.includes("Coffee cart / events"))) return false;
    if (avail) {
      const a = c.availability;
      if (avail === "weekends" && !((a.sat ?? []).length || (a.sun ?? []).length)) return false;
      if (avail === "weekdays" && !(["mon", "tue", "wed", "thu", "fri"] as const).some((d) => (a[d] ?? []).length)) return false;
      if ((avail === "am" || avail === "pm" || avail === "eve") && !Object.values(a).some((s) => s?.includes(avail))) return false;
    }
    return true;
  });
  const shown = list.slice(0, 8);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5 [&>*:first-child]:col-span-2 lg:[&>*:first-child]:col-span-1">
        <Select icon={MapPin} value={suburb} onChange={setSuburb} label="Suburb"><option value="">Suburb</option>{suburbs.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        <Select icon={CalendarDays} value={avail} onChange={setAvail} label="Availability">{AVAIL.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>
        <Select icon={Coffee} value={skill} onChange={setSkill} label="Skills"><option value="">Espresso skills</option>{skills.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        <Select icon={Heart} value={latte} onChange={setLatte} label="Latte art"><option value="">Latte art</option><option value="1">Does latte art</option></Select>
        <Select icon={PartyPopper} value={events} onChange={setEvents} label="Events"><option value="">Events</option><option value="1">Works events & carts</option></Select>
      </div>

      {shown.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/70">
          {cards.length ? "No baristas match those filters — try fewer." : `Baristas who trained with ${business} will appear here as they switch their profiles on.`}
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/jobs/${slug}/employers/barista/${c.id}`} className="group flex h-full gap-3.5 rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-[color-mix(in_srgb,var(--b)_60%,transparent)] hover:bg-white/[0.06]">
                {c.photo_url
                  ? <img src={c.photo_url} alt="" className="h-[148px] w-[112px] shrink-0 rounded-xl object-cover" loading="lazy" />
                  : <span className="grid h-[148px] w-[112px] shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--b)_18%,#211b19)] text-[2rem] font-bold text-[var(--b)]">{c.name.trim()[0]?.toUpperCase()}</span>}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 text-[1.125rem] font-semibold text-white" style={{ fontFamily: "'AU Dollar', 'Playfair Display', Georgia, serif" }}>
                    <span className="truncate">{c.name}</span>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.active ? "bg-emerald-400" : "bg-white/30"}`} title={c.active ? "Active recently" : undefined} />
                  </span>
                  {c.suburb && <span className="mt-0.5 flex items-center gap-1.5 text-[0.8438rem] text-white/65"><MapPin className="h-3.5 w-3.5 text-[var(--b)]" />{[c.suburb, c.state].filter(Boolean).join(", ")}</span>}
                  {c.tags.length > 0 && (
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                      {c.tags.map((t) => <span key={t} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[0.75rem] text-white/85 ring-1 ring-white/10">{t}</span>)}
                    </span>
                  )}
                  <span className="mt-auto flex items-end gap-2 pt-3">
                    <CalendarDays className="mb-0.5 h-4 w-4 shrink-0 text-[var(--b)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.8438rem] font-medium leading-tight text-white/90">{availLabel(c.summary)}</span>
                      {c.note && <span className="block truncate text-[0.75rem] text-white/55">{c.note}</span>}
                    </span>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ring-white/25 transition group-hover:bg-[var(--b)] group-hover:ring-[var(--b)]"><ArrowRight className="h-4 w-4 text-white" /></span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.length > shown.length && <p className="mt-4 text-center text-[0.875rem] text-white/60">{list.length - shown.length} more — <Link href={`/jobs/${slug}/employers/search`} className="font-semibold text-[var(--b)]">see them all</Link></p>}
    </div>
  );
}
