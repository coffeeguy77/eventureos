import Link from "next/link";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-muted">Sign in to your event business workspace.</p>
      <LoginForm next={sp.next ?? ""} initialError={sp.error} />
      <p className="mt-6 text-[13px] text-ink-muted">
        New to EventureOS?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">Create an account</Link>
      </p>
    </>
  );
}
