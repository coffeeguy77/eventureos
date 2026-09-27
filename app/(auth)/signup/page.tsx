import Link from "next/link";
import { SignupForm } from "./form";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ email?: string; org?: string }> }) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sp.email) ? sp.email.slice(0, 254) : "";
  const org = typeof sp.org === "string" ? sp.org.slice(0, 80) : "";
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">{org ? `Join ${org}` : "Create your account"}</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-muted">
        {org ? "Create your account with the email your invitation was sent to — you'll go straight in." : "You’ll set up your organisation next."}
      </p>
      <SignupForm defaultEmail={email} />
      <p className="mt-6 text-[13px] text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
      </p>
    </>
  );
}
