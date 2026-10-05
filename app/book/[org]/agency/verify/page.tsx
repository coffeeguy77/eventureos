import { notFound } from "next/navigation";
import { publicOrg } from "@/lib/bookings/server";
import { BookShell } from "@/components/book/shell";
import { AgentSignIn } from "@/components/book/agent-tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

/** Where the emailed link lands: one tap to sign in (opening the link alone — e.g. by an email scanner — doesn't use it up). */
export default async function AgencyVerify({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string }> }) {
  const { org: slug } = await params;
  const org = await publicOrg(slug);
  if (!org) notFound();
  return (
    <BookShell org={org} embed={false}>
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">Case manager sign-in</h1>
        <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Tap the button to see your job seekers with {org.name}.</p>
        <AgentSignIn orgSlug={org.slug} token={(await searchParams).t ?? ""} />
      </div>
    </BookShell>
  );
}
