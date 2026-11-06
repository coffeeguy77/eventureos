import Link from "next/link";
import { createServiceClient } from "@/lib/integrations/runtime";
import { readClubSettings } from "@/lib/club/server";
import { ClubToggle } from "./office";

/** On a client's page: put them on Cart Club (their own booking page), or see / switch off the one they have. */
export async function ClubOnClient({ orgId, orgSettings, customerId }: { orgId: string; orgSettings: unknown; customerId: string }) {
  const { data, error } = await createServiceClient().from("cart_club_accounts").select("id, slug, enabled").eq("organisation_id", orgId).eq("customer_id", customerId).maybeSingle();
  if (error) return null; // before the 0101 update
  const name = readClubSettings(orgSettings).name;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.75rem]">
      {data ? (
        <>
          <Link href={`/cart-club/${data.id}`} className={data.enabled ? "font-medium text-brand-700 hover:underline" : "text-ink-faint hover:underline"}>{name}: /{data.slug as string}{data.enabled ? "" : " (off)"}</Link>
          <ClubToggle id={data.id as string} enabled={data.enabled as boolean} customerId={customerId} compact />
        </>
      ) : <ClubToggle id={null} enabled={false} customerId={customerId} />}
    </div>
  );
}
