import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Wordmark } from "@/components/shell/sidebar";
import { signOut } from "@/app/(app)/shell-actions";

export const metadata = { title: "Account paused" };

export default async function SuspendedPage() {
  const { memberships, suspended } = await getContext();
  if (memberships.length > 0 || !suspended) redirect("/dashboard");

  return (
    <div className="pt-safe pb-safe flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
      <div className="w-full max-w-[460px]">
        <div className="mb-8">
          <Wordmark height={30} />
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8">
          <h1 className="text-[20px] font-semibold tracking-tight">Your organisation’s account is paused</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
            Access has been paused by EventureOS. Your data is safe and nothing has been deleted.
            Please contact EventureOS support to restore access.
          </p>
          <form action={signOut} className="mt-6">
            <button type="submit" className="h-11 w-full rounded-lg border border-line px-3.5 text-[13px] font-medium hover:bg-canvas sm:h-auto sm:w-auto sm:py-2">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
