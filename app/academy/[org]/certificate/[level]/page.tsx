import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { brandStyle } from "@/components/book/shell";
import { PrintButton } from "@/components/academy/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certificate", robots: { index: false, follow: false } };

/** A printable certificate for a finished level. */
export default async function Certificate({ params }: { params: Promise<{ org: string; level: string }> }) {
  const { org: slug, level: key } = await params;
  const { org, me, state, c } = await academy(slug);
  if (!me || !state) redirect(`/academy/${slug}?signin=1#sign-in`);
  const level = c.levels.find((l) => l.key === key);
  if (!level || !level.certificate_title || !state.badges.has(`level-${level.key}`)) notFound();
  const { data: aw } = await createServiceClient().from("learn_badge_awards").select("awarded_at").eq("organisation_id", org.id).eq("student_id", me.id).eq("badge_key", `level-${level.key}`).maybeSingle();
  const { data: full } = await createServiceClient().from("learn_levels").select("certificate_text").eq("id", level.id).maybeSingle();
  const date = new Date((aw?.awarded_at as string) ?? Date.now()).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: org.timezone });
  return (
    <div style={brandStyle(org)} className="min-h-screen bg-zinc-100 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[960px] justify-end gap-2 print:hidden"><PrintButton /></div>
      <div className="mx-auto aspect-[1.414/1] max-w-[960px] rounded-lg border-[10px] border-[var(--b)] bg-white p-[6%] text-center shadow-xl print:shadow-none">
        <div className="flex h-full flex-col items-center justify-center">
          {org.logo_url && /^https:\/\//.test(org.logo_url) ? <img src={org.logo_url} alt={org.name} className="h-16 object-contain" /> : <p className="text-xl font-semibold">{org.name}</p>}
          <p className="mt-6 text-[0.875rem] font-bold uppercase tracking-[0.3em] text-zinc-500">Certificate of completion</p>
          <p className="mt-6 text-[1rem] text-zinc-600">This is to certify that</p>
          <p className="mt-2 text-[2.5rem] font-bold leading-tight text-zinc-900" style={{ fontFamily: "Georgia, serif" }}>{me.name}</p>
          <p className="mt-4 text-[1rem] text-zinc-600">has completed</p>
          <p className="mt-1 text-[1.75rem] font-semibold text-[var(--b)]">{level.certificate_title}</p>
          {full?.certificate_text && <p className="mx-auto mt-3 max-w-xl text-[0.9375rem] text-zinc-600">{full.certificate_text as string}</p>}
          <p className="mt-6 text-[0.9375rem] text-zinc-500">{org.learn.name} · {date}</p>
        </div>
      </div>
    </div>
  );
}
