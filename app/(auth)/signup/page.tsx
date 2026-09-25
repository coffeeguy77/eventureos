import Link from "next/link";
import { SignupForm } from "./form";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-muted">You’ll set up your organisation next.</p>
      <SignupForm />
      <p className="mt-6 text-[13px] text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
      </p>
    </>
  );
}
