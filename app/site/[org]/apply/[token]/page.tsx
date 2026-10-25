import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/site/site-frame";
import { FranchiseApplication } from "@/components/site/franchise-application";
import { applicationByToken } from "@/lib/franchise/server";
import { readQuestions } from "@/lib/franchise/core";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string; token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Franchise application", robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** The franchise application, from the link emailed by the business (private, not indexed). */
export default async function FranchiseApply(p: P) {
  const { org: slug, token } = await p.params;
  const x = await applicationByToken(slug, token);
  if (!x) notFound();
  const { org, app } = x;
  const closed = ["approved", "declined", "withdrawn"].includes(app.status);
  const first = app.name.split(/\s+/)[0];
  return (
    <SiteFrame org={org}>
      <div className="mx-auto max-w-[820px] px-5 py-12 sm:px-6 sm:py-16">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[var(--pk)]">{org.name} franchise</p>
        <h1 className="shop-serif mt-3 text-[2.5rem] font-semibold leading-[1.05] sm:text-[3.25rem]">Your application{first ? `, ${first}` : ""}</h1>
        {closed ? (
          <p className="mt-6 rounded-2xl bg-white p-6 text-[1.0625rem] ring-1 ring-[#EDE3DB]">This application has been {app.status === "approved" ? "approved — we'll be in touch about next steps" : "closed"}. If anything has changed, please contact {org.name}{org.contact_email ? <> at <a className="font-semibold text-[var(--pk)]" href={`mailto:${org.contact_email}`}>{org.contact_email}</a></> : null}.</p>
        ) : (
          <>
            <p className="mt-4 text-[1.125rem] leading-relaxed text-[#3A3431]">About 10 minutes. Tell us about you, where you&apos;d like to open and how you&apos;d fund it. There are no wrong answers — it just helps our first meeting go further.</p>
            <div className="mt-8"><FranchiseApplication slug={org.slug} token={token} business={org.name} initial={app.answers ?? {}} phone={app.phone ?? ""} again={app.status === "applied" || app.status === "reviewing"} questions={readQuestions(org.rawSettings)} /></div>
          </>
        )}
      </div>
    </SiteFrame>
  );
}
