import { notFound } from "next/navigation";
import { jobsOrg } from "@/lib/jobs/server";
import { card } from "@/components/jobs/shell";
import { EmployerShell } from "@/components/jobs/employer-shell";
import { LinkSignIn } from "@/components/jobs/tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function EmployerVerify({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org) notFound();
  return (
    <EmployerShell org={org} width="max-w-[560px]" legacy>
      <div className={`mx-auto max-w-md text-center ${card}`}>
        <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">Sign in to {org.jobs.name}</h1>
        <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Tap the button to open your employer dashboard.</p>
        <LinkSignIn slug={slug} token={(await searchParams).t ?? ""} kind="employer" />
      </div>
    </EmployerShell>
  );
}
