import Link from "next/link";
import { CodeForm } from "./form";

export const metadata = { title: "Forgot your password?" };

export default function LoginCodePage() {
  return (
    <>
      <h1 className="text-[1.25rem] font-semibold tracking-tight lg:text-[1.375rem]">Forgot your password?</h1>
      <p className="mt-1 text-[0.8438rem] text-ink-muted lg:mt-1.5">We&apos;ll email you a one-time code to sign in. Then you can choose a new password.</p>
      <CodeForm />
      <p className="mt-5 text-[0.8125rem] text-ink-muted lg:mt-6"><Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Back to sign in</Link></p>
    </>
  );
}
