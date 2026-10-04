import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { BookingsNav } from "@/components/bookings/sub-nav";

export const metadata = { title: "Bookings" };

export default async function BookingsLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, role } = await requireOrg();
  if (role === "staff") redirect("/my-jobs");
  // Draft invoices from agency bookings waiting to be checked
  const { data } = await supabase.from("bookings").select("invoice:invoices!inner(id, status)").eq("organisation_id", org.id).eq("invoice.status", "draft").limit(100);
  const drafts = data?.length ?? 0;
  return (
    <div>
      <BookingsNav drafts={drafts} />
      {children}
    </div>
  );
}
