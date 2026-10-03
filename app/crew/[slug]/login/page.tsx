import { redirect } from "next/navigation";
import { crewOrg, crewSession } from "@/lib/crew/server";
import { createClient } from "@/lib/supabase/server";
import { CrewSignInForm } from "../ui";

export const metadata = { title: "Sign in" };

export default async function CrewLogin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (await crewSession(slug)) redirect(`/crew/${slug}`);
  const org = (await crewOrg(slug))!;
  // Someone already signed in here (e.g. the owner testing) — signing in as a staff member would switch this browser's login
  const { data: { user } } = await (await createClient()).auth.getUser();
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
      {user?.email && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900 ring-1 ring-amber-200">
          This browser is signed in to the office app as <b>{user.email}</b>. Signing in here as a staff member switches this browser to their login and signs you out of the office app. To test the staff app, use a private / incognito window or another phone.
        </p>
      )}
      <div className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <CrewSignInForm slug={slug} />
      </div>
      <p className="mt-6 text-center text-[0.75rem] text-ink-faint">Use the email the office has for you. No password needed.</p>
    </div>
  );
}
