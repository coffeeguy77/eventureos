import { redirect } from "next/navigation";
import { crewOrg, crewSession } from "@/lib/crew/server";
import { CrewSignInForm } from "../ui";

export const metadata = { title: "Sign in" };

export default async function CrewLogin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (await crewSession(slug)) redirect(`/crew/${slug}`);
  const org = (await crewOrg(slug))!;
  return (
    <div className="flex min-h-[80dvh] flex-col justify-center" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mb-8 text-center">
        {org.logo_url && /^https:\/\//.test(org.logo_url)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={org.logo_url} alt={org.name} className="mx-auto h-14 max-w-[200px] object-contain" />
          : <p className="text-[1.375rem] font-bold text-ink">{org.name}</p>}
        <h1 className="mt-4 text-[1.25rem] font-semibold text-ink">Staff app</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">Your shifts, job details, job board and pay.</p>
      </div>
      <div className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <CrewSignInForm slug={slug} />
      </div>
      <p className="mt-6 text-center text-[0.75rem] text-ink-faint">Use the email the office has for you. No password needed.</p>
    </div>
  );
}
