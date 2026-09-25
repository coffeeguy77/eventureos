import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Logo } from "@/components/shell/sidebar";
import { OnboardingForm } from "./form";

export const metadata = { title: "Set up your organisation" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { memberships, profile, supabase, portalOrgs } = await getContext();
  const sp = await searchParams;
  if (memberships.length === 0) {
    const { data: joined } = await supabase.rpc("accept_my_invitations");
    if (joined && joined > 0) redirect("/dashboard");
    if (portalOrgs.length && !sp.new) redirect(`/p/${portalOrgs[0].slug}`);
  }
  if (memberships.length > 0 && !sp.new) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[460px]">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo size={30} />
          <span className="text-[16px] font-semibold tracking-tight">EventureOS</span>
        </div>
        <div className="rounded-2xl border border-line bg-white p-8 shadow-card">
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
