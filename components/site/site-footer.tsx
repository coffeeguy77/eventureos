import Link from "next/link";
import { Briefcase, CalendarDays, ChevronDown, Coffee, Facebook, Flame, GraduationCap, Instagram, Mail, MapPin, Package, Phone, Store, Truck } from "lucide-react";
import type { FooterGroup, FooterIcon, FooterLink, FooterModel } from "@/lib/site/footer";

/**
 * The site-wide footer, in three designs to choose from:
 *  A "directory" — dark, quick actions on top, every business as a column of links
 *  B "businesses" — a card for each part of the business, then a contact strip
 *  C "compact"   — light and tidy; the columns fold into tap-to-open lists on a phone
 */
export type FooterVariant = "a" | "b" | "c";
type Hours = { day: string; text: string; closed: boolean }[];

const ICON: Record<FooterIcon, typeof Coffee> = { cafe: Store, coffee: Coffee, learn: GraduationCap, roast: Flame, events: Truck, wholesale: Package, jobs: Briefcase };
const serif = "shop-serif";

function A({ l, className }: { l: FooterLink; className: string }) {
  return l.external
    ? <a href={l.href} target="_blank" rel="noopener noreferrer" className={className}>{l.label}</a>
    : <Link href={l.href} className={className}>{l.label}</Link>;
}

function SocialIcons({ m, tone }: { m: FooterModel; tone: "dark" | "light" }) {
  if (!m.social.length) return null;
  return (
    <div className="flex gap-2">
      {m.social.map((s) => {
        const I = s.label === "Facebook" ? Facebook : Instagram;
        return <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}
          className={`grid h-10 w-10 place-items-center rounded-full ring-1 transition ${tone === "dark" ? "text-white/85 ring-white/20 hover:bg-white/10" : "text-[#3A3431] ring-[#E5DAD1] hover:bg-white"}`}><I className="h-[18px] w-[18px]" /></a>;
      })}
    </div>
  );
}

function ContactList({ m, tone }: { m: FooterModel; tone: "dark" | "light" }) {
  const t = tone === "dark" ? "text-white/75 hover:text-white" : "text-[#5E5853] hover:text-[#151312]";
  const ic = tone === "dark" ? "text-[var(--pk)]" : "text-[var(--pk)]";
  return (
    <ul className="space-y-2.5 text-[0.9063rem]">
      {m.contact.address && <li className="flex gap-2.5"><MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${ic}`} /><span className={tone === "dark" ? "text-white/75" : "text-[#5E5853]"}>{m.contact.address}{m.contact.directions && <> · <a href={m.contact.directions} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--pk)] hover:underline">Directions</a></>}</span></li>}
      {m.contact.phone && <li className="flex gap-2.5"><Phone className={`mt-0.5 h-4 w-4 shrink-0 ${ic}`} /><a href={`tel:${m.contact.phone.replace(/[^\d+]/g, "")}`} className={t}>{m.contact.phone}</a></li>}
      {m.contact.email && <li className="flex gap-2.5"><Mail className={`mt-0.5 h-4 w-4 shrink-0 ${ic}`} /><a href={`mailto:${m.contact.email}`} className={t}>{m.contact.email}</a></li>}
    </ul>
  );
}

function HoursList({ hours, tone }: { hours: Hours; tone: "dark" | "light" }) {
  if (!hours.length) return null;
  return (
    <dl className="space-y-1 text-[0.8438rem]">
      {hours.map((r) => <div key={r.day} className="flex justify-between gap-6"><dt className={tone === "dark" ? "text-white/60" : "text-[#8C847D]"}>{r.day.slice(0, 3)}</dt><dd className={r.closed ? (tone === "dark" ? "text-white/40" : "text-[#A39A93]") : tone === "dark" ? "text-white/90" : "text-[#151312]"}>{r.text}</dd></div>)}
    </dl>
  );
}

function Legal({ m, tone }: { m: FooterModel; tone: "dark" | "light" }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-t py-5 text-[0.8125rem] ${tone === "dark" ? "border-white/10 text-white/50" : "border-[#EDE3DB] text-[#8C847D]"}`}>
      <p>© {new Date().getFullYear()} {m.name}</p>
      <p>Website by EventureOS</p>
    </div>
  );
}

const WRAP = "mx-auto w-full max-w-[1360px] px-5 sm:px-8 lg:px-10";

