import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RosterTabs } from "../tabs";
import { NoticeBoard } from "./ui";

export const metadata = { title: "Staff notices" };
export const dynamic = "force-dynamic";

/** Post news to staff (everyone or chosen people) and see who has read it. */
export default async function NoticesPage() {
  const { supabase, org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const { data: notices, error } = await supabase.from("staff_notices").select("id, title, body, member_ids, needs_ok, pinned, expires_on, created_at")
    .eq("organisation_id", org.id).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100);
  if (error) return (<div><PageHeader title="Roster" /><RosterTabs active="notices" /><Card><EmptyState title="One database update to go">Run 0086_breaks_notices.sql in Supabase to switch on staff notices.</EmptyState></Card></div>);
  const list = (notices ?? []) as { id: string; title: string; body: string | null; member_ids: string[]; needs_ok: boolean; pinned: boolean; expires_on: string | null; created_at: string }[];
  const [{ data: people }, { data: reads }, { data: tw }] = await Promise.all([
    supabase.from("crew_members").select("id, name, on_roster, phone").eq("organisation_id", org.id).eq("active", true).order("on_roster", { ascending: false }).order("name"),
    list.length ? supabase.from("staff_notice_reads").select("notice_id, crew_member_id, read_at, confirmed_at").in("notice_id", list.map((n) => n.id)) : Promise.resolve({ data: [] }),
    supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "twilio").maybeSingle(),
  ]);
  return (
    <div>
      <PageHeader title="Roster" subtitle="Post news to the team — everyone, or chosen people. It shows in the staff app with a red dot until they've read it." />
      <RosterTabs active="notices" />
      <NoticeBoard notices={list} people={(people ?? []) as { id: string; name: string; on_roster: boolean; phone: string | null }[]}
        reads={(reads ?? []) as { notice_id: string; crew_member_id: string; read_at: string; confirmed_at: string | null }[]} tz={org.timezone} smsOn={tw?.status === "connected"} />
    </div>
  );
}
