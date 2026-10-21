import Link from "next/link";
import { BookOpen, Flame, Home, MapPin, MessageCircle, Thermometer, Trophy, UserRound } from "lucide-react";
import type { LearnOrg } from "@/lib/learn/server";
import { brandStyle, PAGE } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { SHOP_CSS } from "@/components/shop/frame";
import { cn } from "@/lib/cn";
import { readShop } from "@/lib/shop/core";
import { readEvents } from "@/lib/events/core";
import { readJobSettings } from "@/lib/jobs/core";
import { cafePages, readCafe } from "@/lib/cafe/core";

export type AcademyTab = "home" | "course" | "roast" | "coach" | "board" | "rooms" | "me" | "join";

/** The frame around every page of the online course: the business's site menu, then the course's own tabs. */
export function AcademyShell({ org, tab, signedIn, streak, bare, children }: { org: LearnOrg; tab: AcademyTab; signedIn: boolean; streak?: number; /** full-width sections (the sales page) */ bare?: boolean; children: React.ReactNode }) {
  const base = `/academy/${org.slug}`;
  const tabs: { key: AcademyTab; href: string; label: string; Icon: typeof Home; show: boolean; phone?: boolean }[] = [
    { key: "home", href: base, label: "Home", Icon: Home, show: true },
    { key: "course", href: `${base}/course`, label: "Lessons", Icon: BookOpen, show: true },
    { key: "roast", href: `${base}/roast`, label: "Roast simulator", Icon: Thermometer, show: true },
    { key: "coach", href: `${base}/coach`, label: "AI coach", Icon: MessageCircle, show: org.learn.ai.enabled },
    { key: "board", href: `${base}/board`, label: "Leaderboard", Icon: Trophy, show: true },
    { key: "rooms", href: `${base}/rooms`, label: "Training rooms", Icon: MapPin, show: org.learn.marketplace.enabled },
    { key: "me", href: signedIn ? `${base}/me` : `${base}?signin=1#sign-in`, label: signedIn ? "Account" : "Sign in", Icon: UserRound, show: true, phone: true },
  ];
  return (
    <div data-book-root style={brandStyle(org)} className={cn("shop min-h-screen", bare ? "bg-[#FCFAF7]" : "bg-canvas")}>
      <style>{SHOP_CSS}</style>
      <MasterNav org={org} active="lessons" tone="light" />
      <div className="sticky top-0 z-40 border-b border-[#EEE6DF] bg-[#FCFAF7]/95 backdrop-blur">
        <div className={`${PAGE} flex h-[46px] items-center gap-2 md:grid md:grid-cols-[1fr_auto_1fr]`}>
          <span className="hidden md:block" />
          <nav aria-label="Online course" className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto md:justify-center">
            <Link href={base} aria-current={tab === "home" ? "page" : undefined}
              className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-[#2B2522] pl-1 pr-3.5 text-[0.8125rem] font-semibold text-white">
              {org.learn.logo ? <img src={org.learn.logo} alt="" className="h-[22px] w-[22px] object-contain" /> : <Home className="ml-1 h-3.5 w-3.5" />}{org.learn.name}
            </Link>
            {tabs.filter((t) => t.show && t.key !== "home" && t.key !== "me" && (signedIn || (t.key !== "board" && t.key !== "rooms"))).map(({ key, href, label }) => (
              <Link key={key} href={href} aria-current={tab === key ? "page" : undefined}
                className={cn("inline-flex h-[30px] shrink-0 items-center rounded-full px-3 text-[0.8125rem] font-medium transition",
                  tab === key ? "bg-[color-mix(in_srgb,var(--pk)_10%,transparent)] text-[var(--pk)]" : "text-[#3A3431] hover:text-black")}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 justify-end">
            {signedIn ? (
              <Link href={`${base}/me`} className={cn("inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium", tab === "me" ? "text-[var(--pk)]" : "text-[#3A3431] hover:text-black")}>
                {typeof streak === "number" && streak > 0 && <span className="inline-flex items-center gap-0.5 text-orange-600"><Flame className="h-4 w-4" />{streak}</span>}<UserRound className="h-4 w-4" /><span className="hidden sm:inline">My account</span>
              </Link>
            ) : (
              <Link href={`${base}?signin=1#sign-in`} className="inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium text-[#3A3431] hover:text-black"><UserRound className="h-4 w-4" />Sign in</Link>
            )}
          </div>
        </div>
      </div>
      {bare ? <main>{children}</main> : <main className={`${PAGE} py-6 sm:py-8`}>{children}</main>}
      <AcademyFooter org={org} />
    </div>
  );
}

/** The footer from the design: the business, the course's pages, the rest of the site, contact details. */
function AcademyFooter({ org }: { org: LearnOrg }) {
  const base = `/academy/${org.slug}`, slug = org.slug;
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  const learn = [
    { href: base, label: org.learn.name }, { href: `${base}/course`, label: "Lessons" }, { href: `${base}/roast`, label: "Roast simulator" },
    ...(org.learn.ai.enabled ? [{ href: `${base}/coach`, label: "AI coach" }] : []),
  ];
  const explore = [
    readShop(org.rawSettings).enabled ? { href: `/shop/${slug}`, label: "Buy coffee" } : null,
    cafePages(readCafe(org.rawSettings)).home ? { href: `/cafe/${slug}`, label: "Our café" } : null,
    readEvents(org.rawSettings).enabled ? { href: `/hire/${slug}`, label: "Events" } : null,
    readJobSettings(org.rawSettings, org.name).enabled ? { href: `/jobs/${slug}`, label: "Job board" } : null,
    org.settings.enabled && org.stripeReady ? { href: `/book/${slug}/gift`, label: "Gift certificates" } : null,
  ].filter((x): x is { href: string; label: string } => !!x);
  const head = "text-[0.8125rem] font-semibold text-[#151312]";
  const link = "block py-1 text-[0.8125rem] text-[#5E5853] hover:text-[#151312]";
  return (
    <footer className="border-t border-[#EEE6DF] bg-[#FCFAF7]">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          {logo ? <img src={logo} alt={org.name} className="h-8 max-w-[170px] object-contain" /> : <p className="font-semibold">{org.name}</p>}
          <p className="mt-3 max-w-[260px] text-[0.8125rem] leading-relaxed text-[#5E5853]">{org.learn.tagline}</p>
        </div>
        <div><p className={head}>Learn</p><div className="mt-2">{learn.map((l) => <Link key={l.href} href={l.href} className={link}>{l.label}</Link>)}</div></div>
        {explore.length > 0 && <div><p className={head}>Explore</p><div className="mt-2">{explore.map((l) => <Link key={l.href} href={l.href} className={link}>{l.label}</Link>)}</div></div>}
        <div>
          <p className={head}>Contact</p>
          <div className="mt-2 text-[0.8125rem] text-[#5E5853]">
            {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/\s+/g, "")}`} className={link}>{org.contact_phone}</a>}
            {org.contact_email && <a href={`mailto:${org.contact_email}`} className={link}>{org.contact_email}</a>}
            {org.address && <p className="py-1">{org.address}</p>}
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-2 border-t border-[#EEE6DF] px-6 py-5 text-[0.75rem] text-[#8C847D]">
        <p>© {new Date().getFullYear()} {org.name}. {org.learn.name}.</p>
        {org.contact_email && <a href={`mailto:${org.contact_email}`} className="hover:text-[#151312]">Contact</a>}
      </div>
    </footer>
  );
}

export { card, btn, btnGhost, field } from "./ui";
