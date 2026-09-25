import { ComingNext } from "@/components/records/coming-next";

export const metadata = { title: "CRM" };

export default function Page() {
  return <ComingNext title="CRM" subtitle="Your pipeline from first enquiry to confirmed booking." items={["Pipeline board: enquiry → quoted → awaiting approval → confirmed", "Drag between stages with the audit trail recorded", "Conversion and win-rate by source"]} />;
}
