import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { Card, CardHeader, Field } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { ClientApps, ResendWelcome } from "@/components/admin/client-apps";
import { planApps } from "@/lib/apps-plans";
import { PLAN_NAMES, readAppAccess, type PlanKey } from "@/lib/apps";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Client" };
export const dynamic = "force-dynamic";

export default async function AdminClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: o, error } = await supabase.from("organisations").select("id, name, slug, plan, status, business_type, timezone, created_at, app_access").eq("id", id).maybeSingle();
  if (error && /app_access/.test(error.message)) return <p className="rounded-lg bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900">Run <span className="font-mono">supabase/migrations/0068_client_accounts.sql</span> in Supabase first.</p>;
  if (!o) notFound();
  const { plans } = await planApps(supabase);
  const db = createServiceClient();
  const [{ data: invites }, { data: members }] = await Promise.all([
    db.from("organisation_invitations").select("email, role, created_at, accepted_at, last_sent_at, send_count").eq("organisation_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("organisation_users").select("role, title, user:users(full_name, email)").eq("organisation_id", id).eq("status", "active").neq("role", "customer").limit(50),
  ]);
  const access = readAppAccess(o.app_access);
  const pendingOwner = ((invites ?? []) as { email: string; role: string; accepted_at: string | null; last_sent_at: string | null; send_count: number }[]).find((i) => i.role === "owner" && !i.accepted_at);
  const team = ((members ?? []) as unknown as { role: string; title: string | null; user: { full_name: string | null; email: string } | null }[]).filter((m) => m.title !== "EventureOS Support");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={<Link href="/admin/organisations" className="hover:underline">Organisations</Link>} title={o.name}
        actions={<Link href={`/admin/organisations?manage=${o.id}`} className={buttonClass("secondary", "sm")}>Plan, status &amp; support session</Link>} />
      <div className="grid gap-5">
        <Card>
          <dl className="grid gap-5 px-5 py-5 sm:grid-cols-4">
            <Field label="Plan">{PLAN_NAMES[o.plan as PlanKey] ?? o.plan}</Field>
            <Field label="Status"><span className="capitalize">{o.status}</span></Field>
            <Field label="Portal"><span className="font-mono text-[0.7812rem]">/p/{o.slug}</span></Field>
            <Field label="Since">{fmtDateTime(o.created_at, o.timezone, "date")}</Field>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Team" subtitle={pendingOwner ? `Waiting for ${pendingOwner.email} to sign up as owner.` : "Who can sign in to this business."} action={pendingOwner ? <ResendWelcome orgId={o.id} sent={pendingOwner.send_count} /> : null} />
          <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
            {team.map((m, i) => <li key={i} className="flex justify-between gap-3 px-5 py-2.5"><span className="text-ink">{m.user?.full_name ?? m.user?.email}<span className="ml-2 text-ink-faint">{m.user?.full_name ? m.user.email : ""}</span></span><span className="capitalize text-ink-muted">{m.role}</span></li>)}
            {((invites ?? []) as { email: string; role: string; accepted_at: string | null; last_sent_at: string | null }[]).filter((i) => !i.accepted_at).map((i) => (
              <li key={i.email + i.role} className="flex justify-between gap-3 px-5 py-2.5"><span className="text-ink-muted">{i.email} <span className="text-ink-faint">· invited{i.last_sent_at ? `, emailed ${fmtDateTime(i.last_sent_at, o.timezone, "date")}` : ", not emailed yet"}</span></span><span className="capitalize text-ink-muted">{i.role}</span></li>
            ))}
            {!team.length && !(invites ?? []).length && <li className="px-5 py-3 text-ink-faint">Nobody yet.</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <p className="text-[0.8438rem] font-semibold text-ink">Apps</p>
          <p className="mb-3 mt-0.5 text-[0.75rem] text-ink-muted">What this business sees. Apps you untick disappear from their menu and their pages are locked. Their data is kept.</p>
          <ClientApps orgId={o.id} access={access ? [...access] : null} planApps={plans[o.plan as PlanKey] ?? plans.trial} />
        </Card>
      </div>
    </div>
  );
}
