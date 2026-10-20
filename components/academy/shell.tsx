import Link from "next/link";
import { BookOpen, Flame, Home, MapPin, MessageCircle, Thermometer, Trophy, UserRound } from "lucide-react";
import type { LearnOrg } from "@/lib/learn/server";
import { brandStyle, PAGE } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { cn } from "@/lib/cn";

export type AcademyTab = "home" | "course" | "roast" | "coach" | "board" | "rooms" | "me" | "join";

/** The frame around every page of the online course: the business's site menu, then the course's own tabs. */
export function AcademyShell({ org, tab, signedIn, streak, children }: { org: LearnOrg; tab: AcademyTab; signedIn: boolean; streak?: number; children: React.ReactNode }) {
  const base = `/academy/${org.slug}`;
  const tabs: { key: AcademyTab; href: string; label: string; Icon: typeof Home; show: boolean; phone?: boolean }[] = [
    { key: "home", href: base, label: "Home", Icon: Home, show: true },
    { key: "course", href: `${base}/course`, label: "Lessons", Icon: BookOpen, show: true },
    { key: "roast", href: `${base}/roast`, label: "Roast simulator", Icon: Thermometer, show: true },
    { key: "coach", href: `${base}/coach`, label: "AI coach", Icon: MessageCircle, show: org.learn.ai.enabled },
    { key: "board", href: `${base}/board`, label: "Leaderboard", Icon: Trophy, show: true },
    { key: "rooms", href: `${base}/rooms`, label: "Training rooms", Icon: MapPin, show: org.learn.marketplace.enabled },
    { key: "me", href: signedIn ? `${base}/me` : `${base}#sign-in`, label: signedIn ? "Account" : "Sign in", Icon: UserRound, show: true, phone: true },
  ];
  return (
    <div data-book-root style={brandStyle(org)} className="min-h-screen bg-canvas">
      <MasterNav org={org} active="lessons" />
      <div className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className={`${PAGE} flex items-center gap-3`}>
          <Link href={base} className="hidden shrink-0 py-3 text-[0.9375rem] font-bold tracking-tight text-ink md:block">{org.learn.name}</Link>
          <nav aria-label="Online course" className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto py-2 md:justify-end">
            {tabs.filter((t) => t.show).map(({ key, href, label, Icon, phone }) => (
              <Link key={key} href={href} aria-current={tab === key ? "page" : undefined}
                className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[0.875rem] font-semibold transition", phone && "sm:hidden",
                  tab === key ? "bg-[color-mix(in_srgb,var(--b)_12%,transparent)] text-[var(--b)]" : "text-ink-muted hover:bg-zinc-100 hover:text-ink")}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>
          {signedIn ? (
            <Link href={`${base}/me`} className={cn("hidden h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[0.875rem] font-semibold sm:inline-flex", tab === "me" ? "bg-zinc-100 text-ink" : "text-ink-muted hover:bg-zinc-100")}>
              {typeof streak === "number" && streak > 0 && <span className="inline-flex items-center gap-0.5 text-orange-600"><Flame className="h-4 w-4" />{streak}</span>}My account
            </Link>
          ) : (
            <Link href={`${base}#sign-in`} className="hidden h-10 shrink-0 items-center rounded-xl px-3 text-[0.875rem] font-semibold text-ink-muted hover:bg-zinc-100 sm:inline-flex">Sign in</Link>
          )}
        </div>
      </div>
      <main className={`${PAGE} py-6 sm:py-8`}>{children}</main>
      <footer className="pb-10 pt-4 text-center text-[0.75rem] text-ink-faint">
        {[org.contact_phone, org.contact_email].filter(Boolean).join(" · ")}
        <p className="mt-1">{org.learn.name} · {org.name}</p>
      </footer>
    </div>
  );
}

export { card, btn, btnGhost, field } from "./ui";
