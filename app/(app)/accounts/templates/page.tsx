import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TEMPLATES, readTemplates } from "@/lib/accounts/core";
import { TemplatesEditor } from "@/components/accounts/templates-editor";

export const dynamic = "force-dynamic";

export default async function AccountsTemplatesPage() {
  const { supabase, org } = await requireOrg();
  const { data } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Accounts" title="Email templates" subtitle="From a friendly nudge to a final notice. Change the words to sound like you." />
      <TemplatesEditor initial={readTemplates(data?.settings)} defaults={DEFAULT_TEMPLATES} />
    </div>
  );
}
