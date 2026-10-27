"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { switchOrganisation } from "@/app/(app)/shell-actions";
import { cn } from "@/lib/cn";

export type OrgChip = { id: string; name: string; role: string; logo?: string | null; colour?: string | null; fresh?: boolean };

const initials = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** One business's mark: its logo, or its initials in its colour. */
export function OrgMark({ o, size = 32 }: { o: OrgChip; size?: number }) {
  const bg = o.colour && /^#[0-9a-f]{6}$/i.test(o.colour) ? o.colour : "#6d28d9";
  return o.logo && /^https:\/\//.test(o.logo)
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={o.logo} alt="" style={{ width: size, height: size }} className="rounded-lg bg-white object-contain p-0.5 ring-1 ring-line" />
    : <span style={{ width: size, height: size, background: bg }} className="grid place-items-center rounded-lg text-[0.6875rem] font-bold text-white">{initials(o.name)}</span>;
}

/** Every business you work in, one tap apart. A dot means something new there (unread notifications or new enquiries). */
export function BusinessRail({ orgs, currentOrgId }: { orgs: OrgChip[]; currentOrgId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2" aria-label="Your businesses">
      {orgs.map((o) => {
        const on = o.id === currentOrgId;
        return (
          <button key={o.id} type="button" title={`${o.name}${o.fresh && !on ? " — something new" : ""}`} aria-label={`Switch to ${o.name}`} aria-current={on ? "true" : undefined}
            disabled={pending || on} onClick={() => start(() => switchOrganisation(o.id))}
            className={cn("relative rounded-xl p-0.5 transition", on ? "ring-2 ring-brand-500" : "opacity-75 hover:opacity-100")}>
            <OrgMark o={o} />
            {o.fresh && !on && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-surface" aria-hidden />}
          </button>
        );
      })}
      {pending ? <Loader2 className="ml-1 h-4 w-4 animate-spin text-ink-faint" /> : (
        <Link href="/onboarding?new=1" title="Add another business" aria-label="Add another business" className="grid h-9 w-9 place-items-center rounded-xl border border-dashed border-line-strong text-ink-faint hover:text-ink"><Plus className="h-4 w-4" /></Link>
      )}
    </div>
  );
}
