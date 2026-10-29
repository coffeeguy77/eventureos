import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "./form";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function NewPasswordPage() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login/code");
  return (
    <>
      <h1 className="text-[1.25rem] font-semibold tracking-tight lg:text-[1.375rem]">Choose a new password</h1>
      <p className="mt-1 text-[0.8438rem] text-ink-muted lg:mt-1.5">You&apos;re signed in as {user.email}. Choose a password you&apos;ll use on your computer and phone.</p>
      <NewPasswordForm />
      <p className="mt-5 text-[0.8125rem] text-ink-muted lg:mt-6"><Link href="/dashboard" className="font-medium text-brand-600 hover:text-brand-700">Skip for now</Link></p>
    </>
  );
}
