import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBranding } from "../portal-data";
import { portalSignOut } from "../actions";
import { BrandMark } from "../ui";
import { PortalSignInForm } from "./form";
import { agencyMode } from "@/lib/site/agency/server";

export default async function PortalLoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ email?: string; next?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const prefill = typeof sp.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sp.email) ? sp.email.slice(0, 254) : "";
  // Only follow links back into this portal
  const next = typeof sp.next === "string" && sp.next.startsWith(`/p/${slug}/`) && !sp.next.includes("//") ? sp.next : `/p/${slug}`;
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
    if ((data as { linked?: boolean } | null)?.linked) redirect(next);
    signedInWithoutAccess = user.email ?? "this account";
  }

  const contact = [b.contact_email, b.contact_phone].filter(Boolean).join(" or ");
  // Web agencies' clients have websites, invoices and tickets rather than bookings
  const agency = await agencyMode(slug);
  const W = agency
    ? { title: `Sign in to your ${b.name} account`, intro: "Use the email address we send your invoices to. We'll email you a one-time code — no password needed.", none: `we couldn't find a ${b.name} client account for that email`, foot: "Your sign-in is private to you. We only show websites, invoices and requests linked to your email address." }
    : { title: `Your bookings with ${b.name}`, intro: "Sign in with the email address you booked with. We'll email you a one-time code — no password needed.", none: `we couldn't find any bookings with ${b.name} for that email`, foot: "Your sign-in is private to you. We only show bookings linked to your email address." };

  return (
    <div className={agency ? "mx-auto max-w-[460px]" : "mx-auto max-w-[420px]"}>
      <div className={agency ? "rounded-[28px] bg-white p-7 shadow-[0_40px_80px_-40px_rgba(15,11,30,.55)] ring-1 ring-black/5 sm:p-10" : "rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8"}>
        <div className="mb-6 flex flex-col items-center text-center">
          {agency && b.logo_url ? <img src={b.logo_url} alt={b.name} className="h-10 max-w-[240px] object-contain" /> : <BrandMark name={b.name} logoUrl={b.logo_url} size={48} />}
          <h1 className={agency ? "mt-6 text-[1.5rem] font-semibold tracking-[-0.025em] text-ink" : "mt-4 text-[1.25rem] font-semibold tracking-tight text-ink"}>{W.title}</h1>
          <p className="mt-1.5 text-[0.8438rem] text-ink-muted">{W.intro}</p>
        </div>

        {signedInWithoutAccess ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-100">
              You&apos;re signed in as <strong>{signedInWithoutAccess}</strong>, but {W.none}.
              {contact ? ` Please contact ${b.name} (${contact}).` : ""}
            </p>
            <form action={portalSignOut}>
              <input type="hidden" name="slug" value={slug} />
              <button className="h-10 w-full rounded-lg bg-surface text-[0.8438rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">
                Sign out and use a different email
              </button>
            </form>
          </div>
        ) : (
          <PortalSignInForm slug={slug} email={prefill} next={next} />
        )}
      </div>
      <p className="mt-5 text-center text-[0.75rem] text-ink-faint">{W.foot}</p>
    </div>
  );
}
