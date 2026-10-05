import { notFound } from "next/navigation";
import { jobsOrg } from "@/lib/jobs/server";
import { card, JobsShell } from "@/components/jobs/shell";
import { LinkSignIn } from "@/components/jobs/tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your profile", robots: { index: false, follow: false } };

/** Where the welcome letter's button lands: one tap to start (the link alone doesn't sign anyone in). */
export default async function JobsJoin({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ i?: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org) notFound();
  return (
    <JobsShell org={org} wide={false}>
      <div className={`mx-auto max-w-md text-center ${card}`}>
        <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">Welcome to {org.jobs.name}</h1>
        <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Your profile stays switched off until you&apos;re ready, and your phone and email are never shown unless you choose.</p>
        <LinkSignIn slug={slug} token={(await searchParams).i ?? ""} kind="join" label="Set up my profile" />
      </div>
    </JobsShell>
  );
}
