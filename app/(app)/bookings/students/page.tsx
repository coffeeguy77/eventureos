import Link from "next/link";
import { Download } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type St = { id: string; name: string; email: string | null; phone: string | null; marketing_ok: boolean; source: string | null; created_at: string };
type Bk = { student_id: string; status: string; seats: number; session: { starts_at: string } | null; course: { name: string } | null };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(0, parseInt(sp.page ?? "0", 10) || 0);
  let query = supabase.from("booking_students").select("id, name, email, phone, marketing_ok, source, created_at", { count: "exact" }).eq("organisation_id", org.id).order("name").range(page * 100, page * 100 + 99);
  if (q) { const like = `%${q.replace(/[%_,()]/g, " ")}%`; query = query.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`); }
  const { data, count, error } = await query;
  if (error) return <Card className="p-6 text-[0.875rem] text-ink-muted">Run the 0049 database update (bookings) in Supabase first.</Card>;
  const students = (data ?? []) as St[];
  const { data: bks } = students.length ? await supabase.from("bookings").select("student_id, status, seats, session:booking_sessions(starts_at), course:booking_courses(name)").in("student_id", students.map((s) => s.id)).neq("status", "cancelled") : { data: [] };
  const by = new Map<string, Bk[]>();
  for (const b of (bks ?? []) as unknown as Bk[]) by.set(b.student_id, [...(by.get(b.student_id) ?? []), b]);
  const total = count ?? 0;

  return (
    <>
      <PageHeader title="Students" subtitle={`${total} ${total === 1 ? "person has" : "people have"} booked — from the website, the office, Bookly and ClassBento.`}
        actions={<a href={`/bookings/students/export${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={buttonClass("secondary")}><Download className="h-4 w-4" />Download CSV</a>} />
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Search name, email or phone" className="h-10 w-full max-w-md rounded-lg border border-line-strong bg-surface px-3 text-[0.875rem] text-ink" /></form>
      {students.length === 0 ? <Card><EmptyState title={q ? "Nobody matches that search" : "No students yet"}>{q ? "" : "People appear here when they book, or when you copy your bookings across from Bookly (Website & settings)."}</EmptyState></Card> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8125rem]">
              <thead className="border-b border-line bg-zinc-50 text-left text-[0.72rem] uppercase tracking-wide text-ink-faint">
                <tr><th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Contact</th><th className="px-4 py-2 font-medium">Courses</th><th className="px-4 py-2 font-medium">Last</th><th className="px-4 py-2 font-medium">Emails OK</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {students.map((s) => {
                  const list = (by.get(s.id) ?? []).sort((a, b) => (b.session?.starts_at ?? "").localeCompare(a.session?.starts_at ?? ""));
                  const names = [...new Set(list.map((b) => b.course?.name).filter(Boolean))];
                  return (
                    <tr key={s.id} className="align-top">
                      <td className="px-4 py-2.5 font-medium text-ink">{s.name}{s.source && s.source !== "website" && s.source !== "office" ? <span className="ml-2"><Badge tone="slate">{s.source === "classbento" ? "ClassBento" : s.source === "bookly" ? "Bookly" : s.source}</Badge></span> : null}</td>
                      <td className="px-4 py-2.5 text-ink-muted">{s.email && <a href={`mailto:${s.email}`} className="block text-brand-700 hover:underline">{s.email}</a>}{s.phone}</td>
                      <td className="px-4 py-2.5 text-ink">{list.length ? `${list.length} × ` : ""}{names.join(", ") || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{list[0]?.session ? fmtDateTime(list[0].session.starts_at, org.timezone, "date") : "—"}</td>
                      <td className="px-4 py-2.5">{s.marketing_ok ? <Badge tone="green">Yes</Badge> : <span className="text-ink-faint">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {total > 100 && (
        <div className="mt-4 flex items-center justify-between text-[0.8125rem] text-ink-muted">
          <span>{page * 100 + 1}–{Math.min(total, page * 100 + 100)} of {total}</span>
          <span className="flex gap-2">
            {page > 0 && <Link className={buttonClass("secondary", "sm")} href={`/bookings/students?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>Previous</Link>}
            {(page + 1) * 100 < total && <Link className={buttonClass("secondary", "sm")} href={`/bookings/students?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>Next</Link>}
          </span>
        </div>
      )}
    </>
  );
}
