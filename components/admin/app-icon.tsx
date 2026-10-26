import { BadgePercent, ChefHat, Coffee, GraduationCap, Handshake, MonitorSmartphone, Tent, Ticket, Truck, Wallet } from "lucide-react";
import type { AppIcon as Key } from "@/lib/apps";

const ICONS = { tent: Tent, ticket: Ticket, graduation: GraduationCap, coffee: Coffee, percent: BadgePercent, truck: Truck, chef: ChefHat, wallet: Wallet, monitor: MonitorSmartphone, handshake: Handshake };

export function AppIcon({ icon, className }: { icon: Key; className?: string }) {
  const I = ICONS[icon];
  return <I className={className} />;
}
