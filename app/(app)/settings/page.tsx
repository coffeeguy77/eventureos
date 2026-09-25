import { requireOrg } from "@/lib/context";
import { Card, CardHeader, Field } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "./forms";
import { updateOrganisation } from "./actions";
import { BUSINESS_TYPES, CURRENCIES, PLAN_LABEL, ROLE_LABEL, TIMEZONES } from "./constants";

export const metadata = { title: "Settings" };

export default async function OrganisationSettingsPage() {
  const { supabase, org, role } = await requireOrg();
  const { data: o, error } = await supabase
    .from("organisations")
    .select("name, slug, business_type, contact_email, contact_phone, address, website, timezone, currency, plan, status, created_at")
    .eq("id", org.id)
    .single();
  if (error) throw new Error(`Could not load organisation: ${error.message}`);

  const canEdit = role === "owner" || role === "admin";
  const businessTypes = o.business_type && !BUSINESS_TYPES.includes(o.business_type) ? [o.business_type, ...BUSINESS_TYPES] : BUSINESS_TYPES;
  const currencies = CURRENCIES.includes(o.currency) ? CURRENCIES : [o.currency, ...CURRENCIES];

  return (
    <>
      <Card>
        <CardHeader
          title="Organisation"
          subtitle="Your business details. These appear on quotes, invoices and the customer portal."
          action={<Badge tone="brand">{PLAN_LABEL[o.plan] ?? o.plan} plan</Badge>}
        />
        {!canEdit && (
          <p className="mx-5 mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] text-ink-muted ring-1 ring-inset ring-line">
            You’re a {ROLE_LABEL[role as keyof typeof ROLE_LABEL]?.toLowerCase() ?? role}, so these details are read-only. Only owners and admins can change them.
          </p>
        )}
        <div className="border-t border-line px-5 py-5">
          {canEdit ? (
            <ActionForm action={updateOrganisation}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">Business name</Label>
                  <Input id="name" name="name" defaultValue={o.name} required maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="business_type">Business type</Label>
                  <Select id="business_type" name="business_type" defaultValue={o.business_type ?? ""}>
                    <option value="">—</option>
                    {businessTypes.map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="contact_email">Contact email</Label>
                  <Input id="contact_email" name="contact_email" type="email" defaultValue={o.contact_email ?? ""} />
                </div>
                <div>
                  <Label htmlFor="contact_phone">Phone</Label>
                  <Input id="contact_phone" name="contact_phone" type="tel" defaultValue={o.contact_phone ?? ""} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea id="address" name="address" rows={2} className="min-h-0" defaultValue={o.address ?? ""} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="website" hint="Optional">Website</Label>
                  <Input id="website" name="website" inputMode="url" placeholder="www.example.com.au" defaultValue={o.website ?? ""} />
                </div>
                <div>
                  <Label htmlFor="timezone" hint="Pick or type any IANA name">Timezone</Label>
                  <Input id="timezone" name="timezone" list="tz-options" defaultValue={o.timezone} required autoComplete="off" />
                  <datalist id="tz-options">
                    {TIMEZONES.map((t) => <option key={t} value={t} />)}
                  </datalist>
                  <p className="mt-1 text-[11.5px] text-ink-faint">Used for dates, “today”, reminders and follow-ups.</p>
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select id="currency" name="currency" defaultValue={o.currency}>
                    {currencies.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                  <p className="mt-1 text-[11.5px] text-ink-faint">Changing currency doesn’t convert existing amounts.</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <dl className="grid gap-5 sm:grid-cols-2">
              <Field label="Business name">{o.name}</Field>
              <Field label="Business type">{o.business_type ?? "—"}</Field>
              <Field label="Contact email">{o.contact_email ?? "—"}</Field>
              <Field label="Phone">{o.contact_phone ?? "—"}</Field>
              <Field label="Address" className="sm:col-span-2"><span className="whitespace-pre-line">{o.address ?? "—"}</span></Field>
              <Field label="Website">{o.website ?? "—"}</Field>
              <Field label="Timezone">{o.timezone}</Field>
              <Field label="Currency">{o.currency}</Field>
            </dl>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Subscription" subtitle="Your plan is managed by EventureOS. Contact support to change it." />
        <dl className="grid gap-5 border-t border-line px-5 py-5 sm:grid-cols-3">
          <Field label="Plan">{PLAN_LABEL[o.plan] ?? o.plan}</Field>
          <Field label="Status"><span className="capitalize">{o.status}</span></Field>
          <Field label="Portal address"><span className="font-mono text-[12.5px]">/p/{o.slug}</span></Field>
        </dl>
      </Card>
    </>
  );
}
