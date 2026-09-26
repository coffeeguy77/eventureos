import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { markPortalThreadRead } from "@/app/(app)/portal/actions";
import { StaffReplyForm } from "./staff-reply-form";

interface Row { id: string; author_type: "customer" | "staff"; author_id: string | null; body: string; created_at: string; read_at: string | null }

/**
 * Staff view of the customer-portal conversation for one event.
 * Server component: loads messages as the signed-in staff member (RLS), renders the thread and a reply form.
 */
export async function StaffPortalMessages({ eventId, customerId, className }: { eventId: string; customerId: string; className?: string }) {
  const { supabase, org } = await requireOrg();
  const [msgRes, custRes, portalRes] = await Promise.all([
    supabase.from("portal_messages").select("id, author_type, author_id, body, created_at, read_at")
      .eq("organisation_id", org.id).eq("event_id", eventId).eq("customer_id", customerId).order("created_at"),
    supabase.from("customers").select("name").eq("id", customerId).eq("organisation_id", org.id).maybeSingle(),
    supabase.from("contacts").select("id", { count: "exact", head: true })
      .eq("organisation_id", org.id).eq("customer_id", customerId).not("portal_user_id", "is", null),
  ]);
  if (msgRes.error) throw new Error(`Could not load portal messages: ${msgRes.error.message}`);
  const rows = (msgRes.data ?? []) as Row[];
  const customerName = custRes.data?.name ?? "Customer";
  const hasPortal = (portalRes.count ?? 0) > 0;

  const authorIds = [...new Set(rows.map((r) => r.author_id).filter(Boolean))] as string[];
  const { data: users } = authorIds.length
    ? await supabase.from("users").select("id, full_name, email").in("id", authorIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const nameOf = (id: string | null) => {
    const u = (users ?? []).find((x) => x.id === id);
    return u ? u.full_name ?? u.email : null;
  };
  const unread = rows.filter((r) => r.author_type === "customer" && !r.read_at).length;

  return (
    <Card className={className}>
      <CardHeader
        title={<span className="flex items-center gap-2">Portal messages {unread > 0 && <Badge tone="red">{unread} unread</Badge>}</span>}
        subtitle={hasPortal
          ? `Conversation with ${customerName} in the customer portal.`
          : `${customerName} hasn't signed in to the portal yet — share your portal link from Customer Portal.`}
        action={unread > 0 ? (
          <form action={markPortalThreadRead}>
            <input type="hidden" name="event_id" value={eventId} />
            <input type="hidden" name="customer_id" value={customerId} />
            <button className="-my-2 py-2 text-[12px] font-medium text-brand-600 hover:text-brand-700 sm:my-0 sm:py-0">Mark as read</button>
          </form>
        ) : undefined}
      />
      <div className="space-y-3 border-t border-line px-4 py-4 sm:px-5">
        {rows.length === 0 && <p className="py-2 text-center text-[12.5px] text-ink-muted">No portal messages for this event yet.</p>}
        {rows.map((m) => {
          const staff = m.author_type === "staff";
          const who = staff ? nameOf(m.author_id) ?? org.name : nameOf(m.author_id) ?? customerName;
          return (
            <div key={m.id} className={cn("flex gap-2.5", staff && "flex-row-reverse")}>
              <Avatar name={who} size={26} />
              <div className={cn("min-w-0 max-w-[85%] rounded-xl px-3.5 py-2 sm:max-w-[80%]", staff ? "bg-brand-50 ring-1 ring-inset ring-brand-100" : "bg-zinc-100")}>
                <p className="whitespace-pre-wrap break-words text-[13px] text-ink">{m.body}</p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  {who}{!staff && " (customer)"} · {fmtDateTime(m.created_at, org.timezone)}
                  {!staff && !m.read_at && <span className="ml-1.5 font-medium text-rose-600">· New</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-line px-4 py-4 sm:px-5">
        <StaffReplyForm eventId={eventId} customerId={customerId} />
      </div>
    </Card>
  );
}
