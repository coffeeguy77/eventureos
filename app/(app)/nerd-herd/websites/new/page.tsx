import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { WebsiteForm } from "@/components/nerdherd/website-form";
import { allPages } from "@/lib/supabase/all-pages";

export const dynamic = "force-dynamic";

export default async function NewWebsitePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const [{ data: clients }, { data: hosting }] = await Promise.all([
    allPages((a, b) => supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").order("id").range(a, b)),
    supabase.from("hosting_accounts").select("id, domain").eq("organisation_id", org.id).order("domain").limit(5000),
  ]);
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Add a website" subtitle="Any site you look after — hosted with you or not." />
      <div className="border-t border-line px-5 py-4">
        <WebsiteForm id={null} initial={{ domain: "", customer_id: sp.client ?? null, platform: "wordpress", status: "live" }}
          clients={(clients ?? []) as { id: string; name: string }[]} hosting={(hosting ?? []) as { id: string; domain: string }[]} />
      </div>
    </Card>
  );
}
