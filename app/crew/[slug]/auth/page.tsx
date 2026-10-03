import { FinishSignIn } from "../ui";

export const metadata = { title: "Signing in" };

/** Landing page for the emailed sign-in link. The sign-in happens on a tap/auto-submit, not on page load, so email link scanners can't use up the link. */
export default async function CrewAuth({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ th?: string; t?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <FinishSignIn slug={slug} th={sp.th ?? ""} t={sp.t ?? "magiclink"} />
    </div>
  );
}
