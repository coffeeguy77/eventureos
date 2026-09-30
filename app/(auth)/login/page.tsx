import Link from "next/link";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="hidden text-[1.375rem] font-semibold tracking-tight lg:block">Welcome back</h1>
      <p className="mt-1.5 hidden text-[0.8438rem] text-ink-muted lg:block">Sign in to your event business workspace.</p>
      <LoginForm next={sp.next ?? ""} initialError={sp.error} />
      <p className="mt-6 text-[0.8125rem] text-ink-muted">
        New to EventureOS?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">Create an account</Link>
      </p>
    </>
  );
}
