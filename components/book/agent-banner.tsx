import Link from "next/link";
import { Building2 } from "lucide-react";
import type { Agent } from "@/lib/bookings/agents";

/** Shown on the booking pages while a case manager is booking job seekers. */
export function AgentBanner({ orgSlug, agent }: { orgSlug: string; agent: Agent }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[color-mix(in_srgb,var(--b)_35%,transparent)] bg-[color-mix(in_srgb,var(--b)_8%,white)] px-4 py-3 text-[0.875rem] text-ink">
      <Building2 className="h-5 w-5 shrink-0 text-[var(--b)]" />
      <span className="min-w-0 flex-1">Booking job seekers as <span className="font-semibold">{agent.cm.name}</span> · {agent.agency.name}</span>
      <Link href={`/book/${orgSlug}/agency`} className="font-semibold text-[var(--b)] hover:underline">{agent.scope === "portal" ? "My job seekers" : "Case manager page"}</Link>
    </div>
  );
}
