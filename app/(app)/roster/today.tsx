"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export interface TodayRow { name: string; shift: string | null; start: string | null; state: "late" | "due" | "on" | "break" | "done" | "unrostered"; since: string | null; breakSince: string | null }

/** Who's working right now: on, on a break (with the timer), late, or finished. Refreshes itself every minute. */
export function WhosOn({ rows, breakMin, breakMax }: { rows: TodayRow[]; breakMin: number; breakMax: number }) {
  const router = useRouter();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => { tick((x) => x + 1); router.refresh(); }, 60_000); return () => clearInterval(t); }, [router]);
  if (!rows.length) return null;
  const mins = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000)) : 0);
  const t = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : "");
  return (
    <Card>
      <CardHeader title="Today" subtitle="Who's on now, on a break, late or done." />
      <ul className="grid gap-2 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, i) => {
          const b = mins(r.breakSince);
          return (
            <li key={i} className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2 ring-1 ring-line">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-semibold text-ink">{r.name}</span>
                <span className="block text-[0.7188rem] text-ink-muted">{r.shift ?? "Not rostered"}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.7188rem] font-semibold",
                r.state === "on" && "bg-emerald-100 text-emerald-800",
                r.state === "break" && (b >= breakMax ? "bg-rose-100 text-rose-800" : b >= breakMin ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"),
                r.state === "late" && "bg-rose-100 text-rose-800",
                r.state === "unrostered" && "bg-sky-100 text-sky-800",
                (r.state === "due" || r.state === "done") && "bg-zinc-100 text-ink-muted")}>
                {r.state === "on" ? `On since ${t(r.since)}` : r.state === "break" ? `Break · ${b} min` : r.state === "late" ? `Late · ${mins(r.start)} min` : r.state === "done" ? "Done" : r.state === "unrostered" ? `On since ${t(r.since)} · not rostered` : "Later today"}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
