import Link from "next/link";
import { PublicFooter } from "@/components/site/public-footer";
import { SectionNav } from "@/components/site/section-nav";
import type { JobsOrg } from "@/lib/jobs/server";
import { brandStyle, PAGE } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";

type Nav = { href: string; label: string; badge?: number }[];

/** The frame around every job board page, in the business's colours. */
export function JobsShell({ org, children, nav, side, wide = true }: { org: JobsOrg; children: React.ReactNode; nav?: Nav; side?: "barista" | "employer"; wide?: boolean }) {
  const base = `/jobs/${org.slug}`;
  return (
    <div style={brandStyle(org)} className="min-h-screen bg-canvas">
      <MasterNav org={org} active="jobs" />
      <SectionNav org={org} label="Job board" title={org.jobs.name} titleHref={side === "employer" ? `${base}/employers` : base}
        links={(nav ?? []).map((n) => ({ key: n.href, href: n.href, label: n.label, badge: n.badge }))} />
      <main className={`${PAGE} py-6 sm:py-10`}><div className={wide ? "" : "mx-auto max-w-4xl"}>{children}</div></main>
      <div className="relative z-10"><PublicFooter org={org} note={<>Phone numbers and emails stay private unless the barista chooses to share them.<br />Locations © <a href="https://www.openstreetmap.org/copyright" className="underline">OpenStreetMap</a> contributors</>} /></div>
    </div>
  );
}

export const baristaNav = (slug: string, unread = 0): Nav => [
  { href: `/jobs/${slug}/me`, label: "My profile" },
  { href: `/jobs/${slug}/work`, label: "Jobs & shifts" },
  { href: `/jobs/${slug}/messages`, label: "Messages", badge: unread },
];

export const employerNav = (slug: string, unread = 0): Nav => [
  { href: `/jobs/${slug}/employers`, label: "Dashboard" },
  { href: `/jobs/${slug}/employers/search`, label: "Find baristas" },
  { href: `/jobs/${slug}/employers/post`, label: "Post a job" },
  { href: `/jobs/${slug}/employers/messages`, label: "Messages", badge: unread },
];

export { card, inputCls, btnCls, btn2Cls } from "./styles";
