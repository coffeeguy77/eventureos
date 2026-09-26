import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { BrandingEditor } from "./branding-editor";

export const metadata = { title: "Branding & portal" };

export default async function BrandingPage() {
  const { supabase, org, role } = await requireOrg();
  const { data: o, error } = await supabase
    .from("organisations")
    .select("id, name, slug, logo_url, brand_colour, contact_email, contact_phone, website, address")
    .eq("id", org.id)
    .single();
  if (error) throw new Error(`Could not load branding: ${error.message}`);

  return (
    <Card>
      <CardHeader
        title="Branding & customer portal"
        subtitle={<>Customers see this at <span className="font-mono text-[12px]">/p/{o.slug}</span> and on every quote you send.</>}
      />
      <div className="border-t border-line px-4 py-5 sm:px-5">
        <BrandingEditor
          canEdit={role === "owner" || role === "admin"}
          org={{
            id: o.id, name: o.name, logoUrl: o.logo_url, brandColour: o.brand_colour,
            contactEmail: o.contact_email, contactPhone: o.contact_phone, website: o.website, address: o.address,
          }}
        />
      </div>
    </Card>
  );
}
