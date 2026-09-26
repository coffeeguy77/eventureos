"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarRange, Code2, Palette, PlugZap, Users, Zap } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/settings", label: "Organisation", icon: Building2, exact: true },
  { href: "/settings/branding", label: "Branding & portal", icon: Palette },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/calendars", label: "Calendars & resources", icon: CalendarRange },
  { href: "/settings/automations", label: "Automations", icon: Zap },
  { href: "/settings/website-form", label: "Website enquiry form", icon: Code2 },
  { href: "/settings/integrations", label: "Integrations", icon: PlugZap },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2.5 text-[13px] lg:py-[7px] font-medium transition-colors",
              active ? "bg-white text-ink shadow-card ring-1 ring-line" : "text-ink-muted hover:bg-white/70 hover:text-ink"
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-brand-600" : "text-ink-faint")} strokeWidth={1.8} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
