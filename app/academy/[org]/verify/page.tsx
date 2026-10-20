import { notFound } from "next/navigation";
import { learnOrg } from "@/lib/learn/server";
import { AcademyShell, card } from "@/components/academy/shell";
import { LearnSignIn } from "@/components/academy/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

/** The page the emailed link opens: one tap to sign in (opening the link alone doesn't use it up). */
export default async function Verify({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string }> }) {
  const org = await learnOrg((await params).org);
  if (!org) notFound();
  const t = (await searchParams).t ?? "";
  return (
    <AcademyShell org={org} tab="home" signedIn={false}>
      <div className={`${card} mx-auto max-w-md text-center`}>
        <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">Sign in to {org.learn.name}</h1>
        <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Tap to sign in on this device.</p>
        <LearnSignIn slug={org.slug} token={t} />
      </div>
    </AcademyShell>
  );
}
