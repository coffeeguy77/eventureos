import { redirect } from "next/navigation";
import { crewSession } from "@/lib/crew/server";
import { myNotices } from "@/lib/crew/notices";
import { NewsList } from "./ui";

export const metadata = { title: "News" };
export const dynamic = "force-dynamic";

/** The notice board: news from the office. New ones are marked; some ask for "Got it". */
export default async function NewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await crewSession(slug);
  if (!s) redirect(`/crew/${slug}/login`);
  const notices = await myNotices(s);
  return (
    <div>
      <h1 className="mb-1 text-[1.5rem] font-bold tracking-tight text-ink">News</h1>
      <p className="mb-5 text-[0.875rem] text-ink-muted">Notices from {s.org.name}.</p>
      <NewsList slug={slug} notices={notices} tz={s.org.timezone} />
    </div>
  );
}
