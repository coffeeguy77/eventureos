import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { money } from "@/lib/format";
import { MK_ACCOUNT_COLUMNS, type MkAccount } from "@/lib/marketing/sync";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignForm } from "@/components/marketing/campaign-form";

export const dynamic = "force-dynamic";

// Canberra (City) — the centre of the radius; change the radius for "and region"
const CANBERRA = { lat: -35.2809, lng: 149.13, label: "Canberra" };

export default async function NewCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data } = await supabase.from("mk_accounts").select(MK_ACCOUNT_COLUMNS).eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!data) notFound();
  const a = data as MkAccount;
  const cur = a.ads_currency ?? org.currency;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={<><Link href="/marketing" className="hover:text-ink">Marketing</Link> / <Link href={`/marketing/${id}`} className="hover:text-ink">{a.name}</Link></>}
        title="New search campaign" subtitle="Created paused in Google Ads — nothing is spent until you switch it on there." />
      <Card>
        <CardHeader title="Campaign" />
        <CampaignForm id={id} capNote={a.monthly_cap ? `cap ${money(a.monthly_cap, cur, { cents: false })}/month` : "no cap set"}
          defaults={{ name: `${a.name} | Search`, url: "", daily: a.monthly_cap ? Math.floor(Number(a.monthly_cap) / 30.4) : 10, centre: CANBERRA }} />
      </Card>
    </div>
  );
}
