import Link from "next/link";
import { Award, Backpack, Gift, HelpCircle, MapPin, Navigation, ShieldCheck, UserRound } from "lucide-react";

interface Props {
  orgSlug: string; orgName: string; phone: string | null;
  location: string | null; whatToBring: string | null; certificate: boolean; gifts: boolean; faqs: { q: string; a: string }[]; terms: string | null;
  embed: boolean;
}

const card = "rounded-2xl border border-line bg-surface p-5 shadow-card";

/** The column beside the booking form: what to bring, where we are, certificates, questions, gifts. */
export function InfoPanel({ orgSlug, orgName, phone, location, whatToBring, certificate, gifts, faqs, terms, embed }: Props) {
  const maps = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : null;
  const q = embed ? "?embed=1" : "";
  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      {whatToBring && (
        <section className={card}>
          <h2 className="flex items-center gap-2 text-[0.9688rem] font-semibold text-ink"><Backpack className="h-4 w-4 text-[var(--b)]" />What to bring</h2>
          <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-muted">{whatToBring}</p>
        </section>
      )}
      {location && (
        <section className={`${card} overflow-hidden p-0`}>
          <iframe title={`Map: ${location}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=15&output=embed`} className="block h-44 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          <div className="p-5">
            <h2 className="flex items-center gap-2 text-[0.9688rem] font-semibold text-ink"><MapPin className="h-4 w-4 text-[var(--b)]" />Where we are</h2>
            <p className="mt-1.5 text-[0.875rem] text-ink-muted">{location}</p>
            <a href={maps!} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[0.8438rem] font-semibold text-[var(--b)]"><Navigation className="h-3.5 w-3.5" />Directions</a>
          </div>
        </section>
      )}
      {certificate && (
        <section className={card}>
          <h2 className="flex items-center gap-2 text-[0.9688rem] font-semibold text-ink"><Award className="h-4 w-4 text-[var(--b)]" />Do I get a certificate?</h2>
          <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-muted">Yes — everyone who completes the course gets a digital certificate with their name on it. Download it any time from your account.</p>
        </section>
      )}
      <section className={card}>
        <h2 className="flex items-center gap-2 text-[0.9688rem] font-semibold text-ink"><UserRound className="h-4 w-4 text-[var(--b)]" />Already booked?</h2>
        <p className="mt-1.5 text-[0.875rem] text-ink-muted">Sign in with your email to see your booking, change the date or download your certificate. No password needed.</p>
        <Link href={`/book/${orgSlug}/account${q}`} target={embed ? "_top" : undefined} className="mt-2 inline-flex text-[0.8438rem] font-semibold text-[var(--b)]">My bookings →</Link>
      </section>
      {faqs.length > 0 && (
        <section className={card}>
          <h2 className="flex items-center gap-2 text-[0.9688rem] font-semibold text-ink"><HelpCircle className="h-4 w-4 text-[var(--b)]" />Questions</h2>
          <div className="mt-2 divide-y divide-line">
            {faqs.map((f, i) => (
              <details key={i} className="group py-2.5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-[0.875rem] font-medium text-ink">{f.q}<span className="text-ink-faint transition group-open:rotate-45">+</span></summary>
                <p className="mt-1.5 whitespace-pre-line text-[0.8438rem] leading-relaxed text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}
      {gifts && (
        <Link href={`/book/${orgSlug}/gift${q}`} className="flex items-center gap-3 rounded-2xl bg-[var(--b)] p-5 text-[var(--on-b)] shadow-card hover:opacity-95">
          <Gift className="h-6 w-6 shrink-0" />
          <span><span className="block text-[0.9688rem] font-semibold">Give it as a gift</span><span className="block text-[0.8125rem] opacity-90">Gift certificates — emailed instantly or on the day.</span></span>
        </Link>
      )}
      {terms && (
        <details className={card}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[0.875rem] font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-[var(--b)]" />Booking terms</summary>
          <p className="mt-2 whitespace-pre-line text-[0.8125rem] leading-relaxed text-ink-muted">{terms}</p>
        </details>
      )}
      {phone && <p className="px-1 text-center text-[0.8125rem] text-ink-muted">Questions? Call {orgName} on <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-semibold text-ink">{phone}</a></p>}
    </aside>
  );
}
