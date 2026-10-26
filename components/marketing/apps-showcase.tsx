"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { APPS, CORE, type AppKey } from "@/lib/apps";
import { AppIcon } from "@/components/admin/app-icon";

const KINDS: { id: string; label: string; apps: AppKey[] }[] = [
  { id: "hire", label: "Event & party hire", apps: ["rentals", "website", "wages"] },
  { id: "carts", label: "Coffee carts & mobile bars", apps: ["rentals", "bookings", "store", "wholesale", "website", "wages"] },
  { id: "catering", label: "Catering", apps: ["kitchen", "wages", "offers", "website"] },
  { id: "training", label: "Classes & training", apps: ["bookings", "learn", "offers", "website"] },
  { id: "venue", label: "Venues", apps: ["bookings", "kitchen", "wages", "website"] },
];

/** Pick your kind of business and see which apps fit; every app with what it does. */
export function AppsShowcase() {
  const [kind, setKind] = useState<string | null>(null);
  const picked = new Set(KINDS.find((k) => k.id === kind)?.apps ?? []);
  const apps = kind ? [...APPS].sort((a, b) => Number(picked.has(b.key)) - Number(picked.has(a.key))) : APPS;
  return (
    <>
      <section data-band="b" className="relative py-20 sm:py-24">
        <div className="mk-wrap">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
            <div>
              <p className="mk-eyebrow">Every business gets</p>
              <h2 className="mk-h2 mt-5">The core.</h2>
              <p className="mk-muted mt-5 leading-relaxed">From the first enquiry to the paid invoice, before you add a single app.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {CORE.map((c) => (
                <div key={c.name} className="mk-card flex gap-3 p-5">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--accent))]" />
                  <div><p className="font-semibold">{c.name}</p><p className="mk-muted mt-0.5 text-[0.9375rem]">{c.text}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section data-band="a" className="relative py-20 sm:py-28">
        <div className="mk-wrap">
          <div className="mx-auto max-w-[48rem] text-center">
            <p className="mk-eyebrow">Then add the apps you need</p>
            <h2 className="mk-h2 mt-5">What kind of business do you run?</h2>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2" role="group" aria-label="Your kind of business">
            {KINDS.map((k) => (
              <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}
                className={`rounded-full px-4 py-2 text-[0.9375rem] font-medium transition-colors ${kind === k.id ? "bg-[rgb(var(--accent))] text-white" : "mk-card hover:border-[rgb(var(--accent)/.6)]"}`}>
                {k.label}
              </button>
            ))}
          </div>
          {kind && <p className="mk-muted mt-4 text-center text-[0.9375rem]">Suggested for you first. Every app works with the others and with the core.</p>}
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {apps.map((a) => {
              const hi = picked.has(a.key);
              return (
                <article key={a.key} id={a.key} className={`mk-card flex flex-col p-7 transition-all duration-300 ${hi ? "ring-2 ring-[rgb(var(--accent))]" : kind ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgb(var(--accent)/.12)] text-[rgb(var(--accent))]"><AppIcon icon={a.icon} className="h-5 w-5" /></span>
                    <div>
                      <h3 className="text-[1.25rem] font-semibold tracking-tight">{a.name}</h3>
                      {hi && <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-[rgb(var(--accent))]">Suggested</p>}
                    </div>
                  </div>
                  <p className="mt-4 font-medium">{a.tagline}</p>
                  <p className="mk-muted mt-2 leading-relaxed">{a.description}</p>
                  <ul className="mt-5 flex-1 space-y-2 text-[0.9375rem]">
                    {a.features.map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--accent))]" />{f}</li>)}
                  </ul>
                  <p className="mk-faint mt-6 text-[0.8125rem]">For: {a.for}</p>
                </article>
              );
            })}
          </div>
          <div className="mt-14 text-center">
            <a href="/#demo" className="mk-btn mk-btn-primary">See it with your business in mind <ArrowRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>
    </>
  );
}
