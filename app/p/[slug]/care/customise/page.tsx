import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { HOME_TILES, readCare, readPrefs, type HomeTile } from "@/lib/nerdherd/care";
import { Customise } from "@/components/portal/care-forms";
import { requirePortal } from "../../portal-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customise", robots: { index: false, follow: false } };

/** The client chooses what their portal home shows, and in what order. */
export default async function CustomisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, customerIds } = await requirePortal(slug);
  const svc = createServiceClient();
  const [{ data: o }, { data: c }] = await Promise.all([
    svc.from("organisations").select("settings").eq("id", org.id).single(),
    svc.from("customers").select("portal_prefs").eq("id", customerIds[0]).maybeSingle().then((r) => r, () => ({ data: null })),
  ]);
  const prefs = readPrefs((c as { portal_prefs?: unknown } | null)?.portal_prefs);
  const available: HomeTile[] = HOME_TILES.filter((t) => t !== "block" || readCare(o?.settings).enabled);
  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <Link href={`/p/${slug}`} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Your account</Link>
      <div>
        <h1 className="portal-serif text-[2.25rem] font-semibold leading-tight text-ink">Make it yours</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">Put what matters to you first, and hide what you don&apos;t need. Everyone on your account sees the same layout.</p>
      </div>
      <Customise slug={slug} customer={customerIds[0]} order={prefs.order} hidden={prefs.hidden} available={available} />
    </div>
  );
}
