import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireOrg, isSuperAdmin } from "@/lib/context";
import { canOpen, homeFor } from "@/lib/access";
import { SupportBanner } from "@/components/shell/support-banner";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileTabBar } from "@/components/shell/mobile-nav";
import { Topbar } from "@/components/shell/topbar";
import { PrefsSync } from "@/components/shell/personalise";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, profile, memberships, isSupportSession, current, role } = await requireOrg();
  const path = (await headers()).get("x-pathname") ?? "";
  if (path && !canOpen(role, path)) redirect(homeFor(role));
  const admin = await isSuperAdmin();

  const endOfToday = new Date(Date.now() + 86_400_000).toISOString();
  const [notif, unread, openEnquiries, dueTasks] = await Promise.all([
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
    // To-do badge: open tasks due by tomorrow (overdue included)
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).neq("status", "done").lte("due_at", endOfToday),
  ]);
  if (notif.error) throw new Error(`Could not load notifications: ${notif.error.message}`);

  return (
    <div className="min-h-screen">
      <PrefsSync saved={(profile as { ui_prefs?: unknown }).ui_prefs ?? null} />
      {isSupportSession && <SupportBanner orgId={org.id} orgName={org.name} expiresAt={current?.expires_at} />}
      <Sidebar orgName={org.name} counts={{ enquiries: openEnquiries.count ?? 0, todo: dueTasks.count ?? 0 }} isSuperAdmin={admin} role={role} />
      <div className="app-column lg:pl-[232px]">
        <Topbar
          role={role}
          user={{ name: profile.full_name ?? profile.email, email: profile.email }}
          orgs={memberships.map((m) => ({ id: m.organisation.id, name: m.organisation.name, role: m.role }))}
          currentOrgId={org.id}
          notifications={notif.data ?? []}
          unread={unread.count ?? 0}
        />
        <main className="mx-auto max-w-[var(--page-max)] px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <MobileTabBar
        role={role}
        enquiries={openEnquiries.count ?? 0}
        isSuperAdmin={admin}
        orgs={memberships.map((m) => ({ id: m.organisation.id, name: m.organisation.name, role: m.role }))}
        currentOrgId={org.id}
        user={{ name: profile.full_name ?? profile.email, email: profile.email }}
      />
    </div>
  );
}
