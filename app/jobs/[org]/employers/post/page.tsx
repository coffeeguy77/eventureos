import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { approvedEmployer } from "@/lib/jobs/guard";
import { POST_COLS, unreadFor, type Post } from "@/lib/jobs/server";
import { card, employerNav, JobsShell } from "@/components/jobs/shell";
import { PostJobForm } from "@/components/jobs/tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post a job", robots: { index: false, follow: false } };

export default async function PostJob({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ id?: string }> }) {
  const { org: slug } = await params;
  const { org, emp } = await approvedEmployer(slug);
  const id = (await searchParams).id;
  const db = createServiceClient();
  let post: Post | null = null;
  if (id) {
    const { data } = /^[0-9a-f-]{36}$/i.test(id) ? await db.from("job_posts").select(POST_COLS).eq("id", id).eq("employer_id", emp.id).maybeSingle() : { data: null };
    if (!data) notFound();
    post = data as Post;
  }
  const unread = await unreadFor(db, "employer", emp.id);
  return (
    <JobsShell org={org} side="employer" nav={employerNav(slug, unread)} wide={false}>
      <Link href={`/jobs/${slug}/employers`} className="mb-4 inline-block text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← Dashboard</Link>
      <h1 className="mb-1 text-[1.625rem] font-bold tracking-tight text-ink">{post ? "Edit job" : "Post a job or shift"}</h1>
      <p className="mb-5 text-[0.9375rem] text-ink-muted">Baristas on the board see it straight away and can message you. Mark it filled when you&apos;ve found someone and it comes off the board.</p>
      <div className={card}>
        <PostJobForm slug={slug} postId={post?.id} defaultSuburb={emp.suburb ?? ""} initial={post ? { title: post.title, kind: post.kind, description: post.description ?? "", suburb: post.suburb ?? "", starts_on: post.starts_on ?? "",
          ends_on: post.ends_on && post.ends_on !== post.starts_on ? post.ends_on : "", times: post.times ?? "", pay: post.pay ?? "", positions: post.positions } : undefined} />
      </div>
    </JobsShell>
  );
}