/* ------------------------------------------------------------------ A · directory (dark or light) */
export type FooterTone = "dark" | "light";
const TONE = {
  dark: { bg: "bg-[#141011] text-white", line: "border-white/10", head: "text-white", link: "text-white/70 hover:text-white", ghost: "text-white ring-1 ring-white/25 hover:bg-white/10" },
  light: { bg: "border-t border-[#EDE3DB] bg-[#FFFBF8] text-[#151312]", line: "border-[#EDE3DB]", head: "text-[#151312]", link: "text-[#5E5853] hover:text-[#151312]", ghost: "bg-white text-[#151312] ring-1 ring-[#E5DAD1] hover:bg-[#F7F0EA]" },
} as const;

function Directory({ m, hours, tone = "dark" }: { m: FooterModel; hours: Hours; tone?: FooterTone }) {
  const t = TONE[tone];
  const link = `block py-1 text-[0.9063rem] transition ${t.link}`;
  const cols: { key: string; title: string; links: FooterLink[]; I?: typeof Coffee }[] = [
    ...m.groups.map((g) => ({ key: g.key, title: g.title, links: g.links, I: ICON[g.key] })),
    ...(m.company.length ? [{ key: "company", title: m.name, links: m.company }] : []),
  ];
  const head = `flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-[0.14em] ${t.head}`;
  return (
    <footer className={t.bg} data-footer="a" data-tone={tone}>
      {m.actions.length > 0 && (
        <div className={`border-b ${t.line}`}>
          <div className={`${WRAP} flex flex-col gap-5 py-9 lg:flex-row lg:items-center lg:justify-between`}>
            <p className={`${serif} text-[clamp(1.625rem,2.6vw,2.25rem)] font-semibold leading-tight`}>What can we pour for you?</p>
            <div className="flex flex-wrap gap-2.5">
              {m.actions.map((a, i) => <A key={a.href} l={a} className={`shop-btn inline-flex h-[48px] items-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold ${i === 0 ? "bg-[var(--pk)] text-white" : t.ghost}`} />)}
            </div>
          </div>
        </div>
      )}
      {/* Phone: tap a heading to open its links */}
      <div className={`${WRAP} py-6 sm:hidden`}>
        {cols.map((c) => (
          <details key={c.key} className={`group border-b py-3 ${t.line}`}>
            <summary className={`flex cursor-pointer list-none items-center justify-between ${head}`}>
              <span className="flex items-center gap-2">{c.I && <c.I className="h-4 w-4 text-[var(--pk)]" />}{c.title}</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="pt-2">{c.links.map((l) => <A key={l.href} l={l} className={link} />)}</div>
          </details>
        ))}
      </div>
      {/* Computer: every business as a column */}
      <div className={`${WRAP} hidden gap-x-8 gap-y-10 py-14 sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.2fr)]`}>
        {cols.map((c) => (
          <nav key={c.key} aria-label={c.title}>
            <p className={`mb-3 ${head}`}>{c.I && <c.I className="h-4 w-4 text-[var(--pk)]" />}{c.title}</p>
            {c.links.map((l) => <A key={l.href} l={l} className={link} />)}
          </nav>
        ))}
      </div>
      <div className={`${WRAP} grid gap-10 border-t py-10 md:grid-cols-[1.3fr_1fr_auto] ${t.line}`}>
        <div><p className={`${serif} mb-4 text-[1.5rem] font-semibold`}>{m.name}</p><ContactList m={m} tone={tone} /></div>
        {hours.length > 0 && <div><p className={`mb-3 ${head}`}>Café hours</p><HoursList hours={hours} tone={tone} /></div>}
        {m.social.length > 0 && <div><p className={`mb-3 ${head}`}>Follow us</p><SocialIcons m={m} tone={tone} /></div>}
      </div>
      <div className={WRAP}><Legal m={m} tone={tone} /></div>
    </footer>
  );
}

/* ------------------------------------------------------------------ B · businesses */
function Businesses({ m, hours }: { m: FooterModel; hours: Hours }) {
  return (
    <footer className="bg-[#FFFBF8]" data-footer="b">
      <div className={`${WRAP} py-14 sm:py-16`}>
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[var(--pk)]">Everything {m.name}</p>
        <h2 className={`${serif} mt-2 text-[clamp(1.875rem,3vw,2.5rem)] font-semibold text-[#151312]`}>One roastery, lots of ways to enjoy it</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {m.groups.map((g) => <BusinessCard key={g.key} g={g} />)}
        </div>
        {m.company.length > 0 && (
          <nav aria-label={m.name} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[0.9063rem]">
            {m.company.map((l) => <A key={l.href} l={l} className="text-[#5E5853] underline-offset-4 hover:text-[#151312] hover:underline" />)}
          </nav>
        )}
      </div>
      <div className="bg-[#141011] text-white">
        <div className={`${WRAP} grid gap-10 py-10 md:grid-cols-[1.3fr_1fr_auto] md:items-start`}>
          <div><p className={`${serif} mb-4 text-[1.5rem] font-semibold`}>{m.name}</p><ContactList m={m} tone="dark" /></div>
          <div><p className="mb-3 text-[0.8125rem] font-semibold uppercase tracking-[0.14em]">Café hours</p><HoursList hours={hours} tone="dark" /></div>
          <SocialIcons m={m} tone="dark" />
        </div>
        <div className={WRAP}><Legal m={m} tone="dark" /></div>
      </div>
    </footer>
  );
}

