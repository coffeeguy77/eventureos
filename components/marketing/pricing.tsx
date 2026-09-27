import { ArrowRight, Check } from "lucide-react";

/** A plan, once they're final. Keep every field true to what the plan actually includes. */
export interface Plan { id: string; name: string; price: string; period?: string; blurb: string; features: string[]; cta?: string; highlighted?: boolean }

/**
 * Pricing. With no plans yet it shows a "being finalised" panel with a working demo CTA —
 * no invented names, prices or limits. Pass real plans and it renders them as cards instead.
 */
export function Pricing({ plans }: { plans: Plan[] }) {
  return (
    <div>
      <div className="mx-auto max-w-[48rem] text-center">
        <p data-reveal className="mk-eyebrow">Pricing</p>
        <h2 data-reveal className="mk-h2 mt-5">{plans.length ? "Simple plans for every size of events business." : "Plans are being finalised."}</h2>
      </div>
      {plans.length ? (
        <div className={`mt-14 grid gap-4 ${plans.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
          {plans.map((p) => (
            <article key={p.id} data-reveal className={`mk-card flex flex-col p-8 ${p.highlighted ? "ring-2 ring-[rgb(var(--accent))]" : ""}`}>
              <h3 className="text-[1.25rem] font-semibold">{p.name}</h3>
              <p className="mk-muted mt-1">{p.blurb}</p>
              <p className="mk-serif mt-6 text-[3rem] leading-none">{p.price}<span className="mk-muted ml-1 font-sans text-[1rem]">{p.period}</span></p>
              <ul className="mt-6 space-y-2.5">{p.features.map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--accent))]" />{f}</li>)}</ul>
              <a href="#demo" className={`mk-btn mt-8 ${p.highlighted ? "mk-btn-primary" : "mk-btn-ghost"}`}>{p.cta ?? "Get started"}</a>
            </article>
          ))}
        </div>
      ) : (
        <div data-reveal className="mk-card relative mx-auto mt-12 max-w-[64rem] overflow-hidden p-8 sm:p-12">
          <div aria-hidden className="mk-glow -right-24 -top-24 h-72 w-72 bg-[radial-gradient(closest-side,rgb(var(--mk-pink)/.5),transparent)]" />
          <div className="relative grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="text-[1.25rem] font-semibold tracking-tight">We’re opening EventureOS to event businesses now.</p>
              <p className="mk-muted mt-3 max-w-2xl leading-relaxed">We’re finalising plans so pricing reflects how event companies actually work. Book a demo and we’ll talk you through access for your team — and what it would take to move your bookings across.</p>
            </div>
            <a href="#demo" className="mk-btn mk-btn-primary">Talk to us about access <ArrowRight className="h-4 w-4" /></a>
          </div>
        </div>
      )}
    </div>
  );
}
