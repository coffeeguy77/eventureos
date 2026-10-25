import { Briefcase, CalendarDays, Coffee, Flame, Gift, GraduationCap, Handshake, Info, Link2, MonitorPlay, PartyPopper, ShoppingBag, Store, Truck, type LucideIcon } from "lucide-react";
import type { MenuIcon } from "@/lib/site/menus";

/** The pictures beside menu items (top menu, phone menu, footer, and the menu editor). */
export const MENU_ICON: Record<MenuIcon, LucideIcon> = {
  events: PartyPopper, lessons: GraduationCap, academy: MonitorPlay, jobs: Briefcase, shop: Coffee, coffee: Coffee, cafe: Store, order: ShoppingBag,
  table: CalendarDays, club: Flame, roast: Flame, wholesale: Truck, gifts: Gift, franchise: Handshake, info: Info, link: Link2,
};