function BusinessCard({ g }: { g: FooterGroup }) {
  const I = ICON[g.key];
  const [first, ...rest] = g.links;
  return (
    <div className="group flex flex-col rounded-[22px] bg-white p-5 ring-1 ring-[#EDE3DB] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-26px_rgba(80,45,40,.45)]">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><I className="h-5 w-5" /></span>
      <A l={{ ...first, label: g.title }} className="mt-4 text-[1.125rem] font-semibold text-[#151312] hover:text-[var(--pk)]" />
      <p className="mt-1 text-[0.875rem] leading-relaxed text-[#5E5853]">{g.blurb}</p>
      <div className="mt-4 flex flex-1 flex-col justify-end gap-1 border-t border-[#F1E9E2] pt-3">
        {[first, ...rest].map((l) => <A key={l.href} l={{ ...l, label: `${l.label} →` }} className="text-[0.875rem] font-medium text-[#3A3431] hover:text-[var(--pk)]" />)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ C · compact */
function Compact({ m, hours }: { m: FooterModel; hours: Hours }) {
  const link = "block py-1 text-[0.875rem] text-[#5E5853] transition hover:text-[#151312]";
  const cols: { key: string; title: string; links: FooterLink[]; I?: typeof Coffee }[] = [
    ...m.groups.map((g) => ({ key: g.key, title: g.title, links: g.links, I: ICON[g.key] })),
    ...(m.company.length ? [{ key: "company", title: m.name, links: m.company }] : []),
  ];
  return (
    <footer className="border-t border-[#EDE3DB] bg-[#FFFBF8]" data-footer="c">
      <div className={`${WRAP} grid gap-10 py-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2.4fr)] lg:gap-14`}>
        <div>
          <p className={`${serif} text-[1.75rem] font-semibold text-[#151312]`}>{m.name}</p>
          <div className="mt-4"><ContactList m={m} tone="light" /></div>
          {hours.length > 0 && (
            <details className="group mt-5 rounded-2xl bg-white px-4 py-3 ring-1 ring-[#EDE3DB]">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[0.875rem] font-semibold text-[#151312]"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--pk)]" />Café hours</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
              <div className="mt-3"><HoursList hours={hours} tone="light" /></div>
            </details>
          )}
          <div className="mt-5"><SocialIcons m={m} tone="light" /></div>
        </div>
        <div>
          {/* Phone: tap a heading to open its links */}
          <div className="sm:hidden">
            {cols.map((c) => (
              <details key={c.key} className="group border-b border-[#EDE3DB] py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[0.9375rem] font-semibold text-[#151312]">
                  <span className="flex items-center gap-2">{c.I && <c.I className="h-4 w-4 text-[var(--pk)]" />}{c.title}</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                </summary>
                <div className="pt-1">{c.links.map((l) => <A key={l.href} l={l} className={link} />)}</div>
              </details>
            ))}
          </div>
          {/* Computer: everything in columns */}
          <div className="hidden gap-x-6 gap-y-8 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            {cols.map((c) => (
              <nav key={c.key} aria-label={c.title}>
                <p className="mb-2 flex items-center gap-2 text-[0.9375rem] font-semibold text-[#151312]">{c.I && <c.I className="h-4 w-4 text-[var(--pk)]" />}{c.title}</p>
                {c.links.map((l) => <A key={l.href} l={l} className={link} />)}
              </nav>
            ))}
          </div>
        </div>
      </div>
      <div className={WRAP}><Legal m={m} tone="light" /></div>
    </footer>
  );
}

export function SiteFooter({ m, variant = "a", tone = "dark", hours = [] }: { m: FooterModel; variant?: FooterVariant; tone?: FooterTone; hours?: Hours }) {
  if (variant === "b") return <Businesses m={m} hours={hours} />;
  if (variant === "c") return <Compact m={m} hours={hours} />;
  return <Directory m={m} hours={hours} tone={tone} />;
}

