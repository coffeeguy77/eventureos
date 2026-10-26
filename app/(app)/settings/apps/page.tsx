import { requireOrg } from "@/lib/context";
import { orgAppAccess } from "@/lib/apps-server";
import { APPS, CORE, appAllowed, isAppKey } from "@/lib/apps";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppIcon } from "@/components/admin/app-icon";
import { RequestApp } from "./request";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import Link from "next/link";

export const metadata = { title: "Apps" };

/** What this business has switched on, and what else EventureOS can do for it. */
export default async function AppsPage({ searchParams }: { searchParams: Promise<{ locked?: string }> }) {
  const sp = await searchParams;
  const { org, role } = await requireOrg();
  const access = await orgAppAccess(org.id);
  const locked = isAppKey(sp.locked) ? APPS.find((a) => a.key === sp.locked) : undefined;
  const canAsk = role === "owner" || role === "admin";
  const sorted = [...APPS].sort((a, b) => Number(appAllowed(access, b.key)) - Number(appAllowed(access, a.key)));
  return (
    <div className="space-y-5">
      {locked && <p className="rounded-lg bg-amber-50 px-4 py-3 text-[0.8438rem] text-amber-900"><strong>{locked.name}</strong> isn&apos;t switched on for {org.name}. {canAsk ? "Ask us to add it below." : "Ask an owner or admin to request it."}</p>}
      <Card className="p-5">
        <p className="text-[0.8438rem] font-semibold text-ink">Always included</p>
        <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {CORE.map((c) => <p key={c.name} className="flex gap-2 text-[0.8125rem]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span><span className="font-medium text-ink">{c.name}</span> <span className="text-ink-muted">· {c.text}</span></span></p>)}
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((a) => {
          const on = appAllowed(access, a.key);
          return (
            <Card key={a.key} id={a.key} className={cn("flex flex-col p-5", locked?.key === a.key && "ring-2 ring-amber-300")}>
              <div className="flex items-start gap-3">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", on ? "bg-brand-500 text-on-brand" : "bg-zinc-100 text-ink-muted")}><AppIcon icon={a.icon} className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold text-ink">{a.name}{on ? <Badge tone="green" dot>On</Badge> : <Badge tone="slate">Not in your plan</Badge>}</p>
                  <p className="text-[0.8125rem] text-ink-muted">{a.tagline}</p>
                </div>
              </div>
              <ul className="mt-3 flex-1 space-y-1 text-[0.8125rem] text-ink-muted">{a.features.slice(0, 4).map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />{f}</li>)}</ul>
              <div className="mt-4">
                {on ? <Link href={a.paths[0]} className="text-[0.8125rem] font-medium text-brand-700 hover:underline">Open {a.name} →</Link>
                  : canAsk ? <RequestApp app={a.key} name={a.name} /> : <p className="text-[0.75rem] text-ink-faint">Ask an owner or admin to request it.</p>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
