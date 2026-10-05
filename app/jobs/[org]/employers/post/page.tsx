import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { approvedEmployer } from "@/lib/jobs/guard";
import { POST_COLS, unreadFor, type Post } from "@/lib/jobs/server";
import { EmployerShell, glass } from "@/components/jobs/employer-shell";
import { PostJobDark } from "@/components/jobs/employer-ui";

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
    <EmployerShell org={org} me={{ name: emp.contact_name }} active="post" unread={unread} width="max-w-[1240px]">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,640px)] lg:gap-12">
        <div className="lg:pt-2">
          <Link href={`/jobs/${slug}/employers`} className="inline-flex items-center gap-2.5 text-[0.9375rem] text-white/85 hover:text-white"><ArrowLeft className="h-5 w-5 text-[var(--b)]" />Back to Dashboard</Link>
          <h1 className="mt-10 text-balance text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[3.25rem] xl:whitespace-nowrap xl:text-[3.5rem]">{post ? <>Edit your <span className="text-[var(--b)]">job</span></> : <>Post a job <span className="text-[var(--b)]">or shift</span></>}</h1>
          <p className="mt-4 max-w-[29rem] text-[1.0625rem] leading-relaxed text-white/80 sm:text-[1.125rem]">Find amazing baristas by posting your job, one-off shift, event or ongoing role. Fill in the details below and we&apos;ll get it in front of baristas trained by {org.name}.</p>
        </div>
        <div className={`${glass} p-6 sm:p-8`}>
          <PostJobDark slug={slug} postId={post?.id} defaultSuburb={emp.suburb ?? ""} initial={post ? { title: post.title, kind: post.kind, description: post.description ?? "", suburb: post.suburb ?? "", starts_on: post.starts_on ?? "",
            ends_on: post.ends_on && post.ends_on !== post.starts_on ? post.ends_on : "", times: post.times ?? "", pay: post.pay ?? "", positions: post.positions } : undefined} />
        </div>
      </div>
    </EmployerShell>
  );
}
