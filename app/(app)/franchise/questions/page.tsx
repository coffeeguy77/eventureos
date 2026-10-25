import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { readQuestions } from "@/lib/franchise/core";
import { QuestionEditor } from "@/components/franchise/question-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Application questions" };

export default async function FranchiseQuestionsPage() {
  const { org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const settings = (org as unknown as { settings: unknown }).settings;
  const custom = !!(settings && typeof settings === "object" && Array.isArray(((settings as Record<string, unknown>).franchise as Record<string, unknown> | undefined)?.questions));
  return (
    <>
      <Link href="/franchise" className="mb-3 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Franchise</Link>
      <PageHeader eyebrow="Franchise" title="Application questions" subtitle="What applicants are asked after you send them the application. Add, change, reorder or remove questions; group them into steps." />
      <QuestionEditor initial={readQuestions(settings)} custom={custom} business={org.name} />
    </>
  );
}
