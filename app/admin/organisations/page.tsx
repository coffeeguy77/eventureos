import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { fmtDateTime, money, relative } from "@/lib/format";
import type { Tone } from "@/lib/status";
import { ActionForm, SubmitButton } from "@/app/(app)/settings/forms";
import { endSupportSession, openSupportSession, setOrganisationPlanStatus, startSupportSession } from "../actions";

export const metadata = { title: "Organisations" };

const TZ = "Australia/Sydney";
const PLAN_PRICE: Record<string, number> = { trial: 0, starter: 49, growth: 99, scale: 199 };
const PLAN_LABEL: Record<string, string> = { trial: "Trial", starter: "Starter", growth: "Growth", scale: "Scale" };
const STATUS_TONE: Record<string, Tone> = { active: "green", suspended: "amber", cancelled: "slate" };
const PROVIDER_LABEL: Record<string, string> = { gmail: "Gmail", google_calendar: "Calendar", xero: "Xero" };

type OrgRow = {
  id: string; name: string; slug: string; plan: string; status: string; created_at: string;
  owner_name: string | null; owner_email: string | null; users: number; events: number; storage_bytes: number;
  integrations: string[]; last_activity: string | null;
};

function bytes(n: number) {
  if (!n) return "0 MB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default async function AdminOrganisations({ searchParams }: { searchParams: Promise<{ manage?: string; q?: string }> }) {
  const { manage, q } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [orgsRes, sessionsRes] = await Promise.all([
    supabase.rpc("admin_organisations"),
    supabase
      .from("organisation_users")
      .select("organisation_id, expires_at")
      .eq("user_id", user?.id ?? "")
      .eq("title", "EventureOS Support")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString()),
  ]);
  if (orgsRes.error) throw new Error(`Could not load organisations: ${orgsRes.error.message}`);
  const sessions = new Map((sessionsRes.data ?? []).map((s) => [s.organisation_id as string, s.expires_at as string]));
  const term = (q ?? "").trim().toLowerCase();
  const orgs = ((orgsRes.data ?? []) as OrgRow[]).filter((o) =>
    !term || [o.name, o.slug, o.owner_name, o.owner_email].some((v) => v?.toLowerCase().includes(term)));

  return (
    <>
      <PageHeader
        title="Organisations"
        subtitle="Change plans, suspend accounts and open an audited support session."
        actions={
          <form className="flex gap-2">
            <Input name="q" defaultValue={q ?? ""} placeholder="Search business or owner" className="h-9 w-[240px] py-1.5" />
          </form>
        }
      />

      {sessions.size > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardHeader title="Your active support sessions" subtitle="Access ends automatically at the time shown. End it as soon as you're done." />
          <ul className="divide-y divide-amber-200 border-t border-amber-200">
            {[...sessions.entries()].map(([orgId, until]) => {
              const o = (orgsRes.data as OrgRow[]).find((x) => x.id === orgId);
              return (
                <li key={orgId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
                  <span><span className="font-medium text-ink">{o?.name ?? orgId}</span> <span className="text-ink-muted">· ends {relative(until)}</span></span>
                  <span className="flex gap-2">
                    <form action={openSupportSession.bind(null, orgId)}><button className={buttonClass("secondary", "sm")}>Open</button></form>
                    <form action={endSupportSession.bind(null, orgId)}><button className={buttonClass("danger", "sm")}>End session</button></form>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        {orgs.length === 0 ? (
          <EmptyState title={term ? `No organisations match “${q}”` : "No organisations yet"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-medium">Business</th>
                  <th className="px-3 py-2.5 font-medium">Owner</th>
                  <th className="px-3 py-2.5 font-medium">Plan</th>
                  <th className="px-3 py-2.5 text-right font-medium">Users</th>
                  <th className="px-3 py-2.5 text-right font-medium">Events</th>
                  <th className="px-3 py-2.5 text-right font-medium">Storage</th>
                  <th className="px-3 py-2.5 font-medium">Integrations</th>
                  <th className="px-3 py-2.5 font-medium">Subscription</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orgs.map((o) => {
                  const open = manage === o.id;
                  const inSession = sessions.has(o.id);
                  return [
                    <tr key={o.id} className={open ? "bg-brand-50/40" : undefined}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink">{o.name}</div>
                        <div className="text-[12px] text-ink-muted">/{o.slug} · since {fmtDateTime(o.created_at, TZ, "date")}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-ink">{o.owner_name ?? "—"}</div>
                        <div className="text-[12px] text-ink-muted">{o.owner_email ?? ""}</div>
                      </td>
                      <td className="px-3 py-3 text-ink">{PLAN_LABEL[o.plan] ?? o.plan}</td>
                      <td className="tabular px-3 py-3 text-right">{o.users}</td>
                      <td className="tabular px-3 py-3 text-right">{o.events}</td>
                      <td className="tabular px-3 py-3 text-right">{bytes(Number(o.storage_bytes))}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {o.integrations.length ? o.integrations.map((i) => <Badge key={i} tone="green">{PROVIDER_LABEL[i] ?? i}</Badge>)
                            : <span className="text-[12px] text-ink-faint">None connected</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="tabular text-ink">{o.status === "active" ? `${money(PLAN_PRICE[o.plan] ?? 0, "AUD", { cents: false })}/mo` : "—"}</div>
                        <div className="text-[12px] text-ink-muted">{o.last_activity ? `Active ${relative(o.last_activity)}` : "No activity"}</div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={STATUS_TONE[o.status] ?? "neutral"} dot>{o.status}</Badge>
                        {inSession && <div className="mt-1"><Badge tone="amber">Support session</Badge></div>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link href={open ? "/admin/organisations" : `/admin/organisations?manage=${o.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                          scroll={false} className={buttonClass(open ? "primary" : "secondary", "sm")}>
                          {open ? "Close" : "Manage"}
                        </Link>
                      </td>
                    </tr>,
                    open && (
                      <tr key={o.id + ":manage"} className="bg-brand-50/40">
                        <td colSpan={10} className="px-5 pb-5 pt-1">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-xl border border-line bg-white p-4">
                              <div className="text-[13px] font-semibold text-ink">Plan & status</div>
                              <p className="mt-0.5 text-[12px] text-ink-muted">Suspending blocks the portal and website form. Logged in the organisation’s audit trail.</p>
                              <ActionForm action={setOrganisationPlanStatus} className="mt-3">
                                <input type="hidden" name="org_id" value={o.id} />
                                <div className="flex flex-wrap items-end gap-3">
                                  <div>
                                    <Label htmlFor={`plan-${o.id}`}>Plan</Label>
                                    <Select id={`plan-${o.id}`} name="plan" defaultValue={o.plan} className="w-[150px]">
                                      {Object.entries(PLAN_LABEL).map(([k, l]) => <option key={k} value={k}>{l} ({money(PLAN_PRICE[k], "AUD", { cents: false })}/mo)</option>)}
                                    </Select>
                                  </div>
                                  <div>
                                    <Label htmlFor={`status-${o.id}`}>Status</Label>
                                    <Select id={`status-${o.id}`} name="status" defaultValue={o.status} className="w-[140px]">
                                      <option value="active">Active</option>
                                      <option value="suspended">Suspended</option>
                                      <option value="cancelled">Cancelled</option>
                                    </Select>
                                  </div>
                                  <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                                </div>
                              </ActionForm>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-white p-4">
                              <div className="text-[13px] font-semibold text-ink">Support session</div>
                              {inSession ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
                                  Active — ends {relative(sessions.get(o.id))}.
                                  <form action={openSupportSession.bind(null, o.id)}><button className={buttonClass("secondary", "sm")}>Open</button></form>
                                  <form action={endSupportSession.bind(null, o.id)}><button className={buttonClass("danger", "sm")}>End session</button></form>
                                </div>
                              ) : (
                                <>
                                  <p className="mt-0.5 text-[12px] text-ink-muted">
                                    You join {o.name} as a temporary admin. The reason and everything you do are recorded in their activity log, and access ends automatically.
                                  </p>
                                  <ActionForm action={startSupportSession} className="mt-3">
                                    <input type="hidden" name="org_id" value={o.id} />
                                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                                      <div>
                                        <Label htmlFor={`reason-${o.id}`}>Reason</Label>
                                        <Input id={`reason-${o.id}`} name="reason" required minLength={5} maxLength={500} placeholder="e.g. Ticket #1234 — Xero invoices not syncing" />
                                      </div>
                                      <div>
                                        <Label htmlFor={`minutes-${o.id}`}>Duration</Label>
                                        <Select id={`minutes-${o.id}`} name="minutes" defaultValue="60">
                                          <option value="15">15 min</option>
                                          <option value="30">30 min</option>
                                          <option value="60">1 hour</option>
                                          <option value="120">2 hours</option>
                                          <option value="240">4 hours</option>
                                        </Select>
                                      </div>
                                    </div>
                                    <div className="mt-3 flex justify-end">
                                      <SubmitButton pendingLabel="Starting…">Start support session</SubmitButton>
                                    </div>
                                  </ActionForm>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
