import { ShieldAlert } from "lucide-react";
import { endSupportSession } from "@/app/admin/actions";
import { relative } from "@/lib/format";

/**
 * Shown across the staff app while an EventureOS platform admin is inside an
 * organisation through a support session (ctx.isSupportSession).
 * Server component — the "End session" button posts to a server action.
 */
export function SupportBanner({ orgId, orgName, expiresAt }: { orgId: string; orgName: string; expiresAt?: string | null }) {
  return (
    <div role="status" className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#FBBF24] px-4 py-1.5 text-[0.7812rem] font-medium text-[#451A03]">
      <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span>
        You’re in <strong>{orgName}</strong> as EventureOS Support — actions are logged.
        {expiresAt && <span className="font-normal"> Access ends {relative(expiresAt)}.</span>}
      </span>
      <form action={endSupportSession.bind(null, orgId)}>
        <button type="submit" className="rounded-md bg-[#451A03] px-2.5 py-0.5 text-[0.75rem] font-semibold text-[#FFFBEB] hover:bg-[#78350F]">
          End session
        </button>
      </form>
    </div>
  );
}
