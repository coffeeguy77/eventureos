import Link from "next/link";
import { cn } from "@/lib/cn";

export function RosterTabs({ active }: { active: "week" | "timesheets" | "sales" | "notices" | "setup" }) {
  const tabs = [["week", "Roster", "/roster"], ["timesheets", "Timesheets", "/roster/timesheets"], ["sales", "Wages %", "/roster/sales"], ["notices", "Notices", "/roster/notices"], ["setup", "Setup", "/roster/setup"]] as const;
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-0.5 text-[0.7812rem] font-medium sm:inline-flex">
      {tabs.map(([k, label, href]) => (
        <Link key={k} href={href} className={cn("whitespace-nowrap rounded-md px-3 py-1.5", active === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>{label}</Link>
      ))}
    </div>
  );
}
