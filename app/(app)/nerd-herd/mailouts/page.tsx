import { canManage, requireOrg } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";
import { AUDIENCE_LABEL, CARE_HUB_EMAIL, type Audience } from "@/lib/nerdherd/mailout";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MailoutEditor, MailoutControls } from "@/components/nerdherd/mailout-tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mail-outs" };

type M = { id: string; subject: string; body: string; audience: Audience; status: "draft" | "sending" | "paused" | "done"; total: number; sent: number; failed: number; created_at: string; started_at: string | null; finished_at: string | null };

/** Nerd Herd → Mail-outs: one email to many clients (e.g. the Care Hub launch to everyone from RepairShopr). */
export default async function Mailouts({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { supabase, org, role, user } = await requireOrg();
  const manage = canManage(role);
  const { edit } = await searchParams;
  const { data, error } = await supabase.from("nh_mailouts").select("id, subject, body, audience, status, total, sent, failed, created_at, started_at, finished_at").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(50);
  if (error) return <Card><EmptyState title="Run the Mail-outs update first">Open Supabase → SQL editor and run supabase/migrations/0116_mailouts.sql.</EmptyState></Card>;
  const list = (data ?? []) as M[];
  const draft = list.find((m) => m.id === edit && m.status === "draft") ?? (edit === "new" ? null : list.find((m) => m.status === "draft") ?? null);
  const fresh = !list.length || edit === "new";
  const tone = { draft: "neutral", sending: "brand", paused: "amber", done: "green" } as const;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader title={draft ? "Edit mail-out" : "New mail-out"} subtitle="Write it once. {first_name} becomes each person's first name (or “there”). Every email gets an unsubscribe link and your business details, as Australian law requires." />
        <div className="border-t border-line px-5 py-4">
          {manage
            ? <MailoutEditor key={draft?.id ?? "new"} id={draft?.id ?? null} initial={draft ? { subject: draft.subject, body: draft.body, audience: draft.audience } : { ...CARE_HUB_EMAIL, audience: "repairshopr" }} me={user.email ?? ""} starter={fresh || !draft} />
            : <p className="text-[0.8125rem] text-ink-muted">Only owners, admins and managers can send mail-outs.</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Mail-outs" subtitle="Sent in batches every 5 minutes." />
        {list.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {list.map((m) => {
              const done = m.sent + m.failed;
              const pct = m.total ? Math.round((done / m.total) * 100) : 0;
              return (
                <li key={m.id} className="space-y-2 px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-[0.8438rem] font-medium text-ink">{m.subject}</p>
                    <Badge tone={tone[m.status]}>{m.status === "done" ? "Sent" : m.status === "sending" ? "Sending" : m.status === "paused" ? "Paused" : "Draft"}</Badge>
                  </div>
                  <p className="text-[0.75rem] text-ink-muted">{AUDIENCE_LABEL[m.audience]}{m.started_at ? ` · started ${fmtDateTime(m.started_at, org.timezone)}` : ` · saved ${fmtDateTime(m.created_at, org.timezone)}`}</p>
                  {m.status !== "draft" && (
                    <>
                      <div className="h-1.5 overflow-hidden rounded-full bg-canvas ring-1 ring-line"><div className="h-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                      <p className="text-[0.75rem] text-ink-muted">{m.sent} of {m.total} sent{m.failed ? ` · ${m.failed} couldn't be delivered` : ""}{m.finished_at ? ` · finished ${fmtDateTime(m.finished_at, org.timezone)}` : ""}</p>
                    </>
                  )}
                  {manage && <MailoutControls id={m.id} status={m.status} />}
                </li>
              );
            })}
          </ul>
        ) : <EmptyState title="No mail-outs yet">The Care Hub email is ready to go on the left.</EmptyState>}
      </Card>
    </div>
  );
}
