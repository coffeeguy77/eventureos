import Link from "next/link";
import { PublicFooter } from "@/components/site/public-footer";
import { BookOpen, Flame, Home, MapPin, MessageCircle, Thermometer, Trophy, UserRound } from "lucide-react";
import type { LearnOrg } from "@/lib/learn/server";
import { brandStyle, PAGE } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { SHOP_CSS } from "@/components/shop/frame";
import { cn } from "@/lib/cn";

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
              className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-[#2B2522] px-3.5 text-[0.8125rem] font-semibold text-white">
{org.learn.name}
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
      <PublicFooter org={org} />
    </div>
  );
}


export { card, btn, btnGhost, field } from "./ui";
