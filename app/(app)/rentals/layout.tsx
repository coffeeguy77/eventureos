import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RentalsNav } from "@/components/rentals/nav";
import { HireSwitch } from "@/components/rentals/hire-switch";
import { hireOn, orgAppAccess } from "@/lib/apps-server";

export const metadata = { title: "Hire" };

export default async function RentalsLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, role } = await requireOrg();
  if (role === "staff") redirect("/my-jobs");
  const on = hireOn(await orgAppAccess(org.id), org.settings);
  const manager = canManage(role);
  const { count, error } = await supabase.from("hire_bookings").select("id", { count: "exact", head: true })
    .eq("organisation_id", org.id).eq("status", "out").lt("ends_at", new Date().toISOString());
  if (error && /hire_bookings|does not exist|Could not find/i.test(error.message)) {
    return <Card className="p-6 text-[0.875rem] text-ink-muted">Hire needs its database update first: run <span className="font-mono">supabase/migrations/0067_hire.sql</span> in Supabase (SQL editor), then refresh.</Card>;
  }
  if (!on) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader eyebrow="Hire" title="Hire out equipment" subtitle="Items, rates and stock, hire bookings with live availability, deliveries and returns, all joined to your clients, events and invoices." />
        <Card className="space-y-4 p-6 text-[0.875rem] text-ink-muted">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>The cheapest price for any hire length, worked out for you: half day, day and week rates combined, with grace periods and weekends.</li>
            <li>Live stock checks as you quote, including turnaround time between hires. If something&apos;s short, you see who has it, when it&apos;s free and what else could go instead.</li>
            <li>Packages and items that go together (like weights with a marquee) are added for you.</li>
            <li>A Today board for what goes out, what comes back and what&apos;s overdue, with pick lists and return counts.</li>
          </ul>
          {manager ? <HireSwitch on={false} /> : <p>Ask an owner or manager to switch Hire on.</p>}
        </Card>
      </div>
    );
  }
  return (
    <div>
      <RentalsNav overdue={count ?? 0} canManage={manager} />
      {children}
    </div>
  );
}
