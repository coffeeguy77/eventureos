import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { googleSignInOn } from "@/lib/auth/google";
import { SecurityPanel } from "./panel";

export const metadata = { title: "Sign-in & security" };

export default async function MySecurityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: f } = await supabase.auth.mfa.listFactors();
  const on = (f?.totp ?? []).length > 0;
  const google = (user?.identities ?? []).find((i) => i.provider === "google");
  return (
    <div>
      <PageHeader title="Sign-in & security" subtitle="How you sign in to EventureOS." />
      <SecurityPanel
        email={user?.email ?? ""}
        twoStep={on}
        twoStepSince={f?.totp?.[0]?.created_at ?? null}
        googleOn={await googleSignInOn()}
        googleEmail={google ? String((google.identity_data as { email?: string } | undefined)?.email ?? user?.email ?? "") : null}
      />
    </div>
  );
}
