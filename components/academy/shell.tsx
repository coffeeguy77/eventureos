import Link from "next/link";
import { PublicFooter } from "@/components/site/public-footer";
import { SectionNav } from "@/components/site/section-nav";
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
      <MasterNav org={org} active="lessons" />
      <SectionNav org={org} label="Online course" title={org.learn.name} titleHref={base} active={tab}
        links={tabs.filter((t) => t.show && t.key !== "home" && t.key !== "me" && (signedIn || (t.key !== "board" && t.key !== "rooms"))).map(({ key, href, label }) => ({ key, href, label }))}
        actions={signedIn ? (
          <Link href={`${base}/me`} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium", tab === "me" ? "text-[var(--pk)]" : "opacity-80 hover:opacity-100")}>
            {typeof streak === "number" && streak > 0 && <span className="inline-flex items-center gap-0.5 text-orange-600"><Flame className="h-4 w-4" />{streak}</span>}<UserRound className="h-4 w-4" /><span className="hidden sm:inline">My account</span>
          </Link>
        ) : (
          <Link href={`${base}?signin=1#sign-in`} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium opacity-80 hover:opacity-100"><UserRound className="h-4 w-4" />Sign in</Link>
        )} />
      {bare ? <main>{children}</main> : <main className={`${PAGE} py-6 sm:py-8`}>{children}</main>}
      <PublicFooter org={org} />
    </div>
  );
}


export { card, btn, btnGhost, field } from "./ui";
