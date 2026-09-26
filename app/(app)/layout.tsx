import { requireOrg, isSuperAdmin } from "@/lib/context";
import { SupportBanner } from "@/components/shell/support-banner";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileTabBar } from "@/components/shell/mobile-nav";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, profile, memberships, isSupportSession, current } = await requireOrg();
  const admin = await isSuperAdmin();

  const [notif, unread, openEnquiries] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, link, created_at, read_at, type")
      .eq("organisation_id", org.id)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", org.id)
      .is("read_at", null),
    supabase
      .from("enquiries")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", org.id)
      .in("status", ["new", "needs_review"]),
  ]);
  if (notif.error) throw new Error(`Could not load notifications: ${notif.error.message}`);

  return (
    <div className="min-h-screen">
      {isSupportSession && <SupportBanner orgId={org.id} orgName={org.name} expiresAt={current?.expires_at} />}
      <Sidebar orgName={org.name} counts={{ enquiries: openEnquiries.count ?? 0 }} isSuperAdmin={admin} />
      <div className="lg:pl-[232px]">
        <Topbar
          user={{ name: profile.full_name ?? profile.email, email: profile.email }}
          orgs={memberships.map((m) => ({ id: m.organisation.id, name: m.organisation.name, role: m.role }))}
          currentOrgId={org.id}
          notifications={notif.data ?? []}
          unread={unread.count ?? 0}
        />
        <main className="mx-auto max-w-[1360px] px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <MobileTabBar
        enquiries={openEnquiries.count ?? 0}
        isSuperAdmin={admin}
        orgs={memberships.map((m) => ({ id: m.organisation.id, name: m.organisation.name, role: m.role }))}
        currentOrgId={org.id}
        user={{ name: profile.full_name ?? profile.email, email: profile.email }}
      />
    </div>
  );
}
