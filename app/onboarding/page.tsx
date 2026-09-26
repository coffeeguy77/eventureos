import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Wordmark } from "@/components/shell/sidebar";
import { OnboardingForm } from "./form";

export const metadata = { title: "Set up your organisation" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { memberships, profile, supabase, portalOrgs, suspended } = await getContext();
  const sp = await searchParams;
  if (memberships.length === 0 && suspended && !sp.new) redirect("/suspended");
  if (memberships.length === 0) {
    const { data: joined } = await supabase.rpc("accept_my_invitations");
    if (joined && joined > 0) redirect("/dashboard");
    if (portalOrgs.length && !sp.new) redirect(`/p/${portalOrgs[0].slug}`);
  }
  if (memberships.length > 0 && !sp.new) redirect("/dashboard");

  return (
    <div className="pt-safe pb-safe flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
      <div className="w-full max-w-[460px]">
        <div className="mb-8">
          <Wordmark height={30} />
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8">
          <h1 className="text-[20px] font-semibold tracking-tight">
            {memberships.length ? "Create another organisation" : `Welcome${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">
            Tell us about your event business. You’ll be its owner and can invite your team later.
          </p>
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
