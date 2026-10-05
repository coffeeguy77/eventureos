import { notFound } from "next/navigation";
import { publicOrg } from "@/lib/bookings/server";
import { BookShell } from "@/components/book/shell";
import { SignInButton } from "@/components/book/account-tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

/** The page the emailed link opens: one tap to sign in (opening the link alone doesn't use it up). */
export default async function VerifyPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string }> }) {
  const { org: slug } = await params;
  const t = (await searchParams).t ?? "";
  const org = await publicOrg(slug);
  if (!org) notFound();
  return (
    <BookShell org={org} embed={false}>
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">Sign in to {org.name}</h1>
        <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">See your bookings and download your certificates.</p>
        <SignInButton orgSlug={org.slug} token={t} />
      </div>
    </BookShell>
  );
}
