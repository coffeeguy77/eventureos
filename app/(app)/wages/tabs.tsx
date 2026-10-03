import Link from "next/link";
import { cn } from "@/lib/cn";

export function WageTabs({ active }: { active: "owed" | "shifts" | "past" }) {
  const tabs = [["owed", "Owed & paid", "/wages"], ["shifts", "Shifts & regular shifts", "/wages/shifts"], ["past", "Past jobs — who worked", "/wages/past"]] as const;
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-0.5 text-[0.7812rem] font-medium sm:inline-flex">
      {tabs.map(([k, label, href]) => (
        <Link key={k} href={href} className={cn("whitespace-nowrap rounded-md px-3 py-1.5", active === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>{label}</Link>
      ))}
    </div>
  );
}
