import Link from "next/link";
import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/shell/sidebar";
import { AdminNav } from "./admin-nav";

export const metadata = { title: { default: "Platform admin", template: "%s · Platform admin" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSuperAdmin())) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-zinc-950 text-white">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 lg:px-8">
          <Link href="/admin" className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="text-[14px] font-semibold tracking-tight">EventureOS</span>
            <span className="rounded bg-amber-400 px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-amber-950">Platform admin</span>
          </Link>
          <AdminNav />
          <div className="ml-auto flex items-center gap-4 text-[12.5px] text-zinc-400">
            <span className="hidden sm:inline">{user?.email}</span>
            <Link href="/dashboard" className="font-medium text-zinc-200 hover:text-white">Back to app →</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1360px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
