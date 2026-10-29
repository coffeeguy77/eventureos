import { requireOrg } from "@/lib/context";
import { appBaseUrl } from "@/lib/integrations/registry";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TERMS, fillTerms, readFees, readTerms } from "@/lib/accounts/core";
import { FeesForm, TermsForm, TidyPhones } from "@/components/accounts/terms-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fees & terms" };

/** Account-keeping fees on overdue invoices, and the terms and conditions of trade that set them out. */
export default async function TermsPage() {
  const { supabase, org, role } = await requireOrg();
  const { data: o } = await supabase.from("organisations").select("name, slug, settings, default_payment_terms_days, contact_email, contact_phone").eq("id", org.id).single();
  const fees = readFees(o?.settings);
  const terms = readTerms(o?.settings);
  const { overrides, ...feeInit } = fees;
  const preview = fillTerms(terms || DEFAULT_TERMS, { business: o?.name ?? org.name, payment_terms: Number(o?.default_payment_terms_days ?? 14) || 14, fees, email: o?.contact_email ?? null, phone: o?.contact_phone ?? null });
  return (
    <>
      <PageHeader eyebrow="Accounts" title="Fees & terms" subtitle="The account-keeping fee for overdue invoices, and the terms and conditions customers agree to." />
      <div className="space-y-5">
        <FeesForm initial={feeInit} customRates={Object.keys(overrides).length} />
        {(role === "owner" || role === "admin") && <TidyPhones />}
        <TermsForm initial={terms} standard={DEFAULT_TERMS} preview={preview} publicUrl={`${appBaseUrl()}/p/${o?.slug as string}/terms`} />
      </div>
    </>
  );
}
