import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { DocList, publicLibraryOrg } from "@/components/portal/doc-list";
import { todayISO } from "@/lib/format";
import { loadLibrary } from "@/lib/documents/library";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents", robots: { index: false, follow: false } };

/** No-login page with the business's public documents (certificate of currency, food licence, artwork templates). */
export default async function PublicDocs({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const org = await publicLibraryOrg(slug, token);
  if (!org) notFound();
  const today = todayISO(org.timezone);
  const docs = (await loadLibrary(createServiceClient(), org.id, { publicOnly: true, current: today })) ?? [];
  return (
    <div>
      <h1 className="text-[1.4375rem] font-semibold tracking-tight text-ink sm:text-[1.625rem]">{org.name} documents</h1>
      <p className="mt-1.5 text-[0.875rem] text-ink-muted">Insurance, licences and artwork templates — tap to download.</p>
      <DocList docs={docs} base={`/p/${slug}/docs/${token}`} />
    </div>
  );
}

