import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { DEFAULT_DESIGN, certDate, readDesign } from "@/lib/bookings/certificate";
import { CertificateBuilder } from "@/components/bookings/certificate-builder";
import { CertificateRow, ManualCertificate } from "@/components/bookings/certificate-tools";

export const dynamic = "force-dynamic";

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const { supabase, org } = await requireOrg();
  const { data: tpl, error } = await supabase.from("booking_certificate_templates").select("design, auto_issue").eq("organisation_id", org.id).eq("is_default", true).maybeSingle();
  if (error) return <Card className="p-6 text-[0.875rem] text-ink-muted">Run the 0050 database update (certificates) in Supabase first.</Card>;
  let cq = supabase.from("booking_certificates").select("id, number, person_name, course_name, completed_on, status, verify_token, created_at", { count: "exact" }).eq("organisation_id", org.id).order("completed_on", { ascending: false }).limit(100);
  if (q) { const like = `%${q.replace(/[%_,()]/g, " ")}%`; cq = cq.or(`person_name.ilike.${like},number.ilike.${like},course_name.ilike.${like}`); }
  const [{ data: certs, count }, { data: courses }, { data: requests }] = await Promise.all([
    cq,
    supabase.from("booking_courses").select("id, name, duration_minutes, active").eq("organisation_id", org.id).order("position"),
    supabase.from("booking_students").select("id, name, email, notes, certificate_requested_at").eq("organisation_id", org.id).not("certificate_requested_at", "is", null).order("certificate_requested_at"),
  ]);
  const design = tpl ? readDesign(tpl.design) : { ...DEFAULT_DESIGN, accent: org.brand_colour && /^#[0-9a-f]{6}$/i.test(org.brand_colour) ? org.brand_colour : DEFAULT_DESIGN.accent };
  const courseList = (courses ?? []) as { id: string; name: string; duration_minutes: number; active: boolean }[];

  return (
    <>
      <PageHeader title="Certificates" subtitle="Design your course certificate. Students download it from their account, and the QR code proves it's genuine." />
      <CertificateBuilder initial={design} autoIssue={tpl ? !!tpl.auto_issue : true} brand={org.brand_colour ?? null} business={org.name} logoUrl={org.logo_url ?? null}
        sampleCourse={(courseList[0]?.name ?? "Barista Course").replace(/\s*\(\d+\s*hrs?\)\s*$/i, "")} hasTemplate={!!tpl} orgId={org.id}
        courses={courseList.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, minutes: c.duration_minutes }))} />

      {(requests ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Asked for a certificate <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.75rem] text-amber-900">{requests!.length}</span></h2>
          <p className="mb-2 text-[0.8125rem] text-ink-muted">Past students with no course on record. Check which course they did, then issue it.</p>
          <div className="space-y-2">
            {(requests as { id: string; name: string; email: string | null; notes: string | null; certificate_requested_at: string }[]).map((r) => (
              <ManualCertificate key={r.id} courses={courseList} student={{ id: r.id, name: r.name, email: r.email, note: r.notes }} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Issued <span className="font-normal text-ink-muted">({count ?? 0})</span></h2>
          <form><input name="q" defaultValue={q} placeholder="Search name or number" className="h-9 w-64 rounded-lg border border-line-strong bg-surface px-3 text-[0.8125rem] text-ink" /></form>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {(certs ?? []).length === 0 ? <Card><EmptyState title={q ? "No matches" : "No certificates yet"}>{q ? "" : "Save a design above to give everyone whose class has finished their certificate."}</EmptyState></Card> : (
            <Card className="divide-y divide-line overflow-hidden">
              {(certs as { id: string; number: string; person_name: string; course_name: string; completed_on: string; status: string; verify_token: string }[]).map((c) => (
                <CertificateRow key={c.id} c={{ ...c, date: certDate(c.completed_on) }} orgSlug={org.slug} />
              ))}
            </Card>
          )}
          <div><ManualCertificate courses={courseList} student={null} /></div>
        </div>
      </section>
    </>
  );
}
