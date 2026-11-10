import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { MfaForm } from "./form";

export const metadata = { title: "Two-step sign-in" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") redirect(next);
  return (
    <>
      <h1 className="text-[1.25rem] font-semibold tracking-tight lg:text-[1.375rem]">Two-step sign-in</h1>
      <p className="mt-1 text-[0.8438rem] text-ink-muted lg:mt-1.5">Open your authenticator app and enter the 6-digit code for EventureOS.</p>
      <MfaForm next={next} />
    </>
  );
}
