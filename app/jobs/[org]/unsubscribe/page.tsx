import { notFound } from "next/navigation";
import { jobsOrg } from "@/lib/jobs/server";
import { card, JobsShell } from "@/components/jobs/shell";
import { UnsubscribeButton } from "@/components/jobs/tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function JobsUnsubscribe({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ i?: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org) notFound();
  return (
    <JobsShell org={org} wide={false}>
      <div className={`mx-auto max-w-md text-center ${card}`}>
        <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">Unsubscribe</h1>
        <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Stop emails about {org.jobs.name}? Your bookings and certificates aren&apos;t affected.</p>
        <UnsubscribeButton slug={slug} token={(await searchParams).i ?? ""} />
      </div>
    </JobsShell>
  );
}
