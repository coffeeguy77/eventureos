import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Tabs } from "@/components/ui/tabs";
import { loadSignatureSetup, loadTeamPeople } from "@/lib/signatures/server";
import { SignatureStudio } from "@/components/signatures/studio";
import { SignaturePeople } from "@/components/signatures/people";
import { missingFields } from "@/lib/signatures/render";

export const metadata = { title: "Email signatures" };

export default async function SignaturesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, org, role, user } = await requireOrg();
  if (role !== "owner" && role !== "admin") redirect("/my-signature");
  const tab = (await searchParams).tab === "people" ? "people" : "design";

  const [setup, people, { data: vRows, error: vErr }] = await Promise.all([
    loadSignatureSetup(supabase, org.id),
    loadTeamPeople(supabase, org.id),
    supabase.from("email_signature_versions").select("version, note, published_at, publisher:users!email_signature_versions_published_by_fkey(full_name, email)")
      .eq("organisation_id", org.id).order("version", { ascending: false }).limit(30),
  ]);
  if (vErr) throw new Error(`Couldn't load signature versions: ${vErr.message}`);
  const versions = ((vRows ?? []) as any[]).map((v) => ({ version: v.version as number, note: v.note as string | null, publishedAt: v.published_at as string, by: (v.publisher?.full_name ?? v.publisher?.email ?? null) as string | null }));
  const current = setup.published?.design ?? setup.draft;
  const missing = people.filter((p) => missingFields(current, p.person).length).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[1.0625rem] font-semibold text-ink">Email signatures</h2>
        <p className="mt-0.5 max-w-2xl text-[0.8125rem] text-ink-muted">
          One company signature for everyone. You design it once; each person&apos;s name, title and numbers fill in automatically.
          It&apos;s added to every reply sent from EventureOS, and anyone can copy theirs into Gmail.
        </p>
      </div>
      <Tabs baseHref="/settings/signatures" active={tab} tabs={[{ key: "design", label: "Design" }, { key: "people", label: "People", count: missing }]} />
      {tab === "design" ? (
        <SignatureStudio
          initial={setup.draft} saved={setup.saved} branding={setup.branding}
          published={setup.published?.design ?? null} publishedVersion={setup.published?.version ?? null}
          people={people.map((p) => ({ userId: p.userId, name: p.person.display_name ?? p.accountEmail, person: p.person }))}
          meId={user.id} versions={versions}
        />
      ) : (
        <>
          {!setup.published && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-200">The signature hasn&apos;t been published yet — these previews show your draft, and replies won&apos;t include a signature until you publish it.</p>}
          <SignaturePeople rows={people} design={current} orgId={org.id} version={setup.published?.version ?? null} />
        </>
      )}
    </div>
  );
}
