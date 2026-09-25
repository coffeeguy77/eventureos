import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBranding } from "../portal-data";
import { portalSignOut } from "../actions";
import { BrandMark } from "../ui";
import { PortalSignInForm } from "./form";

export default async function PortalLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBranding(slug);
  if (!b) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let signedInWithoutAccess: string | null = null;
  if (user) {
    // Already signed in (e.g. returning customer, or a booking was added since last visit): try to link and go straight in.
    const { data } = await supabase.rpc("portal_claim_access", { p_slug: slug });
    if ((data as { linked?: boolean } | null)?.linked) redirect(`/p/${slug}`);
    signedInWithoutAccess = user.email ?? "this account";
  }

  const contact = [b.contact_email, b.contact_phone].filter(Boolean).join(" or ");

  return (
    <div className="mx-auto max-w-[420px]">
      <div className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark name={b.name} logoUrl={b.logo_url} size={48} />
          <h1 className="mt-4 text-[20px] font-semibold tracking-tight text-ink">Your bookings with {b.name}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">
            Sign in with the email address you booked with. We&apos;ll email you a one-time code — no password needed.
          </p>
        </div>

        {signedInWithoutAccess ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 ring-1 ring-inset ring-amber-100">
              You&apos;re signed in as <strong>{signedInWithoutAccess}</strong>, but we couldn&apos;t find any bookings with {b.name} for that email.
              {contact ? ` Please contact ${b.name} (${contact}).` : ""}
            </p>
            <form action={portalSignOut}>
              <input type="hidden" name="slug" value={slug} />
              <button className="h-10 w-full rounded-lg bg-white text-[13.5px] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">
                Sign out and use a different email
              </button>
            </form>
          </div>
        ) : (
          <PortalSignInForm slug={slug} />
        )}
      </div>
      <p className="mt-5 text-center text-[12px] text-ink-faint">
        Your sign-in is private to you. We only show bookings linked to your email address.
      </p>
    </div>
  );
}
