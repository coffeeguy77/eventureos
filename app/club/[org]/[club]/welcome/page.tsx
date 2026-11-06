import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { clubCtx } from "@/lib/club/server";
import { WelcomeButton } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome", robots: { index: false, follow: false } };

/** The one-time button from a welcome email / text. A page with a button (not an instant sign-in) so link scanners can't use it up. */
export default async function ClubWelcome({ params, searchParams }: { params: Promise<{ org: string; club: string }>; searchParams: Promise<{ t?: string }> }) {
  const { org, club } = await params;
  const { t } = await searchParams;
  const c = await clubCtx(org, club);
  if (!c) notFound();
  const base = (await headers()).get("x-site-host") ? `/${club}` : `/club/${org}/${club}`;
  const colour = c.org.brand_colour && /^#[0-9a-f]{6}$/i.test(c.org.brand_colour) ? c.org.brand_colour : "#6028EC";
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.org.logo_url && /^https:\/\//.test(c.org.logo_url) ? <img src={c.org.logo_url} alt={c.org.name} className="mx-auto h-12 w-auto object-contain" /> : <p className="text-[1.25rem] font-semibold text-zinc-900">{c.org.name}</p>}
        <p className="mt-5 text-[0.75rem] font-semibold uppercase tracking-[0.08em]" style={{ color: colour }}>{c.s.name}</p>
        <h1 className="mt-1 text-[1.375rem] font-semibold tracking-tight text-zinc-900">{c.account.name}</h1>
        <p className="mt-2 text-[0.9375rem] text-zinc-600">Your booking page with {c.org.name}.</p>
        <WelcomeButton org={org} club={club} token={typeof t === "string" ? t : ""} base={base} colour={colour} />
      </div>
    </main>
  );
}
