import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { loadSignatureSetup, loadTeamPeople } from "@/lib/signatures/server";
import { MySignature } from "@/components/signatures/my-signature";

export const metadata = { title: "My email signature" };

export default async function MySignaturePage() {
  const { supabase, org, role, user } = await requireOrg();
  const [setup, [me]] = await Promise.all([loadSignatureSetup(supabase, org.id), loadTeamPeople(supabase, org.id, user.id)]);
  if (!me) throw new Error("Your team membership couldn't be found.");
  const admin = role === "owner" || role === "admin";
  const design = setup.published?.design ?? setup.draft;

  return (
    <div>
      <PageHeader title="My email signature" subtitle={`Your details in the ${org.name} signature. The design is shared by the whole team.`}
        actions={admin ? <ButtonLink href="/settings/signatures" size="sm">Edit company design</ButtonLink> : undefined} />
      <MySignature
        orgId={org.id} userId={user.id} design={design} published={Boolean(setup.published)} version={setup.published?.version ?? null}
        stored={me.stored} person={me.person} canEditLocked={admin}
        fallback={{ display_name: me.accountName, title: me.person.title && !me.stored?.title ? me.person.title : null, email: me.accountEmail }}
      />
    </div>
  );
}
