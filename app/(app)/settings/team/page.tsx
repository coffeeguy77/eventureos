import { Check, Minus } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input, Label, Select } from "@/components/ui/form";
import { fmtDateTime, relative } from "@/lib/format";
import type { OrgRole } from "@/lib/types";
import { ActionButton, ActionForm, SubmitButton } from "../forms";
import { changeMemberRole, inviteMember, removeMember, revokeInvitation } from "../actions";
import { PERMISSIONS, ROLE_HINT, ROLE_LABEL } from "../constants";

export const metadata = { title: "Team" };

type StaffRole = keyof typeof ROLE_LABEL;
type Row = {
  id: string; user_id: string; role: OrgRole; title: string | null; created_at: string; expires_at: string | null;
  user: { full_name: string | null; email: string } | null;
};

export default async function TeamPage() {
  const { supabase, org, role, user } = await requireOrg();
  const canAdmin = role === "owner" || role === "admin";

  const [membersRes, invitesRes] = await Promise.all([
    supabase
      .from("organisation_users")
      .select("id, user_id, role, title, created_at, expires_at, user:users!organisation_users_user_id_fkey(full_name, email)")
      .eq("organisation_id", org.id)
      .eq("status", "active")
      .neq("role", "customer")
      .order("created_at"),
    canAdmin
      ? supabase
          .from("organisation_invitations")
          .select("id, email, role, created_at, inviter:users!organisation_invitations_invited_by_fkey(full_name, email)")
          .eq("organisation_id", org.id)
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (membersRes.error) throw new Error(`Could not load team: ${membersRes.error.message}`);
  if (invitesRes.error) throw new Error(`Could not load invitations: ${invitesRes.error.message}`);

  const now = Date.now();
  const all = (membersRes.data ?? []) as unknown as Row[];
  const members = all.filter((m) => !m.expires_at);
  const support = all.filter((m) => m.expires_at && Date.parse(m.expires_at) > now);
  const invites = (invitesRes.data ?? []) as unknown as {
    id: string; email: string; role: StaffRole; created_at: string; inviter: { full_name: string | null; email: string } | null;
  }[];
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const roleOrder: StaffRole[] = ["owner", "admin", "manager", "staff"];

  return (
    <>
      <Card>
        <CardHeader
          title="Team"
          subtitle={`${members.length} ${members.length === 1 ? "person" : "people"} can sign in to ${org.name}.`}
        />
        {!canAdmin && (
          <p className="mx-5 mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] text-ink-muted ring-1 ring-inset ring-line">
            Only owners and admins can invite people or change roles.
          </p>
        )}
        <ul className="divide-y divide-line border-t border-line md:hidden">
          {members.map((m) => {
            const name = m.user?.full_name ?? m.user?.email ?? "Team member";
            const isMe = m.user_id === user.id;
            const lastOwner = m.role === "owner" && ownerCount <= 1;
            const lockReason = !canAdmin ? null
              : isMe && m.role === "owner" ? "You can't change your own owner role"
              : m.role === "owner" && role !== "owner" ? "Only owners can change an owner"
              : lastOwner ? "The last owner can't be demoted"
              : null;
            const editable = canAdmin && !lockReason;
            const options = roleOrder.filter((r) => r !== "owner" || role === "owner");
            return (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">{name}{isMe && <span className="ml-1.5 text-[11.5px] font-normal text-ink-faint">(you)</span>}</div>
                    <div className="truncate text-[12.5px] text-ink-muted">{m.user?.email}</div>
                    <div className="truncate text-[12px] text-ink-faint">{m.title ? `${m.title} · ` : ""}Joined {fmtDateTime(m.created_at, org.timezone, "date")}</div>
                  </div>
                  {!editable && (
                    <span title={lockReason ?? undefined} className="shrink-0">
                      <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[m.role as StaffRole] ?? m.role}</Badge>
                    </span>
                  )}
                </div>
                {(editable || (canAdmin && !isMe && m.role !== "owner")) && (
                  <div className="mt-2.5 flex items-start gap-2 pl-[44px]">
                    {editable && (
                      <ActionForm action={changeMemberRole} showOk={false} className="min-w-0 flex-1">
                        <input type="hidden" name="member_id" value={m.id} />
                        <div className="flex items-center gap-1.5">
                          <Select name="role" defaultValue={m.role} aria-label={`Role for ${name}`} className="h-10 min-w-0 flex-1 py-1 text-[12.5px]">
                            {options.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </Select>
                          <SubmitButton size="sm" variant="secondary" pendingLabel="…" className="h-10">Save</SubmitButton>
                        </div>
                      </ActionForm>
                    )}
                    {canAdmin && !isMe && m.role !== "owner" && (
                      <ActionButton
                        action={removeMember.bind(null, m.id)}
                        variant="ghost"
                        className="h-10"
                        confirm={`Remove ${name} from ${org.name}? They'll lose access immediately.`}
                      >
                        Remove
                      </ActionButton>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto border-t border-line md:block">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Title</th>
                <th className="px-3 py-2.5 font-medium">Joined</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {members.map((m) => {
                const name = m.user?.full_name ?? m.user?.email ?? "Team member";
                const isMe = m.user_id === user.id;
                const lastOwner = m.role === "owner" && ownerCount <= 1;
                // Who may change this person's role?
                const lockReason = !canAdmin ? null
                  : isMe && m.role === "owner" ? "You can't change your own owner role"
                  : m.role === "owner" && role !== "owner" ? "Only owners can change an owner"
                  : lastOwner ? "The last owner can't be demoted"
                  : null;
                const editable = canAdmin && !lockReason;
                const options = roleOrder.filter((r) => r !== "owner" || role === "owner");
                return (
                  <tr key={m.id} className="align-middle">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={name} size={30} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">{name}{isMe && <span className="ml-1.5 text-[11.5px] font-normal text-ink-faint">(you)</span>}</div>
                          <div className="truncate text-[12px] text-ink-muted">{m.user?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {editable ? (
                        <ActionForm action={changeMemberRole} showOk={false}>
                          <input type="hidden" name="member_id" value={m.id} />
                          <div className="flex items-center gap-1.5">
                            <Select name="role" defaultValue={m.role} aria-label={`Role for ${name}`} className="h-8 w-[118px] py-1 text-[12.5px]">
                              {options.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                            </Select>
                            <SubmitButton size="sm" variant="secondary" pendingLabel="…">Save</SubmitButton>
                          </div>
                        </ActionForm>
                      ) : (
                        <span title={lockReason ?? undefined}>
                          <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[m.role as StaffRole] ?? m.role}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink-muted">{m.title ?? "—"}</td>
                    <td className="px-3 py-3 text-ink-muted" title={fmtDateTime(m.created_at, org.timezone)}>{fmtDateTime(m.created_at, org.timezone, "date")}</td>
                    <td className="px-5 py-3 text-right">
                      {canAdmin && !isMe && m.role !== "owner" && (
                        <ActionButton
                          action={removeMember.bind(null, m.id)}
                          variant="ghost"
                          confirm={`Remove ${name} from ${org.name}? They'll lose access immediately.`}
                        >
                          Remove
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {support.length > 0 && (
        <Card>
          <CardHeader title="EventureOS Support access" subtitle="Temporary access granted by EventureOS to help with a support request. Everything they do is logged." />
          <ul className="divide-y divide-line border-t border-line">
            {support.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px] sm:px-5">
                <span className="min-w-0 break-words font-medium text-ink">{s.user?.full_name ?? s.user?.email}</span>
                <span className="text-ink-muted">Ends {relative(s.expires_at)} ({fmtDateTime(s.expires_at, org.timezone)})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canAdmin && (
        <Card>
          <CardHeader
            title="Invite someone"
            subtitle="They get access automatically when they sign up — or next sign in — with this email address. No email is sent by EventureOS yet, so let them know."
          />
          <div className="border-t border-line px-5 py-5">
            <ActionForm action={inviteMember} resetOnOk>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
                <div>
                  <Label htmlFor="invite_email">Email</Label>
                  <Input id="invite_email" name="email" type="email" required placeholder="name@business.com.au" autoComplete="off" />
                </div>
                <div>
                  <Label htmlFor="invite_role">Role</Label>
                  <Select id="invite_role" name="role" defaultValue="staff">
                    {(["admin", "manager", "staff"] as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                </div>
                <SubmitButton pendingLabel="Inviting…" className="w-full sm:w-auto">Invite</SubmitButton>
              </div>
            </ActionForm>
          </div>
          <div className="border-t border-line">
            <div className="px-5 pb-1 pt-4 text-[12px] font-medium uppercase tracking-wide text-ink-faint">Pending invitations</div>
            {invites.length === 0 ? (
              <EmptyState title="No pending invitations" />
            ) : (
              <ul className="divide-y divide-line">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:flex-wrap sm:px-5">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-ink">{i.email}</div>
                      <div className="text-[12px] text-ink-muted">
                        {ROLE_LABEL[i.role]} · invited {relative(i.created_at)}{i.inviter ? ` by ${i.inviter.full_name ?? i.inviter.email}` : ""}
                      </div>
                    </div>
                    <ActionButton action={revokeInvitation.bind(null, i.id)} variant="ghost" className="h-10 sm:h-8" confirm={`Revoke the invitation for ${i.email}?`}>
                      Revoke
                    </ActionButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="What each role can do" subtitle="Customers never see the staff app — they only use the customer portal." />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-[12.5px] md:min-w-[560px]">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium text-ink-faint md:px-5" />
                {roleOrder.map((r) => (
                  <th key={r} className="px-1.5 py-2.5 text-center font-medium text-ink md:px-3">
                    {ROLE_LABEL[r]}
                    <div className="hidden text-[11px] font-normal text-ink-faint md:block">{ROLE_HINT[r]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PERMISSIONS.map((p) => (
                <tr key={p.label}>
                  <td className="px-4 py-2 text-ink md:px-5">{p.label}</td>
                  {roleOrder.map((r) => {
                    const v = p[r];
                    return (
                      <td key={r} className="px-1.5 py-2 text-center md:px-3">
                        {v === true ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Yes" />
                          : v === "limited" ? <span className="text-[11.5px] text-amber-700">Limited</span>
                          : <Minus className="mx-auto h-4 w-4 text-ink-faint" aria-label="No" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
